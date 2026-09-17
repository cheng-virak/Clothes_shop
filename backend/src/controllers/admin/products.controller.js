import { pool } from '../../config/db.js';
import { ApiError } from '../../utils/ApiError.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { logAudit } from '../../utils/auditLog.js';

const SORT_CLAUSES = {
  newest: 'p.updated_at DESC',
  title_asc: 'p.title ASC',
  price_asc: 'min_price ASC',
  price_desc: 'max_price DESC',
  stock_asc: 'total_stock ASC',
  stock_desc: 'total_stock DESC',
};

/**
 * GET /api/admin/products
 * admin only. Unlike the public GET /api/products, this shows every
 * status (draft/active/archived) and aggregates price range + total
 * stock across variants IN SQL — never fetched whole and summed in JS.
 */
export const listAdminProducts = asyncHandler(async (req, res) => {
  const { q, category, status, stockState, sort, page, limit } = req.query;

  const [[{ low_stock_threshold: lowStockThreshold }]] = await pool.execute(
    'SELECT low_stock_threshold FROM settings WHERE id = 1'
  );

  const where = [];
  const params = [];

  if (category) {
    where.push('c.slug = ?');
    params.push(category);
  }
  if (status) {
    where.push('p.status = ?');
    params.push(status);
  }
  if (q) {
    where.push(
      '(p.title LIKE ? OR EXISTS (SELECT 1 FROM product_variants v2 WHERE v2.product_id = p.id AND v2.sku LIKE ?))'
    );
    const like = `%${q}%`;
    params.push(like, like);
  }

  const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const having = [];
  const havingParams = [];
  if (stockState === 'out_of_stock') {
    having.push('total_stock = 0');
  } else if (stockState === 'low_stock') {
    having.push('total_stock > 0 AND total_stock <= ?');
    havingParams.push(lowStockThreshold);
  } else if (stockState === 'in_stock') {
    having.push('total_stock > ?');
    havingParams.push(lowStockThreshold);
  }
  const havingClause = having.length ? `HAVING ${having.join(' AND ')}` : '';

  // Aggregation (price range, total stock) happens once here in SQL and is
  // reused for both the count and the page — counting a GROUP BY/HAVING
  // query means counting the number of GROUPS, so it's wrapped as a
  // subquery rather than a plain COUNT(*) over the joined rows.
  const baseQuery = `
    SELECT p.id,
           COALESCE(SUM(v.stock_quantity), 0) AS total_stock,
           MIN(COALESCE(v.price_override, p.base_price)) AS min_price,
           MAX(COALESCE(v.price_override, p.base_price)) AS max_price
    FROM products p
    JOIN categories c ON c.id = p.category_id
    LEFT JOIN product_variants v ON v.product_id = p.id
    ${whereClause}
    GROUP BY p.id
    ${havingClause}
  `;

  const [countRows] = await pool.execute(
    `SELECT COUNT(*) AS total FROM (${baseQuery}) AS grouped`,
    [...params, ...havingParams]
  );
  const total = countRows[0].total;
  const offset = (page - 1) * limit;
  const orderByClause = SORT_CLAUSES[sort] ?? SORT_CLAUSES.newest;

  const [rows] = await pool.execute(
    `SELECT p.id, p.title, p.slug, p.status, p.updated_at,
            c.name AS category_name, c.slug AS category_slug,
            -- ANY_VALUE: this LEFT JOIN is guaranteed 0-or-1 rows per
            -- product (at most one product_images row has is_primary =
            -- TRUE, enforced by the upload/set-primary endpoints) — but
            -- MySQL's ONLY_FULL_GROUP_BY can't infer that through a JOIN,
            -- so it needs this explicit hint rather than a real aggregate.
            ANY_VALUE(pi.image_url) AS thumbnail,
            COALESCE(SUM(v.stock_quantity), 0) AS total_stock,
            MIN(COALESCE(v.price_override, p.base_price)) AS min_price,
            MAX(COALESCE(v.price_override, p.base_price)) AS max_price
     FROM products p
     JOIN categories c ON c.id = p.category_id
     LEFT JOIN product_images pi ON pi.product_id = p.id AND pi.is_primary = TRUE
     LEFT JOIN product_variants v ON v.product_id = p.id
     ${whereClause}
     GROUP BY p.id
     ${havingClause}
     ORDER BY ${orderByClause}
     LIMIT ${Number(limit)} OFFSET ${Number(offset)}`,
    [...params, ...havingParams]
  );

  res.json({
    success: true,
    data: rows,
    meta: { page, limit, total, totalPages: Math.ceil(total / limit), lowStockThreshold },
  });
});

