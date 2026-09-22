import { query, withTransaction } from '../../config/db.js';
import { ApiError } from '../../utils/ApiError.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { logAudit } from '../../utils/auditLog.js';

function slugify(name) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

async function isSlugTaken(slug, excludeId) {
  const { rows } = await query(
    'SELECT 1 FROM categories WHERE slug = $1 AND ($2::uuid IS NULL OR id <> $2)',
    [slug, excludeId ?? null]
  );
  return rows.length > 0;
}

/** Appends -2, -3, ... until unique, so a slug collision never blocks
 *  creation on its own. */
async function generateUniqueSlug(name) {
  const base = slugify(name) || 'category';
  let candidate = base;
  let suffix = 2;
  while (await isSlugTaken(candidate)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  return candidate;
}

/**
 * GET /api/admin/categories
 * admin only. Flat list (the tree is one level deep, so parent_id is
 * enough for the UI to group it) with product and child counts computed
 * in the database, never by counting in JS.
 */
export const listCategories = asyncHandler(async (req, res) => {
  const { rows } = await query(`
    SELECT c.id,
           c.name,
           c.slug,
           c.parent_id,
           p.name AS parent_name,
           c.image_url,
           c.sort_order,
           (SELECT COUNT(*) FROM products pr   WHERE pr.category_id = c.id) AS product_count,
           (SELECT COUNT(*) FROM categories ch WHERE ch.parent_id   = c.id) AS child_count
      FROM categories c
      LEFT JOIN categories p ON p.id = c.parent_id
     ORDER BY (c.parent_id IS NOT NULL), c.sort_order, c.name
  `);

  res.json({ success: true, data: rows });
});

/**
 * GET /api/admin/categories/check-slug?slug=...&excludeId=...
 * admin only. Backs the live uniqueness check in the create form.
 */
export const checkSlug = asyncHandler(async (req, res) => {
  const { slug, excludeId } = req.query;
  const normalised = slugify(slug);
  const taken = await isSlugTaken(normalised, excludeId);
  res.json({ success: true, data: { slug: normalised, available: !taken } });
});

/**
 * One level of nesting only: a category may have a parent, but a category
 * that has a parent may not itself be a parent. Postgres can express the
 * reference (parent_id is a real foreign key again) but not that depth
 * limit, so it stays enforced here.
 */
async function assertValidParent(parentId, selfId) {
  if (selfId && parentId === selfId) {
    throw ApiError.badRequest('A category cannot be its own parent');
  }
  const { rows } = await query('SELECT parent_id FROM categories WHERE id = $1', [parentId]);
  if (rows.length === 0) {
    throw ApiError.badRequest('parentId does not reference an existing category');
  }
  if (rows[0].parent_id) {
    throw ApiError.badRequest(
      'Only one level of nesting is supported — the chosen parent is itself a child category'
    );
  }
}

/**
 * POST /api/admin/categories
 * admin only. Slug is generated server-side (never trusted from the
 * client) and de-duplicated automatically.
 */
export const createCategory = asyncHandler(async (req, res) => {
  const { name, parentId, imageUrl } = req.body;

  const { rows: nameTaken } = await query('SELECT 1 FROM categories WHERE name = $1', [name]);
  if (nameTaken.length > 0) {
    throw ApiError.conflict(`A category named "${name}" already exists`);
  }
  if (parentId) await assertValidParent(parentId);

  const slug = await generateUniqueSlug(name);

  const { rows } = await query(
    `INSERT INTO categories (name, slug, parent_id, image_url, sort_order)
     VALUES ($1, $2, $3, $4,
             -- next position among this category's siblings.
             -- IS NOT DISTINCT FROM, not =, so the top level (parent_id
             -- NULL) groups together instead of matching nothing.
             (SELECT COALESCE(MAX(sort_order), 0) + 1
                FROM categories WHERE parent_id IS NOT DISTINCT FROM $3))
     RETURNING id`,
    [name, slug, parentId ?? null, imageUrl ?? null]
  );
  const id = rows[0].id;

  await logAudit(null, {
    userId: req.user.id,
    action: 'category.created',
    entityType: 'category',
    entityId: id,
    before: null,
    after: { name, slug, parentId: parentId ?? null, imageUrl: imageUrl ?? null },
    ip: req.ip,
  });

  res.status(201).json({ success: true, data: { id, slug } });
});

/**
 * PATCH /api/admin/categories/:id
 * admin only. Rename / change parent / change image — never the slug.
 * Refuses anything that would create a second level of nesting.
 */
export const updateCategory = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { name, parentId, imageUrl } = req.body;

  const { rows: existing } = await query(
    'SELECT name, parent_id, image_url FROM categories WHERE id = $1',
    [id]
  );
  if (existing.length === 0) throw ApiError.notFound('Category not found');
  const category = existing[0];

  if (name !== undefined && name !== category.name) {
    const { rows: clash } = await query(
      'SELECT 1 FROM categories WHERE name = $1 AND id <> $2',
      [name, id]
    );
    if (clash.length > 0) {
      throw ApiError.conflict(`A category named "${name}" already exists`);
    }
  }

  if (parentId) {
    await assertValidParent(parentId, id);
    const { rows: children } = await query('SELECT 1 FROM categories WHERE parent_id = $1', [id]);
    if (children.length > 0) {
      throw ApiError.badRequest(
        'This category has its own child categories — it cannot also become a child (that would create a third level)'
      );
    }
  }

  const before = {
    name: category.name,
    parentId: category.parent_id,
    imageUrl: category.image_url,
  };

  // COALESCE on the parameter, not the column: an omitted field keeps its
  // current value, so the client can send only what changed.
  await query(
    `UPDATE categories
        SET name      = COALESCE($2, name),
            parent_id = CASE WHEN $3::boolean THEN $4::uuid ELSE parent_id END,
            image_url = CASE WHEN $5::boolean THEN $6        ELSE image_url END
      WHERE id = $1`,
    [
      id,
      name ?? null,
      // parentId and imageUrl are nullable fields, so "not sent" and
      // "explicitly set to null" have to be told apart — a flag does
      // that, where COALESCE alone could not.
      parentId !== undefined,
      parentId ?? null,
      imageUrl !== undefined,
      imageUrl ?? null,
    ]
  );

  await logAudit(null, {
    userId: req.user.id,
    action: 'category.updated',
    entityType: 'category',
    entityId: id,
    before,
    after: { name, parentId, imageUrl },
    ip: req.ip,
  });

  res.json({ success: true, data: { id } });
});

