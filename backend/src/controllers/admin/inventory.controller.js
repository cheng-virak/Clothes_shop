import { withTransaction } from '../../config/mongo.js';
import { Category, Product, getSettings } from '../../models/index.js';
import { ApiError } from '../../utils/ApiError.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { logAudit } from '../../utils/auditLog.js';

const SORT_CLAUSES = {
  stock_asc: { stock_quantity: 1, _id: 1 },
  stock_desc: { stock_quantity: -1, _id: 1 },
};

/**
 * GET /api/admin/inventory
 * staff or admin. One row per VARIANT (not product) — a size/colour combo
 * is what actually has a stock count, so the embedded variants are
 * $unwind-ed into rows. lowStock/outOfStock compare against the single
 * configured settings.lowStockThreshold. Defaults to stock ascending — the
 * point of this screen is surfacing what's running out first.
 */
export const listInventory = asyncHandler(async (req, res) => {
  const { lowStock, outOfStock, category, sort, page, limit } = req.query;
  const { lowStockThreshold } = await getSettings();

  const productMatch = {};
  if (category) {
    const categoryDoc = await Category.findOne({ slug: category }).select('_id').lean();
    productMatch.category = categoryDoc ? categoryDoc._id : null;
  }

  const variantMatch = {};
  if (outOfStock) variantMatch.stock_quantity = 0;
  else if (lowStock) variantMatch.stock_quantity = { $lte: lowStockThreshold };

  const rowsPipeline = [
    { $match: productMatch },
    { $unwind: '$variants' },
    {
      $project: {
        variant_id: '$variants._id',
        product_id: '$_id',
        product_title: '$title',
        category: 1,
        size: '$variants.size',
        color: '$variants.color',
        sku: '$variants.sku',
        stock_quantity: '$variants.stockQuantity',
      },
    },
    { $match: variantMatch },
  ];

  const [countResult] = await Product.aggregate([...rowsPipeline, { $count: 'total' }]);
  const total = countResult?.total ?? 0;

  const rows = await Product.aggregate([
    ...rowsPipeline,
    { $sort: SORT_CLAUSES[sort] ?? SORT_CLAUSES.stock_asc },
    { $skip: (page - 1) * limit },
    { $limit: limit },
    { $lookup: { from: 'categories', localField: 'category', foreignField: '_id', as: 'categoryDoc' } },
    { $unwind: { path: '$categoryDoc', preserveNullAndEmptyArrays: true } },
  ]);

  const data = rows.map((r) => ({
    variant_id: r.variant_id.toString(),
    product_id: r.product_id.toString(),
    product_title: r.product_title,
    category_name: r.categoryDoc?.name ?? null,
    category_slug: r.categoryDoc?.slug ?? null,
    size: r.size,
    color: r.color,
    sku: r.sku,
    stock_quantity: r.stock_quantity,
  }));

  res.json({
    success: true,
    data,
    meta: { page, limit, total, totalPages: Math.ceil(total / limit), lowStockThreshold },
  });
});

/**
 * POST /api/admin/inventory/import/preview
 * staff or admin. Read-only — looks each SKU up and returns the diff
 * (current vs. proposed stock) without writing anything, so the admin can
 * review exactly what an import will change before committing to it.
 */
export const previewImport = asyncHandler(async (req, res) => {
  const { rows } = req.body;

  const products = await Product.find({ 'variants.sku': { $in: rows.map((r) => r.sku) } }).lean();
  const bySku = new Map();
  for (const product of products) {
    for (const variant of product.variants) {
      bySku.set(variant.sku, { product, variant });
    }
  }

  const results = rows.map((row) => {
    const hit = bySku.get(row.sku);
    if (!hit) return { sku: row.sku, found: false, newStock: row.stockQuantity };
    return {
      sku: row.sku,
      found: true,
      variantId: hit.variant._id.toString(),
      productTitle: hit.product.title,
      size: hit.variant.size,
      color: hit.variant.color,
      currentStock: hit.variant.stockQuantity,
      newStock: row.stockQuantity,
      delta: row.stockQuantity - hit.variant.stockQuantity,
    };
  });

  res.json({ success: true, data: results });
});

/**
 * POST /api/admin/inventory/import/apply
 * staff or admin. Re-validates every SKU fresh (never trusts the preview,
 * which could be stale by the time the admin confirms) inside ONE
 * transaction — any unknown SKU aborts the whole import, so it's all rows
 * or none. Each row's before/after stock is audit-logged individually.
 */
export const applyImport = asyncHandler(async (req, res) => {
  const { rows } = req.body;
  const actorUserId = req.user.id;

  const changes = await withTransaction(async (session) => {
    const applied = [];
    for (const row of rows) {
      const product = await Product.findOne({ 'variants.sku': row.sku }).session(session);
      const variant = product?.variants.find((v) => v.sku === row.sku);
      if (!variant) {
        throw ApiError.badRequest(`Unknown SKU: ${row.sku} — import aborted, nothing was changed`);
      }

      const before = variant.stockQuantity;
      await Product.updateOne(
        { _id: product._id, 'variants._id': variant._id },
        { $set: { 'variants.$.stockQuantity': row.stockQuantity } },
        { session }
      );

      await logAudit(session, {
        userId: actorUserId,
        action: 'inventory.stock_imported',
        entityType: 'product_variant',
        entityId: variant._id.toString(),
        before: { stockQuantity: before },
        after: { stockQuantity: row.stockQuantity },
        ip: req.ip,
      });

      applied.push({ sku: row.sku, variantId: variant._id.toString(), from: before, to: row.stockQuantity });
    }
    return applied;
  });

  res.json({ success: true, data: { updatedCount: changes.length, changes } });
});