/**
 * GET /api/admin/products/:id
 * admin only. Status-agnostic lookup (draft/active/archived all work) —
 * the public GET /api/products/:id 404s on anything but 'active' by
 * design, so staff need this separate endpoint to open a draft for
 * editing. Same shape as the public single-product response (product +
 * images + variants), plus `status` for the editor's status control.
 */
export const getAdminProduct = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const [productRows] = await pool.execute(
    `SELECT p.id, p.title, p.slug, p.description, p.base_price, p.status, p.updated_at,
            c.id AS category_id, c.name AS category_name, c.slug AS category_slug
     FROM products p
     JOIN categories c ON c.id = p.category_id
     WHERE p.id = ?
     LIMIT 1`,
    [id]
  );
  const product = productRows[0];
  if (!product) throw ApiError.notFound('Product not found');

  const [images] = await pool.execute(
    `SELECT id, image_url, is_primary, sort_order
     FROM product_images
     WHERE product_id = ?
     ORDER BY sort_order ASC`,
    [product.id]
  );

  const [variants] = await pool.execute(
    `SELECT v.id AS variantId, v.sku, v.stock_quantity AS stockQuantity,
            COALESCE(v.price_override, ?) AS price,
            s.code AS size,
            col.name AS color, col.hex_code AS colorHex
     FROM product_variants v
     JOIN sizes s ON s.id = v.size_id
     JOIN colors col ON col.id = v.color_id
     WHERE v.product_id = ?
     ORDER BY s.id ASC, col.name ASC`,
    [product.base_price, product.id]
  );

  res.json({ success: true, data: { ...product, images, variants } });
});

/**
 * PATCH /api/admin/products/:id
 * admin only. Edits title/description/categoryId/basePrice — never the
 * slug, so existing product URLs never break out from under an edit.
 * Only the fields present in the body are updated.
 */
export const updateProduct = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { title, description, categoryId, basePrice } = req.body;

  const [existingRows] = await pool.execute('SELECT * FROM products WHERE id = ?', [id]);
  const existing = existingRows[0];
  if (!existing) throw ApiError.notFound('Product not found');

  if (categoryId !== undefined) {
    const [categoryRows] = await pool.execute('SELECT id FROM categories WHERE id = ?', [categoryId]);
    if (categoryRows.length === 0) throw ApiError.badRequest('categoryId does not reference an existing category');
  }

  const fields = [];
  const params = [];
  if (title !== undefined) {
    fields.push('title = ?');
    params.push(title);
  }
  if (description !== undefined) {
    fields.push('description = ?');
    params.push(description);
  }
  if (categoryId !== undefined) {
    fields.push('category_id = ?');
    params.push(categoryId);
  }
  if (basePrice !== undefined) {
    fields.push('base_price = ?');
    params.push(basePrice);
  }

  await pool.execute(`UPDATE products SET ${fields.join(', ')} WHERE id = ?`, [...params, id]);

  await logAudit(pool, {
    userId: req.user.id,
    action: 'product.updated',
    entityType: 'product',
    entityId: Number(id),
    before: { title: existing.title, description: existing.description, category_id: existing.category_id, base_price: existing.base_price },
    after: { title, description, categoryId, basePrice },
    ip: req.ip,
  });

  res.json({ success: true, data: { id: Number(id) } });
});

