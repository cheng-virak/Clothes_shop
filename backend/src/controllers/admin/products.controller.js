import { query, withTransaction } from '../../config/db.js';
import { getSettings } from '../../repositories/settings.repo.js';
import { storage } from '../../storage/index.js';
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

function likePattern(value) {
  return `%${value.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
}

/**
 * GET /api/admin/products
 * admin only. Shows every status (draft/active/archived) and aggregates
 * price range + total stock across the product's variants. The
 * aggregation runs in the database, never by fetching rows and summing
 * in JS.
 *
 * The aggregate is a LATERAL join rather than a subquery per column so
 * the variants are scanned once, and so total_stock/min_price/max_price
 * can be filtered and sorted on by name.
 */
const PRODUCT_AGGREGATE = `
  LEFT JOIN LATERAL (
    SELECT SUM(v.stock_quantity)                            AS total_stock,
           MIN(COALESCE(v.price_override, p.base_price))    AS min_price,
           MAX(COALESCE(v.price_override, p.base_price))    AS max_price
      FROM product_variants v
     WHERE v.product_id = p.id
  ) agg ON TRUE`;

export const listAdminProducts = asyncHandler(async (req, res) => {
  const { q, category, status, stockState, sort, page, limit } = req.query;
  const { lowStockThreshold } = await getSettings();

  const params = [];
  const bind = (value) => {
    params.push(value);
    return `$${params.length}`;
  };

  const where = ['TRUE'];

  if (status) where.push(`p.status = ${bind(status)}`);
  if (category) where.push(`c.slug = ${bind(category)}`);
  if (q) {
    const pattern = bind(likePattern(q));
    where.push(
      `(p.title ILIKE ${pattern}
        OR EXISTS (SELECT 1 FROM product_variants v
                    WHERE v.product_id = p.id AND v.sku ILIKE ${pattern}))`
    );
  }

  // A product with no variants at all has total_stock NULL, which is
  // "out of stock" for this filter's purposes, not "excluded from it".
  const totalStock = 'COALESCE(agg.total_stock, 0)';
  if (stockState === 'out_of_stock') where.push(`${totalStock} = 0`);
  else if (stockState === 'low_stock') {
    where.push(`${totalStock} > 0 AND ${totalStock} <= ${bind(lowStockThreshold)}`);
  } else if (stockState === 'in_stock') {
    where.push(`${totalStock} > ${bind(lowStockThreshold)}`);
  }

  const fromAndWhere = `
      FROM products p
      JOIN categories c ON c.id = p.category_id
      ${PRODUCT_AGGREGATE}
     WHERE ${where.join(' AND ')}`;

  const filterParams = [...params];
  const pageParams = [...params, limit, (page - 1) * limit];
  const limitAt = `$${params.length + 1}`;
  const offsetAt = `$${params.length + 2}`;

  const [{ rows: countRows }, { rows }] = await Promise.all([
    query(`SELECT COUNT(*) AS total ${fromAndWhere}`, filterParams),
    query(
      `SELECT p.id, p.title, p.slug, p.status, p.updated_at,
              c.name AS category_name,
              c.slug AS category_slug,
              (SELECT i.image_url FROM product_images i
                WHERE i.product_id = p.id AND i.is_primary LIMIT 1) AS thumbnail,
              ${totalStock}                        AS total_stock,
              COALESCE(agg.min_price, p.base_price) AS min_price,
              COALESCE(agg.max_price, p.base_price) AS max_price
         ${fromAndWhere}
        ORDER BY ${SORT_CLAUSES[sort] ?? SORT_CLAUSES.newest}
        LIMIT ${limitAt} OFFSET ${offsetAt}`,
      pageParams
    ),
  ]);

  const total = countRows[0].total;

  res.json({
    success: true,
    data: rows,
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
  const { rows } = await query(
    `SELECT p.id, p.title, p.slug, p.description, p.base_price, p.status, p.updated_at,
            c.id   AS category_id,
            c.name AS category_name,
            c.slug AS category_slug,
            COALESCE((
              SELECT json_agg(json_build_object(
                       'id',         i.id,
                       'image_url',  i.image_url,
                       'is_primary', i.is_primary,
                       'sort_order', i.sort_order
                     ) ORDER BY i.sort_order, i.id)
                FROM product_images i WHERE i.product_id = p.id
            ), '[]'::json) AS images,
            COALESCE((
              SELECT json_agg(json_build_object(
                       'variantId',     v.id,
                       'sku',           v.sku,
                       'size',          v.size,
                       'color',         v.color,
                       'colorHex',      v.color_hex,
                       'stockQuantity', v.stock_quantity,
                       'price',         COALESCE(v.price_override, p.base_price)
                     ) ORDER BY v.size, v.color)
                FROM product_variants v WHERE v.product_id = p.id
            ), '[]'::json) AS variants
       FROM products p
       JOIN categories c ON c.id = p.category_id
      WHERE p.id = $1`,
    [req.params.id]
  );
  if (rows.length === 0) throw ApiError.notFound('Product not found');

  res.json({ success: true, data: rows[0] });
});

/**
 * PATCH /api/admin/products/:id
 * admin only. Edits title/description/category/basePrice — never the
 * slug, so existing product URLs never break out from under an edit.
 */
export const updateProduct = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { title, description, categoryId, basePrice } = req.body;

  const { rows: existing } = await query(
    'SELECT title, description, category_id, base_price FROM products WHERE id = $1',
    [id]
  );
  if (existing.length === 0) throw ApiError.notFound('Product not found');
  const product = existing[0];

  if (categoryId !== undefined) {
    const { rows: category } = await query('SELECT id FROM categories WHERE id = $1', [categoryId]);
    if (category.length === 0) {
      throw ApiError.badRequest('categoryId does not reference an existing category');
    }
  }

  const before = {
    title: product.title,
    description: product.description,
    categoryId: product.category_id,
    basePrice: product.base_price,
  };

  await query(
    `UPDATE products
        SET title       = COALESCE($2, title),
            -- description is nullable, so "omitted" and "cleared to null"
            -- need telling apart; the flag does that, COALESCE cannot.
            description = CASE WHEN $3::boolean THEN $4 ELSE description END,
            category_id = COALESCE($5::uuid, category_id),
            base_price  = COALESCE($6::numeric, base_price)
      WHERE id = $1`,
    [
      id,
      title ?? null,
      description !== undefined,
      description ?? null,
      categoryId ?? null,
      basePrice ?? null,
    ]
  );

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

  const { rows: existing } = await query(
    'SELECT price_override, stock_quantity FROM product_variants WHERE id = $1 AND product_id = $2',
    [variantId, id]
  );
  if (existing.length === 0) throw ApiError.notFound('Variant not found');

  const before = {
    priceOverride: existing[0].price_override,
    stockQuantity: existing[0].stock_quantity,
  };

  await query(
    `UPDATE product_variants
        SET price_override = CASE WHEN $2::boolean THEN $3::numeric ELSE price_override END,
            stock_quantity = COALESCE($4::integer, stock_quantity)
      WHERE id = $1`,
    [variantId, priceOverride !== undefined, priceOverride ?? null, stockQuantity ?? null]
  );

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
 * admin only. draft/active/archived — the only source of truth for
 * whether a product is live.
 */
export const updateProductStatus = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  const { rows: existing } = await query('SELECT status FROM products WHERE id = $1', [id]);
  if (existing.length === 0) throw ApiError.notFound('Product not found');

  await query('UPDATE products SET status = $2 WHERE id = $1', [id, status]);

  await logAudit(null, {
    userId: req.user.id,
    action: 'product.status_changed',
    entityType: 'product',
    entityId: id,
    before: { status: existing[0].status },
    after: { status },
    ip: req.ip,
  });

  res.json({ success: true, data: { id, status } });
});

/**
 * DELETE /api/admin/products/:id
 * admin only. A real hard delete, distinct from archiving. Allowed even
 * for a product with order history: every order_items row is a snapshot
 * that renders without the product, so past orders keep their full
 * detail and simply hold an id that no longer resolves — which is
 * exactly what ON DELETE SET NULL on order_items.product_id produces.
 * The order count is logged precisely because this can quietly detach
 * real sales history.
 */
export const deleteProduct = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const { result, imageUrls } = await withTransaction(async (client) => {
    const { rows: existing } = await client.query('SELECT title FROM products WHERE id = $1', [id]);
    if (existing.length === 0) throw ApiError.notFound('Product not found');

    const { rows: counted } = await client.query(
      'SELECT COUNT(DISTINCT order_id) AS n FROM order_items WHERE product_id = $1',
      [id]
    );
    const orderCount = counted[0].n;

    // Collected BEFORE the delete: ON DELETE CASCADE takes the
    // product_images rows with the product, and once they're gone there
    // is nothing left pointing at the stored files, so they could never
    // be found again.
    const { rows: images } = await client.query(
      'SELECT image_url FROM product_images WHERE product_id = $1',
      [id]
    );

    // Variants and images go with it via ON DELETE CASCADE; order_items
    // keep their snapshot and have product_id/variant_id set to NULL.
    await client.query('DELETE FROM products WHERE id = $1', [id]);

    await logAudit(client, {
      userId: req.user.id,
      action: 'product.deleted',
      entityType: 'product',
      entityId: id,
      before: { title: existing[0].title, orderCount },
      after: null,
      ip: req.ip,
    });

    return { result: { id, orderCount }, imageUrls: images.map((i) => i.image_url) };
  });

  // After the commit, and best effort: a file that won't delete must not
  // fail a delete that has already happened, or resurrect the product.
  // Worst case it leaves an unreferenced file behind, which is strictly
  // better than deleting files for a transaction that rolled back.
  for (const imageUrl of imageUrls) {
    await storage.remove(imageUrl).catch(() => {});
  }

  res.json({ success: true, data: result });
});
