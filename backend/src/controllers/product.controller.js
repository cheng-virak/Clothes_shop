import fs from 'node:fs/promises';
import path from 'node:path';
import { pool, withTransaction } from '../config/db.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { UPLOADS_DIR } from '../middlewares/upload.middleware.js';
import { logAudit } from '../utils/auditLog.js';

/**
 * GET /api/products
 * Public. Filters: category (slug), size (code), color (name), minPrice,
 * maxPrice, search (title/description), page, limit.
 *
 * Every filter is applied as a separate parameterized clause — values
 * never touch the SQL string directly, they're always `?` placeholders
 * bound via pool.execute(sql, params).
 */
// Whitelisted ORDER BY fragments — `sort` is a validated zod enum, never
// raw user input, but building SQL by string concatenation always goes
// through a fixed map like this rather than trusting the value directly.
const SORT_CLAUSES = {
  newest: 'p.created_at DESC',
  price_asc: 'p.base_price ASC',
  price_desc: 'p.base_price DESC',
  name_asc: 'p.title ASC',
};

/**
 * GET /api/products/colors
 * Public. Distinct colors actually available on active products — backs
 * the filter sidebar's color options so they never drift from real data
 * (no fabricated list that could offer a color with zero matching products).
 */
export const getProductColors = asyncHandler(async (req, res) => {
  const [rows] = await pool.execute(
    `SELECT DISTINCT col.name, col.hex_code AS hex
     FROM colors col
     JOIN product_variants v ON v.color_id = col.id
     JOIN products p ON p.id = v.product_id AND p.status = 'active'
     ORDER BY col.name ASC`
  );
  res.json({ success: true, data: rows });
});

/**
 * GET /api/products/suggest
 * Public. Lightweight — no COUNT query, no variants JSON, capped at 10 —
 * for the navbar search box's as-you-type dropdown. Distinct from
 * GET /products?search=..., which is the full paginated results page a
 * submitted search lands on; this only ever backs the small suggestion
 * list shown before that submit.
 */
export const suggestProducts = asyncHandler(async (req, res) => {
  const { q, limit } = req.query;
  const like = `%${q}%`;

  const [rows] = await pool.execute(
    `SELECT p.id, p.title, p.slug, p.base_price, pi.image_url AS primary_image
     FROM products p
     LEFT JOIN product_images pi ON pi.product_id = p.id AND pi.is_primary = TRUE
     WHERE p.status = 'active' AND p.title LIKE ?
     ORDER BY p.title ASC
     LIMIT ${Number(limit)}`,
    [like]
  );

  res.json({ success: true, data: rows });
});

export const getProducts = asyncHandler(async (req, res) => {
  const { category, size, color, minPrice, maxPrice, search, inStock, sort, page, limit } =
    req.query;

  const where = ["p.status = 'active'"];
  const params = [];

  if (category) {
    where.push('c.slug = ?');
    params.push(category);
  }

  if (minPrice !== undefined) {
    where.push('p.base_price >= ?');
    params.push(minPrice);
  }

  if (maxPrice !== undefined) {
    where.push('p.base_price <= ?');
    params.push(maxPrice);
  }

  if (search) {
    where.push('(p.title LIKE ? OR p.description LIKE ?)');
    const like = `%${search}%`;
    params.push(like, like);
  }

  // size/color filter against the variants table via EXISTS, so a product
  // matches if it has AT LEAST ONE variant meeting the given size/color —
  // and the outer query still returns one row per product, not per variant.
  if (size || color) {
    const variantConditions = ['v.product_id = p.id'];
    const variantParams = [];
    if (size) {
      variantConditions.push('s.code = ?');
      variantParams.push(size);
    }
    if (color) {
      variantConditions.push('col.name = ?');
      variantParams.push(color);
    }
    where.push(`EXISTS (
      SELECT 1 FROM product_variants v
      JOIN sizes s ON s.id = v.size_id
      JOIN colors col ON col.id = v.color_id
      WHERE ${variantConditions.join(' AND ')}
    )`);
    params.push(...variantParams);
  }

  if (inStock) {
    where.push(
      'EXISTS (SELECT 1 FROM product_variants v2 WHERE v2.product_id = p.id AND v2.stock_quantity > 0)'
    );
  }

  const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const orderByClause = SORT_CLAUSES[sort] ?? SORT_CLAUSES.newest;

  const [countRows] = await pool.execute(
    `SELECT COUNT(*) AS total
     FROM products p
     JOIN categories c ON c.id = p.category_id
     ${whereClause}`,
    params
  );
  const total = countRows[0].total;

  const offset = (page - 1) * limit;

  // LIMIT/OFFSET are validated integers from zod (coerced, bounded), not
  // raw user strings, so it's safe to interpolate them here — mysql2
  // prepared statements don't accept LIMIT/OFFSET as placeholders reliably
  // across all versions, so this is the standard-safe approach.
  const [rows] = await pool.execute(
    `SELECT p.id, p.title, p.slug, p.description, p.base_price,
            c.name AS category_name, c.slug AS category_slug,
            pi.image_url AS primary_image,
            (
              SELECT JSON_ARRAYAGG(
                JSON_OBJECT(
                  'variantId', v.id,
                  'size', s.code,
                  'color', col.name,
                  'colorHex', col.hex_code,
                  'stockQuantity', v.stock_quantity,
                  'price', COALESCE(v.price_override, p.base_price)
                )
              )
              FROM product_variants v
              JOIN sizes s ON s.id = v.size_id
              JOIN colors col ON col.id = v.color_id
              WHERE v.product_id = p.id
            ) AS variants
     FROM products p
     JOIN categories c ON c.id = p.category_id
     LEFT JOIN product_images pi ON pi.product_id = p.id AND pi.is_primary = TRUE
     ${whereClause}
     ORDER BY ${orderByClause}
     LIMIT ${Number(limit)} OFFSET ${Number(offset)}`,
    params
  );

  // JSON_ARRAYAGG returns SQL NULL (not '[]') when a product has zero
  // variants — normalize so the frontend never has to null-check this.
  const data = rows.map((row) => ({ ...row, variants: row.variants ?? [] }));

  res.json({
    success: true,
    data,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  });
});

