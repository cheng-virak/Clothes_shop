import { query, withTransaction } from '../config/db.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { extensionFor } from '../middlewares/upload.middleware.js';
import { storage } from '../storage/index.js';
import { logAudit } from '../utils/auditLog.js';
import { uuid } from '../validators/uuid.js';

const SORT_CLAUSES = {
  newest: 'p.created_at DESC',
  price_asc: 'p.base_price ASC',
  price_desc: 'p.base_price DESC',
  name_asc: 'p.title ASC',
};

/**
 * Variants and images are aggregated into nested JSON by the database,
 * so a product arrives with everything needed to render it in a single
 * round trip, instead of the N+1 that fetching them per product costs.
 */
const VARIANTS_JSON = `
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
      FROM product_variants v
     WHERE v.product_id = p.id
  ), '[]'::json)`;

const IMAGES_JSON = `
  COALESCE((
    SELECT json_agg(json_build_object(
             'id',         i.id,
             'image_url',  i.image_url,
             'is_primary', i.is_primary,
             'sort_order', i.sort_order
           ) ORDER BY i.sort_order, i.id)
      FROM product_images i
     WHERE i.product_id = p.id
  ), '[]'::json)`;

const PRIMARY_IMAGE = `
  (SELECT i.image_url
     FROM product_images i
    WHERE i.product_id = p.id AND i.is_primary
    LIMIT 1)`;

/** Escapes the LIKE wildcards so a shopper typing "50%" searches for the
 *  literal text rather than matching everything. The value itself is
 *  still passed as a bound parameter, never interpolated. */
