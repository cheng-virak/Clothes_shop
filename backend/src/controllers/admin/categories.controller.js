import { pool } from '../../config/db.js';
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
  const params = excludeId ? [slug, excludeId] : [slug];
  const [rows] = await pool.execute(
    `SELECT id FROM categories WHERE slug = ? ${excludeId ? 'AND id != ?' : ''} LIMIT 1`,
    params
  );
  return rows.length > 0;
}

/** Appends -2, -3, ... until unique, so a name collision (e.g. two
 *  categories both named "Tops") never blocks creation on its own. */
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
 * admin only. Flat list (the tree has only one level, so a flat list with
 * parent_id/parent_name is enough for the UI to group it) with a real SQL
 * product count per category — never counted in JS.
 */
export const listCategories = asyncHandler(async (req, res) => {
  const [rows] = await pool.execute(
    `SELECT c.id, c.name, c.slug, c.parent_id, p.name AS parent_name, c.image_url, c.sort_order,
            (SELECT COUNT(*) FROM products pr WHERE pr.category_id = c.id) AS product_count,
            (SELECT COUNT(*) FROM categories child WHERE child.parent_id = c.id) AS child_count
     FROM categories c
     LEFT JOIN categories p ON p.id = c.parent_id
     ORDER BY c.parent_id IS NOT NULL, c.sort_order ASC, c.name ASC`
  );
  res.json({ success: true, data: rows });
});

/**
 * GET /api/admin/categories/check-slug?slug=...&excludeId=...
 * admin only. Backs the live uniqueness check in the create/rename form.
 * excludeId lets a category check its own current slug without colliding
 * with itself (not used today since slug is immutable post-creation, but
 * the endpoint is written to support it either way).
 */
export const checkSlug = asyncHandler(async (req, res) => {
  const { slug, excludeId } = req.query;
  const taken = await isSlugTaken(slugify(slug), excludeId);
  res.json({ success: true, data: { slug: slugify(slug), available: !taken } });
});

/**
 * POST /api/admin/categories
 * admin only. Slug is generated from the name server-side (never trusts a
 * client-supplied slug) and de-duped automatically. parentId, if given,
 * must reference a TOP-LEVEL category — the schema/UI only support one
 * level of nesting, so a category cannot be created as a grandchild.
 */
export const createCategory = asyncHandler(async (req, res) => {
  const { name, parentId, imageUrl } = req.body;

  // Checked explicitly (rather than letting the UNIQUE constraint on
  // categories.name surface as a generic "record already exists" error)
  // so the admin sees exactly what collided.
  const [nameRows] = await pool.execute('SELECT id FROM categories WHERE name = ?', [name]);
  if (nameRows.length > 0) {
    throw ApiError.conflict(`A category named "${name}" already exists`);
  }

  if (parentId) {
    const [parentRows] = await pool.execute('SELECT id, parent_id FROM categories WHERE id = ?', [parentId]);
    const parent = parentRows[0];
    if (!parent) throw ApiError.badRequest('parentId does not reference an existing category');
    if (parent.parent_id !== null) {
      throw ApiError.badRequest('Only one level of nesting is supported — the chosen parent is itself a child category');
    }
  }

  const slug = await generateUniqueSlug(name);
  const [[{ maxSort }]] = await pool.execute(
    'SELECT COALESCE(MAX(sort_order), 0) AS maxSort FROM categories WHERE parent_id <=> ?',
    [parentId ?? null]
  );

  const [result] = await pool.execute(
    'INSERT INTO categories (name, slug, parent_id, image_url, sort_order) VALUES (?, ?, ?, ?, ?)',
    [name, slug, parentId ?? null, imageUrl ?? null, maxSort + 1]
  );

  await logAudit(pool, {
    userId: req.user.id,
    action: 'category.created',
    entityType: 'category',
    entityId: result.insertId,
    before: null,
    after: { name, slug, parentId: parentId ?? null, imageUrl: imageUrl ?? null },
    ip: req.ip,
  });

  res.status(201).json({ success: true, data: { id: result.insertId, slug } });
});

/**
 * PATCH /api/admin/categories/:id
 * admin only. Rename / change parent / change image — never the slug (see
 * the validator's comment). Refuses anything that would create a second
 * level of nesting: making this category a child of a non-top-level
 * category, self-parenting, or giving a parent to a category that
 * currently has children of its own.
 */
