import { pool, withTransaction } from '../../config/db.js';
import { ApiError } from '../../utils/ApiError.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { logAudit } from '../../utils/auditLog.js';

const SORT_CLAUSES = {
  stock_asc: 'v.stock_quantity ASC',
  stock_desc: 'v.stock_quantity DESC',
};

/**
 * GET /api/admin/inventory
 * staff or admin. One row per VARIANT (not product) — a size/color combo
 * is what actually has a stock count. lowStock/outOfStock compare against
 * settings.low_stock_threshold (the one configured value, not a
 * per-variant column). Defaults to stock ascending — the point of this
 * screen is surfacing what's running out first.
 */
export const listInventory = asyncHandler(async (req, res) => {
  const { lowStock, outOfStock, category, sort, page, limit } = req.query;

  const [[{ low_stock_threshold: lowStockThreshold }]] = await pool.execute(
    'SELECT low_stock_threshold FROM settings WHERE id = 1'
  );

  const where = [];
  const params = [];
  if (outOfStock) {
    where.push('v.stock_quantity = 0');
  } else if (lowStock) {
    where.push('v.stock_quantity <= ?');
    params.push(lowStockThreshold);
  }
  if (category) {
    where.push('c.slug = ?');
    params.push(category);
  }
  const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const orderByClause = SORT_CLAUSES[sort] ?? SORT_CLAUSES.stock_asc;

  const [countRows] = await pool.execute(
    `SELECT COUNT(*) AS total
     FROM product_variants v
     JOIN products p ON p.id = v.product_id
     JOIN categories c ON c.id = p.category_id
     ${whereClause}`,
    params
  );
  const total = countRows[0].total;
  const offset = (page - 1) * limit;

  const [rows] = await pool.execute(
    `SELECT v.id AS variant_id, p.id AS product_id, p.title AS product_title,
            c.name AS category_name, c.slug AS category_slug,
            s.code AS size, col.name AS color, v.sku, v.stock_quantity
     FROM product_variants v
     JOIN products p ON p.id = v.product_id
     JOIN categories c ON c.id = p.category_id
     JOIN sizes s ON s.id = v.size_id
     JOIN colors col ON col.id = v.color_id
     ${whereClause}
     ORDER BY ${orderByClause}
     LIMIT ${Number(limit)} OFFSET ${Number(offset)}`,
    params
  );

  res.json({
    success: true,
    data: rows,
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

  const results = [];
  for (const row of rows) {
    const [variantRows] = await pool.execute(
      `SELECT v.id AS variant_id, v.stock_quantity, p.title AS product_title, s.code AS size, col.name AS color
       FROM product_variants v
       JOIN products p ON p.id = v.product_id
       JOIN sizes s ON s.id = v.size_id
       JOIN colors col ON col.id = v.color_id
       WHERE v.sku = ?
       LIMIT 1`,
      [row.sku]
    );
    const variant = variantRows[0];
    if (!variant) {
      results.push({ sku: row.sku, found: false, newStock: row.stockQuantity });
      continue;
    }
    results.push({
      sku: row.sku,
      found: true,
      variantId: variant.variant_id,
      productTitle: variant.product_title,
      size: variant.size,
      color: variant.color,
      currentStock: variant.stock_quantity,
      newStock: row.stockQuantity,
      delta: row.stockQuantity - variant.stock_quantity,
    });
  }

  res.json({ success: true, data: results });
});

/**
 * POST /api/admin/inventory/import/apply
 * staff or admin. Re-validates every SKU fresh (never trusts the preview
 * response, which could be stale by the time the admin confirms) inside
 * ONE transaction — any unknown SKU aborts the whole import, so it's all
 * rows or none, never a partial apply. Each row's before/after stock is
 * written to audit_logs individually.
 */
export const applyImport = asyncHandler(async (req, res) => {
  const { rows } = req.body;
  const actorUserId = req.user.id;

  const changes = await withTransaction(async (conn) => {
    const applied = [];
    for (const row of rows) {
      const [variantRows] = await conn.execute(
        'SELECT id, stock_quantity FROM product_variants WHERE sku = ? FOR UPDATE',
        [row.sku]
      );
      const variant = variantRows[0];
      if (!variant) {
        throw ApiError.badRequest(`Unknown SKU: ${row.sku} — import aborted, nothing was changed`);
      }

      await conn.execute('UPDATE product_variants SET stock_quantity = ? WHERE id = ?', [
        row.stockQuantity,
        variant.id,
      ]);

      await logAudit(conn, {
        userId: actorUserId,
        action: 'inventory.stock_imported',
        entityType: 'product_variant',
        entityId: variant.id,
        before: { stockQuantity: variant.stock_quantity },
        after: { stockQuantity: row.stockQuantity },
        ip: req.ip,
      });

      applied.push({ sku: row.sku, variantId: variant.id, from: variant.stock_quantity, to: row.stockQuantity });
    }
    return applied;
  });

  res.json({ success: true, data: { updatedCount: changes.length, changes } });
});
