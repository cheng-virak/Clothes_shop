import { Category, Order, Product, getSettings } from '../../models/index.js';
import { ApiError } from '../../utils/ApiError.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { logAudit } from '../../utils/auditLog.js';

const SORT_CLAUSES = {
  newest: { updatedAt: -1 },
  title_asc: { title: 1 },
  price_asc: { minPrice: 1 },
  price_desc: { maxPrice: -1 },
  stock_asc: { totalStock: 1 },
  stock_desc: { totalStock: -1 },
};

/**
 * GET /api/admin/products
 * admin only. Shows every status (draft/active/archived) and aggregates
 * price range + total stock across the embedded variants. The aggregation
 * runs in the database, never by fetching rows and summing in JS.
 */
export const listAdminProducts = asyncHandler(async (req, res) => {
  const { q, category, status, stockState, sort, page, limit } = req.query;
  const settings = await getSettings();
  const lowStockThreshold = settings.lowStockThreshold;

  const match = {};
  if (status) match.status = status;
  if (category) {
    const categoryDoc = await Category.findOne({ slug: category }).select('_id').lean();
    match.category = categoryDoc ? categoryDoc._id : null;
  }
  if (q) {
    const safe = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const rx = new RegExp(safe, 'i');
    match.$or = [{ title: rx }, { 'variants.sku': rx }];
  }

  // Computed once here and reused for both the count and the page, so the
  // stockState filter can be applied to the aggregate rather than the row.
  const computeStage = {
    $addFields: {
      totalStock: { $sum: '$variants.stockQuantity' },
      minPrice: {
        $min: {
          $map: {
            input: { $ifNull: ['$variants', []] },
            as: 'v',
            in: { $ifNull: ['$$v.priceOverride', '$basePrice'] },
          },
        },
      },
      maxPrice: {
        $max: {
          $map: {
            input: { $ifNull: ['$variants', []] },
            as: 'v',
            in: { $ifNull: ['$$v.priceOverride', '$basePrice'] },
          },
        },
      },
    },
  };

  const stockMatch = {};
  if (stockState === 'out_of_stock') stockMatch.totalStock = 0;
  else if (stockState === 'low_stock') stockMatch.totalStock = { $gt: 0, $lte: lowStockThreshold };
  else if (stockState === 'in_stock') stockMatch.totalStock = { $gt: lowStockThreshold };

  const pipeline = [{ $match: match }, computeStage];
  if (Object.keys(stockMatch).length > 0) pipeline.push({ $match: stockMatch });

  const [countResult] = await Product.aggregate([...pipeline, { $count: 'total' }]);
  const total = countResult?.total ?? 0;

  const docs = await Product.aggregate([
    ...pipeline,
    { $sort: SORT_CLAUSES[sort] ?? SORT_CLAUSES.newest },
    { $skip: (page - 1) * limit },
    { $limit: limit },
    { $lookup: { from: 'categories', localField: 'category', foreignField: '_id', as: 'category' } },
    { $unwind: { path: '$category', preserveNullAndEmptyArrays: true } },
  ]);

  const data = docs.map((p) => ({
    id: p._id.toString(),
    title: p.title,
    slug: p.slug,
    status: p.status,
    updated_at: p.updatedAt,
    category_name: p.category?.name ?? null,
    category_slug: p.category?.slug ?? null,
    thumbnail: p.images?.find((i) => i.isPrimary)?.imageUrl ?? null,
    total_stock: p.totalStock ?? 0,
    min_price: p.minPrice ?? p.basePrice,
    max_price: p.maxPrice ?? p.basePrice,
  }));

  res.json({
    success: true,
    data,
    meta: { page, limit, total, totalPages: Math.ceil(total / limit), lowStockThreshold },
  });
});

/**
 * GET /api/admin/products/:id
 * admin only. Status-agnostic (draft/active/archived all work) — the
 * public GET /api/products/:id 404s on anything but 'active', so staff
 * need this to open a draft for editing.
 */