/**
 * PATCH /api/admin/categories/:id/reorder
 * admin only. Swaps sort_order with the adjacent sibling (same parent).
 */
export const reorderCategory = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { direction } = req.body;

  const moved = await withTransaction(async (client) => {
    const { rows: own } = await client.query(
      'SELECT parent_id, sort_order FROM categories WHERE id = $1',
      [id]
    );
    if (own.length === 0) throw ApiError.notFound('Category not found');
    const category = own[0];

    const { rows: siblings } = await client.query(
      `SELECT id, sort_order
         FROM categories
        WHERE parent_id IS NOT DISTINCT FROM $1
          AND sort_order ${direction === 'up' ? '<' : '>'} $2
        ORDER BY sort_order ${direction === 'up' ? 'DESC' : 'ASC'}
        LIMIT 1`,
      [category.parent_id, category.sort_order]
    );
    if (siblings.length === 0) return false;

    const sibling = siblings[0];
    await client.query('UPDATE categories SET sort_order = $2 WHERE id = $1', [
      id,
      sibling.sort_order,
    ]);
    await client.query('UPDATE categories SET sort_order = $2 WHERE id = $1', [
      sibling.id,
      category.sort_order,
    ]);
    return true;
  });

  res.json({ success: true, data: { id, moved } });
});

/**
 * DELETE /api/admin/categories/:id
 * admin only. Both foreign-key behaviours the schema declares are also
 * handled explicitly here, so the API answers with a useful message
 * instead of letting a constraint error surface:
 *   - ON DELETE RESTRICT on products.category_id -> refused (409, naming
 *     the count) while any product still uses this category.
 *   - ON DELETE SET NULL on categories.parent_id -> its children become
 *     top-level rather than being orphaned.
 */
export const deleteCategory = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const { rows: existing } = await query('SELECT name, slug FROM categories WHERE id = $1', [id]);
  if (existing.length === 0) throw ApiError.notFound('Category not found');
  const category = existing[0];

  const { rows: counted } = await query(
    'SELECT COUNT(*) AS n FROM products WHERE category_id = $1',
    [id]
  );
  const productCount = counted[0].n;
  if (productCount > 0) {
    throw ApiError.conflict(
      `${productCount} product${productCount === 1 ? '' : 's'} use this category — move ${
        productCount === 1 ? 'it' : 'them'
      } to another category first`,
      { productCount }
    );
  }

  // The ON DELETE SET NULL on parent_id would do this by itself; it is
  // written out so the promotion of children is visible at the call site
  // rather than being an invisible side effect of the delete.
  await withTransaction(async (client) => {
    await client.query('UPDATE categories SET parent_id = NULL WHERE parent_id = $1', [id]);
    await client.query('DELETE FROM categories WHERE id = $1', [id]);
  });

  await logAudit(null, {
    userId: req.user.id,
    action: 'category.deleted',
    entityType: 'category',
    entityId: id,
    before: { name: category.name, slug: category.slug },
    after: null,
    ip: req.ip,
  });

  res.json({ success: true, data: { id } });
});