/**
 * GET /api/products/:identifier
 * Public. Accepts either the numeric product id or its slug — product
 * cards and the detail page's URL both link with the slug (pretty URLs),
 * while an admin tool might already have the numeric id, so both work.
 * Returns the product with all images and all size/color variants
 * (including per-variant stock, so the frontend can disable sold-out combos).
 */
export const getProduct = asyncHandler(async (req, res) => {
  const { identifier } = req.params;
  const isNumericId = /^\d+$/.test(identifier);

  // This filter is new, not a rename — the endpoint previously had no
  // visibility check at all, so a draft or archived product's URL worked
  // exactly like an active one. Public callers now get a plain 404 for
  // both draft and archived, same as a nonexistent id/slug — deliberately
  // indistinguishable, so this never leaks "this product exists but isn't
  // published" to an unauthenticated caller. Admin tooling will need its
  // own status-agnostic lookup once the /api/admin/products namespace
  // exists (not built yet) so staff can still open a draft to edit it.
  const [productRows] = await pool.execute(
    `SELECT p.id, p.title, p.slug, p.description, p.base_price, p.status,
            c.id AS category_id, c.name AS category_name, c.slug AS category_slug
     FROM products p
     JOIN categories c ON c.id = p.category_id
     WHERE (${isNumericId ? 'p.id = ?' : 'p.slug = ?'}) AND p.status = 'active'
     LIMIT 1`,
    [identifier]
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

  // Same field names as the list endpoint's variant summary (variantId,
  // colorHex, stockQuantity) — the frontend maps both responses through
  // one shared util and shouldn't have to know they used to disagree.
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

  res.json({
    success: true,
    data: { ...product, images, variants },
  });
});

/**
 * POST /api/products
 * Admin only. Creates a product with its images and size/color variants
 * in a single transaction — if any variant SKU is invalid or duplicate,
 * nothing is persisted. `images` is an array of already-hosted URLs and
 * may be empty (unlike the rest of the app, which uploads real files via
 * POST /:id/images) — the admin flow is: create the product bare, then
 * land on its editor's Images tab to upload real photos, same as every
 * other product. A new product always starts as 'draft' (both `status`
 * and the legacy `is_active` boolean) regardless of the column defaults,
 * so it's never live on the storefront before the admin has reviewed it
 * and added photos.
 */
export const createProduct = asyncHandler(async (req, res) => {
  const { title, description, categoryId, basePrice, images = [], variants } = req.body;

  const [categoryRows] = await pool.execute('SELECT id FROM categories WHERE id = ? LIMIT 1', [
    categoryId,
  ]);
  if (categoryRows.length === 0) {
    throw ApiError.badRequest('categoryId does not reference an existing category');
  }

  const slug = `${title}-${Date.now()}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

  const productId = await withTransaction(async (conn) => {
    const [productResult] = await conn.execute(
      `INSERT INTO products (category_id, title, slug, description, base_price, status, is_active)
       VALUES (?, ?, ?, ?, ?, 'draft', FALSE)`,
      [categoryId, title, slug, description ?? null, basePrice]
    );
    const newProductId = productResult.insertId;

    for (const [index, imageUrl] of images.entries()) {
      await conn.execute(
        `INSERT INTO product_images (product_id, image_url, is_primary, sort_order)
         VALUES (?, ?, ?, ?)`,
        [newProductId, imageUrl, index === 0, index]
      );
    }

    for (const variant of variants) {
      const [sizeRows] = await conn.execute('SELECT id FROM sizes WHERE code = ? LIMIT 1', [
        variant.sizeCode,
      ]);
      if (sizeRows.length === 0) {
        throw ApiError.badRequest(`Unknown size code: ${variant.sizeCode}`);
      }
      const sizeId = sizeRows[0].id;

      // Find-or-create the color — sizes are a fixed catalog, colors are
      // effectively open-ended per product line.
      let colorId;
      const [colorRows] = await conn.execute('SELECT id FROM colors WHERE name = ? LIMIT 1', [
        variant.colorName,
      ]);
      if (colorRows.length > 0) {
        colorId = colorRows[0].id;
      } else {
        const [colorResult] = await conn.execute(
          'INSERT INTO colors (name, hex_code) VALUES (?, ?)',
          [variant.colorName, variant.colorHex ?? null]
        );
        colorId = colorResult.insertId;
      }

      await conn.execute(
        `INSERT INTO product_variants
           (product_id, size_id, color_id, sku, price_override, stock_quantity)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          newProductId,
          sizeId,
          colorId,
          variant.sku,
          variant.priceOverride ?? null,
          variant.stockQuantity,
        ]
      );
    }

    return newProductId;
  });

  await logAudit(pool, {
    userId: req.user.id,
    action: 'product.created',
    entityType: 'product',
    entityId: productId,
    before: null,
    after: { title, categoryId, basePrice, variantCount: variants.length },
    ip: req.ip,
  });

  res.status(201).json({
    success: true,
    data: { id: productId, slug },
  });
});

