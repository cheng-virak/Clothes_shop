import { Category } from '../models/index.js';
import { asyncHandler } from '../utils/asyncHandler.js';

/**
 * GET /api/categories
 * Public. Flat list of all categories, including their parent (if any).
 * Response keys stay snake_case (parent_id, parent_slug) so the
 * storefront's useCategories hook and the admin's category picker keep
 * working unchanged against the new database.
 */
export const getCategories = asyncHandler(async (req, res) => {
  const categories = await Category.find()
    .populate('parent', 'slug')
    .sort({ parent: 1, name: 1 })
    .lean();

  const data = categories.map((c) => ({
    id: c._id.toString(),
    name: c.name,
    slug: c.slug,
    parent_id: c.parent ? c.parent._id.toString() : null,
    parent_slug: c.parent ? c.parent.slug : null,
  }));

  // Top-level first, then children — the same ordering the SQL
  // `ORDER BY parent_id IS NOT NULL, name` produced.
  data.sort((a, b) => {
    if (!a.parent_id && b.parent_id) return -1;
    if (a.parent_id && !b.parent_id) return 1;
    return a.name.localeCompare(b.name);
  });

  res.json({ success: true, data });
});