/**
 * PATCH /api/admin/products/:id/variants/:variantId
 * admin only. priceOverride: null clears it back to inheriting the
 * product's base price; omitted leaves it unchanged.
 */
export const updateVariant = asyncHandler(async (req, res) => {
  const { id, variantId } = req.params;
  const { priceOverride, stockQuantity } = req.body;

  const [existingRows] = await pool.execute(
    'SELECT id, price_override, stock_quantity FROM product_variants WHERE id = ? AND product_id = ?',
    [variantId, id]
  );
  const existing = existingRows[0];
  if (!existing) throw ApiError.notFound('Variant not found');

  const fields = [];
  const params = [];
  if (priceOverride !== undefined) {
    fields.push('price_override = ?');
    params.push(priceOverride);
  }
  if (stockQuantity !== undefined) {
    fields.push('stock_quantity = ?');
    params.push(stockQuantity);
  }

  await pool.execute(`UPDATE product_variants SET ${fields.join(', ')} WHERE id = ?`, [...params, variantId]);

  await logAudit(pool, {
    userId: req.user.id,
    action: 'product_variant.updated',
    entityType: 'product_variant',
    entityId: Number(variantId),
    before: { priceOverride: existing.price_override, stockQuantity: existing.stock_quantity },
    after: { priceOverride, stockQuantity },
    ip: req.ip,
  });

  res.json({ success: true, data: { id: Number(variantId) } });
});

/**
 * PATCH /api/admin/products/:id/status
 * admin only. Writes both `status` and the legacy `is_active` boolean —
 * the two are kept in sync per the products.status migration (see
 * backend/sql/migrations/001_add_product_status_up.sql); `is_active`
 * hasn't been dropped yet.
 */
export const updateProductStatus = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  const [existingRows] = await pool.execute('SELECT id, status FROM products WHERE id = ?', [id]);
  const existing = existingRows[0];
  if (!existing) throw ApiError.notFound('Product not found');

  await pool.execute('UPDATE products SET status = ?, is_active = ? WHERE id = ?', [
    status,
    status === 'active',
    id,
  ]);

  await logAudit(pool, {
    userId: req.user.id,
    action: 'product.status_changed',
    entityType: 'product',
    entityId: Number(id),
    before: { status: existing.status },
    after: { status },
    ip: req.ip,
  });

  res.json({ success: true, data: { id: Number(id), status } });
});

/**
 * DELETE /api/admin/products/:id
 * admin only. A real hard delete — distinct from PATCH .../status with
 * 'archived', which is the everyday "remove from the store" action.
 * Allowed even for a product with order history (migration 012): every
 * order_items row already snapshots what was bought (title/sku/size/
 * color/price/qty) independent of the live variant, and nothing in the
 * app joins back through variant_id to render an order, so those orders
 * keep their full displayed detail — they just lose the live
 * back-reference (order_items.variant_id → NULL via ON DELETE SET NULL).
 * The order count is logged to audit_logs precisely because this is
 * capable of quietly detaching real sales history, so there's a durable
 * record of exactly what was deleted and when. Images and variants
 * cascade-delete automatically (both FKs are ON DELETE CASCADE from
 * products).
 */
export const deleteProduct = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const [existingRows] = await pool.execute('SELECT id, title FROM products WHERE id = ?', [id]);
  const existing = existingRows[0];
  if (!existing) throw ApiError.notFound('Product not found');

  const [[{ orderCount }]] = await pool.execute(
    `SELECT COUNT(DISTINCT oi.order_id) AS orderCount
     FROM order_items oi
     JOIN product_variants v ON v.id = oi.variant_id
     WHERE v.product_id = ?`,
    [id]
  );

  await pool.execute('DELETE FROM products WHERE id = ?', [id]);

  await logAudit(pool, {
    userId: req.user.id,
    action: 'product.deleted',
    entityType: 'product',
    entityId: Number(id),
    before: { title: existing.title, orderCount },
    after: null,
    ip: req.ip,
  });

  res.json({ success: true, data: { id: Number(id), orderCount } });
});