function likePattern(value) {
  return `%${value.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
}

/** Shared card/list shape. Keys stay snake_case where they already were,
 *  so mapProduct.js on the frontend works unchanged. */
function toListProduct(row) {
  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
    description: row.description,
    base_price: row.base_price,
    category_name: row.category_name,
    category_slug: row.category_slug,
    primary_image: row.primary_image,
    variants: row.variants,
  };
}

/** Shared by the public and admin single-product reads. */
function toDetailProduct(row) {
  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
    description: row.description,
    base_price: row.base_price,
    status: row.status,
    updated_at: row.updated_at,
    category_id: row.category_id,
    category_name: row.category_name,
    category_slug: row.category_slug,
    images: row.images,
    variants: row.variants,
  };
}

/**
 * GET /api/products/colors
 * Public. Distinct colours actually present on active products, so the
 * filter never offers a colour with zero matching products.
 */
export const getProductColors = asyncHandler(async (req, res) => {
  const { rows } = await query(`
    SELECT DISTINCT ON (v.color) v.color AS name, v.color_hex AS hex
      FROM product_variants v
      JOIN products p ON p.id = v.product_id
     WHERE p.status = 'active'
     ORDER BY v.color, v.color_hex
  `);

  res.json({ success: true, data: rows });
});

/**
 * GET /api/products
 * Public. Filters: category (slug), size, colour, price range, search,
 * inStock, plus sort/page/limit.
 */
export const getProducts = asyncHandler(async (req, res) => {
  const { category, size, color, minPrice, maxPrice, search, inStock, sort, page, limit } = req.query;

  const params = [];
  /** Binds a value and returns its placeholder, so no user input is ever
   *  concatenated into the SQL text. */
  const bind = (value) => {
    params.push(value);
    return `$${params.length}`;
  };

  const where = ["p.status = 'active'"];

  // An unknown slug must return nothing, not everything — joining on the
  // slug does that by itself, since no category row matches.
  if (category) where.push(`c.slug = ${bind(category)}`);
  if (minPrice !== undefined) where.push(`p.base_price >= ${bind(minPrice)}`);
  if (maxPrice !== undefined) where.push(`p.base_price <= ${bind(maxPrice)}`);

  if (search) {
    const pattern = bind(likePattern(search));
    where.push(`(p.title ILIKE ${pattern} OR p.description ILIKE ${pattern})`);
  }

  // size/colour/inStock match a product that has AT LEAST ONE variant
  // meeting all of them TOGETHER, which is why they go into a single
  // EXISTS over one variant row rather than three separate conditions —
  // those would match a red product that happens to also come in L.
  if (size || color || inStock) {
    const variantWhere = ['v.product_id = p.id'];
    if (size) variantWhere.push(`v.size = ${bind(size)}`);
    if (color) variantWhere.push(`v.color = ${bind(color)}`);
    if (inStock) variantWhere.push('v.stock_quantity > 0');
    where.push(
      `EXISTS (SELECT 1 FROM product_variants v WHERE ${variantWhere.join(' AND ')})`
    );
  }

  const fromAndWhere = `
      FROM products p
      JOIN categories c ON c.id = p.category_id
     WHERE ${where.join(' AND ')}`;

  // The count runs on the filter params alone; the page adds two more of
  // its own. They get separate arrays on purpose — sharing one and
  // appending to it would hand the count query two parameters its
  // statement has no placeholders for, which Postgres rejects outright.
  const filterParams = [...params];
  const pageParams = [...params, limit, (page - 1) * limit];
  const limitAt = `$${params.length + 1}`;
  const offsetAt = `$${params.length + 2}`;

  const [{ rows: countRows }, { rows }] = await Promise.all([
    query(`SELECT COUNT(*) AS total ${fromAndWhere}`, filterParams),
    query(
      `SELECT p.id, p.title, p.slug, p.description, p.base_price,
              c.name AS category_name,
              c.slug AS category_slug,
              ${PRIMARY_IMAGE} AS primary_image,
              ${VARIANTS_JSON} AS variants
         ${fromAndWhere}
        ORDER BY ${SORT_CLAUSES[sort] ?? SORT_CLAUSES.newest}
        LIMIT ${limitAt} OFFSET ${offsetAt}`,
      pageParams
    ),
  ]);

  const total = countRows[0].total;

  res.json({
    success: true,
    data: rows.map(toListProduct),
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
});

/**
 * GET /api/products/suggest
 * Public. Lightweight as-you-type suggestions for the navbar search box —
 * no count query, no variants payload.
 */
export const suggestProducts = asyncHandler(async (req, res) => {
  const { q, limit } = req.query;

  const { rows } = await query(
    `SELECT p.id, p.title, p.slug, p.base_price, ${PRIMARY_IMAGE} AS primary_image
       FROM products p
      WHERE p.status = 'active' AND p.title ILIKE $1
      ORDER BY p.title
      LIMIT $2`,
    [likePattern(q), limit]
  );

  res.json({ success: true, data: rows });
});

/**
 * GET /api/products/:identifier
 * Public. Accepts the id or the slug. Draft and archived products return a
 * plain 404 — deliberately indistinguishable from a nonexistent product,
 * so this never leaks "exists but isn't published" to a public caller.
 * Admin tooling uses GET /api/admin/products/:id, which ignores status.
 */
export const getProduct = asyncHandler(async (req, res) => {
  const { identifier } = req.params;

  // Matching on the wrong column is not just a miss: passing a slug as a
  // uuid is a type error Postgres rejects outright, so the column is
  // chosen by the shape of what was asked for.
  const column = uuid.safeParse(identifier).success ? 'p.id' : 'p.slug';

  const { rows } = await query(
    `SELECT p.id, p.title, p.slug, p.description, p.base_price, p.status, p.updated_at,
            c.id   AS category_id,
            c.name AS category_name,
            c.slug AS category_slug,
            ${IMAGES_JSON} AS images,
            ${VARIANTS_JSON} AS variants
       FROM products p
       JOIN categories c ON c.id = p.category_id
      WHERE ${column} = $1 AND p.status = 'active'`,
    [identifier]
  );
  if (rows.length === 0) throw ApiError.notFound('Product not found');

  res.json({ success: true, data: toDetailProduct(rows[0]) });
});

/**
 * POST /api/products
 * Admin only. A new product always starts as 'draft' so it's never live
 * on the storefront before it has been reviewed and given photos.
 *
 * The product row and its variants/images are separate tables now, so
 * they are written in one transaction — a product that failed half way
 * through must not be left behind with some of its variants.
 */
export const createProduct = asyncHandler(async (req, res) => {
  const { title, description, categoryId, basePrice, images = [], variants } = req.body;

  const slug = `${title}-${Date.now()}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

  const productId = await withTransaction(async (client) => {
    const { rows: category } = await client.query('SELECT id FROM categories WHERE id = $1', [
      categoryId,
    ]);
    if (category.length === 0) {
      throw ApiError.badRequest('categoryId does not reference an existing category');
    }

    const { rows: created } = await client.query(
      `INSERT INTO products (title, slug, description, base_price, status, category_id)
       VALUES ($1, $2, $3, $4, 'draft', $5)
       RETURNING id`,
      [title, slug, description ?? null, basePrice, categoryId]
    );
    const id = created[0].id;

    // One multi-row INSERT rather than a statement per variant: the
    // placeholder list is generated from the array length, and every
    // value is still bound, never interpolated.
    if (variants.length > 0) {
      const values = [];
      const params = [id];
      for (const v of variants) {
        const base = params.length;
        values.push(`($1, $${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6})`);
        params.push(v.sizeCode, v.colorName, v.colorHex ?? null, v.sku, v.priceOverride ?? null, v.stockQuantity);
      }
      await client.query(
        `INSERT INTO product_variants
           (product_id, size, color, color_hex, sku, price_override, stock_quantity)
         VALUES ${values.join(', ')}`,
        params
      );
    }

    if (images.length > 0) {
      const values = [];
      const params = [id];
      images.forEach((imageUrl, index) => {
        const base = params.length;
        values.push(`($1, $${base + 1}, $${base + 2}, $${base + 3})`);
        params.push(imageUrl, index === 0, index);
      });
      await client.query(
        'INSERT INTO product_images (product_id, image_url, is_primary, sort_order) VALUES ' +
          values.join(', '),
        params
      );
    }

    await logAudit(client, {
      userId: req.user.id,
      action: 'product.created',
      entityType: 'product',
      entityId: id,
      before: null,
      after: { title, categoryId, basePrice, variantCount: variants.length },
      ip: req.ip,
    });

    return id;
  });

  res.status(201).json({ success: true, data: { id: productId, slug } });
});

