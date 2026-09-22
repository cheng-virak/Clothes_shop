import { query } from '../config/db.js';
import { asyncHandler } from '../utils/asyncHandler.js';

/**
 * GET /api/categories
 * Public. Flat list of all categories, including their parent (if any).
 * Response keys stay snake_case (parent_id, parent_slug) so the
 * storefront's useCategories hook and the admin's category picker keep
 * working unchanged.
 */
export const getCategories = asyncHandler(async (req, res) => {
  // Top-level first, then children, each alphabetically — the ordering is
  // back in the database rather than being re-sorted in JS afterwards.
  const { rows } = await query(`
    SELECT c.id,
           c.name,
           c.slug,
           c.parent_id,
           p.slug AS parent_slug
      FROM categories c
      LEFT JOIN categories p ON p.id = c.parent_id
     ORDER BY (c.parent_id IS NOT NULL), c.name
  `);

  res.json({ success: true, data: rows });
});