/**
 * POST /api/products/:id/images
 * Admin only. Accepts a single multipart "image" file (see
 * upload.middleware.js), saves it under /uploads, and records it as a new
 * product_images row. The first image a product gets is automatically
 * marked primary; later ones are appended as secondary images.
 */
export const addProductImage = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!req.file) {
    throw ApiError.badRequest('No image file was provided');
  }

  const [productRows] = await pool.execute('SELECT id FROM products WHERE id = ? LIMIT 1', [id]);
  if (productRows.length === 0) {
    // Clean up the file already saved to disk before finding out the product doesn't exist.
    await fs.unlink(req.file.path).catch(() => {});
    throw ApiError.notFound('Product not found');
  }

  const [[{ count, maxSortOrder }]] = await pool.execute(
    'SELECT COUNT(*) AS count, COALESCE(MAX(sort_order), -1) AS maxSortOrder FROM product_images WHERE product_id = ?',
    [id]
  );
  const isFirstImage = count === 0;
  const imageUrl = `/uploads/${req.file.filename}`;

  const [result] = await pool.execute(
    `INSERT INTO product_images (product_id, image_url, is_primary, sort_order)
     VALUES (?, ?, ?, ?)`,
    [id, imageUrl, isFirstImage, maxSortOrder + 1]
  );

  res.status(201).json({
    success: true,
    data: { id: result.insertId, imageUrl, isPrimary: isFirstImage, sortOrder: maxSortOrder + 1 },
  });
});

/**
 * DELETE /api/products/:id/images/:imageId
 * Admin only. Removes the DB row and the file on disk. If the deleted
 * image was primary, promotes the next-lowest sort_order image (if any)
 * so the product always ends up with at most one primary image.
 */
export const deleteProductImage = asyncHandler(async (req, res) => {
  const { id, imageId } = req.params;

  const [rows] = await pool.execute(
    'SELECT id, image_url, is_primary FROM product_images WHERE id = ? AND product_id = ? LIMIT 1',
    [imageId, id]
  );
  const image = rows[0];
  if (!image) throw ApiError.notFound('Image not found');

  await withTransaction(async (conn) => {
    await conn.execute('DELETE FROM product_images WHERE id = ?', [imageId]);

    if (image.is_primary) {
      const [next] = await conn.execute(
        'SELECT id FROM product_images WHERE product_id = ? ORDER BY sort_order ASC LIMIT 1',
        [id]
      );
      if (next[0]) {
        await conn.execute('UPDATE product_images SET is_primary = TRUE WHERE id = ?', [
          next[0].id,
        ]);
      }
    }
  });

  // Best-effort file cleanup — a failure here shouldn't fail the request;
  // the DB row (the source of truth for what the API serves) is already gone.
  if (image.image_url.startsWith('/uploads/')) {
    await fs.unlink(path.join(UPLOADS_DIR, path.basename(image.image_url))).catch(() => {});
  }

  res.json({ success: true, data: null });
});

/**
 * PATCH /api/products/:id/images/:imageId/primary
 * Admin only. Marks one image as primary and unmarks all others for that
 * product, in a transaction so there's never a moment with zero or two
 * primary images.
 */
export const setPrimaryProductImage = asyncHandler(async (req, res) => {
  const { id, imageId } = req.params;

  const [rows] = await pool.execute(
    'SELECT id FROM product_images WHERE id = ? AND product_id = ? LIMIT 1',
    [imageId, id]
  );
  if (rows.length === 0) throw ApiError.notFound('Image not found');

  await withTransaction(async (conn) => {
    await conn.execute('UPDATE product_images SET is_primary = FALSE WHERE product_id = ?', [id]);
    await conn.execute('UPDATE product_images SET is_primary = TRUE WHERE id = ?', [imageId]);
  });

  res.json({ success: true, data: null });
});