/**
 * POST /api/products/:id/images
 * Admin only. Accepts one multipart "image" file, stores it (local disk
 * or Vercel Blob — see src/storage/), and appends it to the product's
 * images. The first image a product gets becomes primary automatically.
 */
export const addProductImage = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!req.file) throw ApiError.badRequest('No image file was provided');

  // Checked BEFORE the file is stored: uploading first and discovering
  // the product doesn't exist afterwards would leave an orphaned blob
  // that nothing references and nothing will ever clean up.
  const { rows: product } = await query('SELECT id FROM products WHERE id = $1', [id]);
  if (product.length === 0) throw ApiError.notFound('Product not found');

  const { url: imageUrl } = await storage.save({
    buffer: req.file.buffer,
    extension: extensionFor(req.file.mimetype),
    contentType: req.file.mimetype,
  });

  let created;
  try {
    created = await withTransaction(async (client) => {
      const { rows: counted } = await client.query(
        'SELECT COUNT(*) AS n FROM product_images WHERE product_id = $1',
        [id]
      );
      const isFirst = counted[0].n === 0;

      const { rows } = await client.query(
        `INSERT INTO product_images (product_id, image_url, is_primary, sort_order)
         VALUES ($1, $2, $3, (SELECT COALESCE(MAX(sort_order) + 1, 0) FROM product_images WHERE product_id = $1))
         RETURNING id, is_primary`,
        [id, imageUrl, isFirst]
      );
      return rows[0];
    });
  } catch (err) {
    // The row is the thing that matters; a stored file no row points at
    // is litter. The transaction rolled back, so drop the file too.
    await storage.remove(imageUrl).catch(() => {});
    throw err;
  }

  res.status(201).json({
    success: true,
    data: { id: created.id, image_url: imageUrl, is_primary: created.is_primary },
  });
});

/**
 * DELETE /api/products/:id/images/:imageId
 * Admin only. Removes the row and the file on disk. If the primary image
 * is removed, the next remaining image is promoted so a product is never
 * left with images but no primary.
 */
export const deleteProductImage = asyncHandler(async (req, res) => {
  const { id, imageId } = req.params;

  const imageUrl = await withTransaction(async (client) => {
    const { rows: product } = await client.query('SELECT id FROM products WHERE id = $1', [id]);
    if (product.length === 0) throw ApiError.notFound('Product not found');

    const { rows: deleted } = await client.query(
      'DELETE FROM product_images WHERE id = $1 AND product_id = $2 RETURNING image_url, is_primary',
      [imageId, id]
    );
    if (deleted.length === 0) throw ApiError.notFound('Image not found');

    // Promote only after the delete has happened: uq_images_one_primary
    // allows exactly one primary per product, so setting the new one
    // while the old row still existed would violate it.
    if (deleted[0].is_primary) {
      await client.query(
        `UPDATE product_images SET is_primary = true
          WHERE id = (SELECT id FROM product_images WHERE product_id = $1
                       ORDER BY sort_order, id LIMIT 1)`,
        [id]
      );
    }

    return deleted[0].image_url;
  });

  // Best effort, and deliberately after the transaction commits: a file
  // that fails to delete shouldn't fail the request or resurrect the
  // row, since the database record is what the storefront actually
  // reads. Worst case it leaves an unreferenced file behind.
  await storage.remove(imageUrl).catch(() => {});

  res.json({ success: true, data: { id: imageId } });
});

/**
 * PATCH /api/products/:id/images/:imageId/primary
 * Admin only. Exactly one image per product is primary.
 */
export const setPrimaryProductImage = asyncHandler(async (req, res) => {
  const { id, imageId } = req.params;

  await withTransaction(async (client) => {
    const { rows: image } = await client.query(
      'SELECT id FROM product_images WHERE id = $1 AND product_id = $2',
      [imageId, id]
    );
    if (image.length === 0) {
      const { rows: product } = await client.query('SELECT id FROM products WHERE id = $1', [id]);
      throw ApiError.notFound(product.length === 0 ? 'Product not found' : 'Image not found');
    }

    // Two statements, not one `SET is_primary = (id = $imageId)`: a
    // single UPDATE applies row by row, so it can trip
    // uq_images_one_primary mid-statement even though the end state is
    // valid. Clearing first and setting second never has two at once.
    await client.query(
      'UPDATE product_images SET is_primary = false WHERE product_id = $1 AND is_primary',
      [id]
    );
    await client.query('UPDATE product_images SET is_primary = true WHERE id = $1', [imageId]);
  });

  res.json({ success: true, data: { id: imageId } });
});