export const updateCategory = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { name, parentId, imageUrl } = req.body;

  const [existingRows] = await pool.execute('SELECT * FROM categories WHERE id = ?', [id]);
  const existing = existingRows[0];
  if (!existing) throw ApiError.notFound('Category not found');

  if (name !== undefined && name !== existing.name) {
    const [nameRows] = await pool.execute('SELECT id FROM categories WHERE name = ? AND id != ?', [name, id]);
    if (nameRows.length > 0) {
      throw ApiError.conflict(`A category named "${name}" already exists`);
    }
  }

  if (parentId !== undefined && parentId !== null) {
    if (Number(parentId) === Number(id)) {
      throw ApiError.badRequest('A category cannot be its own parent');
    }
    const [parentRows] = await pool.execute('SELECT id, parent_id FROM categories WHERE id = ?', [parentId]);
    const parent = parentRows[0];
    if (!parent) throw ApiError.badRequest('parentId does not reference an existing category');
    if (parent.parent_id !== null) {
      throw ApiError.badRequest('Only one level of nesting is supported — the chosen parent is itself a child category');
    }
    const [[{ childCount }]] = await pool.execute(
      'SELECT COUNT(*) AS childCount FROM categories WHERE parent_id = ?',
      [id]
    );
    if (childCount > 0) {
      throw ApiError.badRequest('This category has its own child categories — it cannot also become a child (that would create a third level)');
    }
  }

  const fields = [];
  const params = [];
  if (name !== undefined) {
    fields.push('name = ?');
    params.push(name);
  }
  if (parentId !== undefined) {
    fields.push('parent_id = ?');
    params.push(parentId);
  }
  if (imageUrl !== undefined) {
    fields.push('image_url = ?');
    params.push(imageUrl);
  }

  await pool.execute(`UPDATE categories SET ${fields.join(', ')} WHERE id = ?`, [...params, id]);

  await logAudit(pool, {
    userId: req.user.id,
    action: 'category.updated',
    entityType: 'category',
    entityId: Number(id),
    before: { name: existing.name, parentId: existing.parent_id, imageUrl: existing.image_url },
    after: { name, parentId, imageUrl },
    ip: req.ip,
  });

  res.json({ success: true, data: { id: Number(id) } });
});

/**
 * PATCH /api/admin/categories/:id/reorder
 * admin only. Swaps sort_order with the adjacent sibling (same parent_id)
 * rather than exposing a raw sort_order for the client to set arbitrarily
 * — simple up/down arrows in the UI, no drag-and-drop dependency needed.
 */
export const reorderCategory = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { direction } = req.body;

  const [rows] = await pool.execute('SELECT id, parent_id, sort_order FROM categories WHERE id = ?', [id]);
  const category = rows[0];
  if (!category) throw ApiError.notFound('Category not found');

  const comparator = direction === 'up' ? '<' : '>';
  const orderBy = direction === 'up' ? 'sort_order DESC' : 'sort_order ASC';

  const [siblingRows] = await pool.execute(
    `SELECT id, sort_order FROM categories
     WHERE parent_id <=> ? AND sort_order ${comparator} ?
     ORDER BY ${orderBy}
     LIMIT 1`,
    [category.parent_id, category.sort_order]
  );
  const sibling = siblingRows[0];
  if (!sibling) {
    return res.json({ success: true, data: { id: Number(id), moved: false } });
  }

  await pool.execute('UPDATE categories SET sort_order = ? WHERE id = ?', [sibling.sort_order, id]);
  await pool.execute('UPDATE categories SET sort_order = ? WHERE id = ?', [category.sort_order, sibling.id]);

  res.json({ success: true, data: { id: Number(id), moved: true } });
});

/**
 * DELETE /api/admin/categories/:id
 * admin only. Refused (409, not the raw FK error) if any product still
 * references this category — names the count so the admin can act on it.
 * A category with children is allowed to be deleted; its children become
 * top-level (parent_id NULL) via the FK's ON DELETE SET NULL, matching
 * the schema's existing behavior.
 */
export const deleteCategory = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const [existingRows] = await pool.execute('SELECT * FROM categories WHERE id = ?', [id]);
  const existing = existingRows[0];
  if (!existing) throw ApiError.notFound('Category not found');

  const [[{ productCount }]] = await pool.execute('SELECT COUNT(*) AS productCount FROM products WHERE category_id = ?', [
    id,
  ]);
  if (productCount > 0) {
    throw ApiError.conflict(
      `${productCount} product${productCount === 1 ? '' : 's'} use this category — move ${productCount === 1 ? 'it' : 'them'} to another category first`,
      { productCount }
    );
  }

  await pool.execute('DELETE FROM categories WHERE id = ?', [id]);

  await logAudit(pool, {
    userId: req.user.id,
    action: 'category.deleted',
    entityType: 'category',
    entityId: Number(id),
    before: { name: existing.name, slug: existing.slug },
    after: null,
    ip: req.ip,
  });

  res.json({ success: true, data: { id: Number(id) } });
});