export const getAdminProduct = asyncHandler(async (req, res) => {
  const product = await Product.findById(req.params.id).populate('category', 'name slug');
  if (!product) throw ApiError.notFound('Product not found');

  res.json({
    success: true,
    data: {
      id: product._id.toString(),
      title: product.title,
      slug: product.slug,
      description: product.description,
      base_price: product.basePrice,
      status: product.status,
      updated_at: product.updatedAt,
      category_id: product.category?._id?.toString() ?? null,
      category_name: product.category?.name ?? null,
      category_slug: product.category?.slug ?? null,
      images: product.images
        .slice()
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((i) => ({
          id: i._id.toString(),
          image_url: i.imageUrl,
          is_primary: i.isPrimary,
          sort_order: i.sortOrder,
        })),
      variants: product.variants.map((v) => ({
        variantId: v._id.toString(),
        sku: v.sku,
        stockQuantity: v.stockQuantity,
        price: v.priceOverride ?? product.basePrice,
        size: v.size,
        color: v.color,
        colorHex: v.colorHex,
      })),
    },
  });
});

/**
 * PATCH /api/admin/products/:id
 * admin only. Edits title/description/category/basePrice — never the
 * slug, so existing product URLs never break out from under an edit.
 */
export const updateProduct = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { title, description, categoryId, basePrice } = req.body;

  const product = await Product.findById(id);
  if (!product) throw ApiError.notFound('Product not found');

  if (categoryId !== undefined) {
    const category = await Category.findById(categoryId).lean();
    if (!category) throw ApiError.badRequest('categoryId does not reference an existing category');
    product.category = categoryId;
  }

  const before = {
    title: product.title,
    description: product.description,
    categoryId: product.category?.toString(),
    basePrice: product.basePrice,
  };

  if (title !== undefined) product.title = title;
  if (description !== undefined) product.description = description;
  if (basePrice !== undefined) product.basePrice = basePrice;
  await product.save();

  await logAudit(null, {
    userId: req.user.id,
    action: 'product.updated',
    entityType: 'product',
    entityId: id,
    before,
    after: { title, description, categoryId, basePrice },
    ip: req.ip,
  });

  res.json({ success: true, data: { id } });
});

/**
 * PATCH /api/admin/products/:id/variants/:variantId
 * admin only. priceOverride: null clears it back to inheriting the
 * product's base price; omitted leaves it unchanged.
 */
export const updateVariant = asyncHandler(async (req, res) => {
  const { id, variantId } = req.params;
  const { priceOverride, stockQuantity } = req.body;

  const product = await Product.findById(id);
  if (!product) throw ApiError.notFound('Variant not found');

  const variant = product.variants.id(variantId);
  if (!variant) throw ApiError.notFound('Variant not found');

  const before = { priceOverride: variant.priceOverride, stockQuantity: variant.stockQuantity };

  if (priceOverride !== undefined) variant.priceOverride = priceOverride;
  if (stockQuantity !== undefined) variant.stockQuantity = stockQuantity;
  await product.save();

  await logAudit(null, {
    userId: req.user.id,
    action: 'product_variant.updated',
    entityType: 'product_variant',
    entityId: variantId,
    before,
    after: { priceOverride, stockQuantity },
    ip: req.ip,
  });

  res.json({ success: true, data: { id: variantId } });
});

/**
 * PATCH /api/admin/products/:id/status
 * admin only. draft/active/archived. (The legacy `is_active` boolean the
 * SQL schema kept in sync alongside this doesn't exist in the document
 * model — status is the only source of truth now.)
 */
export const updateProductStatus = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  const product = await Product.findById(id);
  if (!product) throw ApiError.notFound('Product not found');

  const before = { status: product.status };
  product.status = status;
  await product.save();

  await logAudit(null, {
    userId: req.user.id,
    action: 'product.status_changed',
    entityType: 'product',
    entityId: id,
    before,
    after: { status },
    ip: req.ip,
  });

  res.json({ success: true, data: { id, status } });
});

/**
 * DELETE /api/admin/products/:id
 * admin only. A real hard delete, distinct from archiving. Allowed even
 * for a product with order history: every order_items entry is a snapshot
 * that renders without the product, so past orders keep their full
 * detail and simply hold an id that no longer resolves — the same
 * outcome MySQL's ON DELETE SET NULL produced. The order count is logged
 * precisely because this can quietly detach real sales history.
 */
export const deleteProduct = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const product = await Product.findById(id);
  if (!product) throw ApiError.notFound('Product not found');

  const orderCount = await Order.countDocuments({ 'items.productId': id });

  await Product.deleteOne({ _id: id });

  await logAudit(null, {
    userId: req.user.id,
    action: 'product.deleted',
    entityType: 'product',
    entityId: id,
    before: { title: product.title, orderCount },
    after: null,
    ip: req.ip,
  });

  res.json({ success: true, data: { id, orderCount } });
});
