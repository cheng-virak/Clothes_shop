import { Category, Product } from '../../models/index.js';
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
  const filter = excludeId ? { slug, _id: { $ne: excludeId } } : { slug };
  return Boolean(await Category.exists(filter));
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
  const [categories, productCounts, childCounts] = await Promise.all([
    Category.find().populate('parent', 'name').lean(),
    Product.aggregate([{ $group: { _id: '$category', n: { $sum: 1 } } }]),
    Category.aggregate([{ $match: { parent: { $ne: null } } }, { $group: { _id: '$parent', n: { $sum: 1 } } }]),
  ]);

  const productsBy = new Map(productCounts.map((r) => [String(r._id), r.n]));
  const childrenBy = new Map(childCounts.map((r) => [String(r._id), r.n]));

  const data = categories
    .map((c) => ({
      id: c._id.toString(),
      name: c.name,
      slug: c.slug,
      parent_id: c.parent ? c.parent._id.toString() : null,
      parent_name: c.parent?.name ?? null,
      image_url: c.imageUrl,
      sort_order: c.sortOrder,
      product_count: productsBy.get(c._id.toString()) ?? 0,
      child_count: childrenBy.get(c._id.toString()) ?? 0,
    }))
    // Top-level first, then by sort order — same as the SQL ORDER BY.
    .sort((a, b) => {
      if (!a.parent_id && b.parent_id) return -1;
      if (a.parent_id && !b.parent_id) return 1;
      return a.sort_order - b.sort_order || a.name.localeCompare(b.name);
    });

  res.json({ success: true, data });
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

/** Mongo has no foreign keys, so the one-level-of-nesting rule the SQL
 *  version checked alongside its FK now lives entirely here. */
async function assertValidParent(parentId, selfId) {
  if (selfId && String(parentId) === String(selfId)) {
    throw ApiError.badRequest('A category cannot be its own parent');
  }
  const parent = await Category.findById(parentId).lean();
  if (!parent) throw ApiError.badRequest('parentId does not reference an existing category');
  if (parent.parent) {
    throw ApiError.badRequest('Only one level of nesting is supported — the chosen parent is itself a child category');
  }
}

/**
 * POST /api/admin/categories
 * admin only. Slug is generated server-side (never trusted from the
 * client) and de-duplicated automatically.
 */
export const createCategory = asyncHandler(async (req, res) => {
  const { name, parentId, imageUrl } = req.body;

  if (await Category.exists({ name })) {
    throw ApiError.conflict(`A category named "${name}" already exists`);
  }
  if (parentId) await assertValidParent(parentId);

  const slug = await generateUniqueSlug(name);
  const last = await Category.findOne({ parent: parentId ?? null }).sort({ sortOrder: -1 }).lean();

  const category = await Category.create({
    name,
    slug,
    parent: parentId ?? null,
    imageUrl: imageUrl ?? null,
    sortOrder: (last?.sortOrder ?? 0) + 1,
  });

  await logAudit(null, {
    userId: req.user.id,
    action: 'category.created',
    entityType: 'category',
    entityId: category._id.toString(),
    before: null,
    after: { name, slug, parentId: parentId ?? null, imageUrl: imageUrl ?? null },
    ip: req.ip,
  });

  res.status(201).json({ success: true, data: { id: category._id.toString(), slug } });
});

/**
 * PATCH /api/admin/categories/:id
 * admin only. Rename / change parent / change image — never the slug.
 * Refuses anything that would create a second level of nesting.
 */
export const updateCategory = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { name, parentId, imageUrl } = req.body;

  const category = await Category.findById(id);
  if (!category) throw ApiError.notFound('Category not found');

  if (name !== undefined && name !== category.name) {
    if (await Category.exists({ name, _id: { $ne: id } })) {
      throw ApiError.conflict(`A category named "${name}" already exists`);
    }
  }

  if (parentId) {
    await assertValidParent(parentId, id);
    if (await Category.exists({ parent: id })) {
      throw ApiError.badRequest(
        'This category has its own child categories — it cannot also become a child (that would create a third level)'
      );
    }
  }

  const before = { name: category.name, parentId: category.parent?.toString() ?? null, imageUrl: category.imageUrl };

  if (name !== undefined) category.name = name;
  if (parentId !== undefined) category.parent = parentId;
  if (imageUrl !== undefined) category.imageUrl = imageUrl;
  await category.save();

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
 * admin only. Swaps sortOrder with the adjacent sibling (same parent).
 */
export const reorderCategory = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { direction } = req.body;

  const category = await Category.findById(id);
  if (!category) throw ApiError.notFound('Category not found');

  const sibling = await Category.findOne({
    parent: category.parent,
    sortOrder: direction === 'up' ? { $lt: category.sortOrder } : { $gt: category.sortOrder },
  }).sort({ sortOrder: direction === 'up' ? -1 : 1 });

  if (!sibling) {
    return res.json({ success: true, data: { id, moved: false } });
  }

  const own = category.sortOrder;
  category.sortOrder = sibling.sortOrder;
  sibling.sortOrder = own;
  await Promise.all([category.save(), sibling.save()]);

  res.json({ success: true, data: { id, moved: true } });
});

/**
 * DELETE /api/admin/categories/:id
 * admin only. Both behaviours MySQL's foreign keys used to provide are
 * reproduced here explicitly:
 *   - ON DELETE RESTRICT on products.category_id -> refused (409, naming
 *     the count) while any product still uses this category.
 *   - ON DELETE SET NULL on categories.parent_id -> its children become
 *     top-level rather than being orphaned.
 */
export const deleteCategory = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const category = await Category.findById(id).lean();
  if (!category) throw ApiError.notFound('Category not found');

  const productCount = await Product.countDocuments({ category: id });
  if (productCount > 0) {
    throw ApiError.conflict(
      `${productCount} product${productCount === 1 ? '' : 's'} use this category — move ${
        productCount === 1 ? 'it' : 'them'
      } to another category first`,
      { productCount }
    );
  }

  await Category.updateMany({ parent: id }, { $set: { parent: null } });
  await Category.deleteOne({ _id: id });

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
