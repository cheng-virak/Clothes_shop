import { pool } from '../config/db.js';
import { asyncHandler } from '../utils/asyncHandler.js';

/**
 * GET /api/categories
 * Public. Flat list of all categories, including their parent (if any) —
 * the frontend currently uses a hardcoded constant for the 3 top-level
 * categories, but this closes the "promised but 404ing" API gap and is
 * ready for the admin category CRUD / a dynamic filter sidebar later.
 */
export const getCategories = asyncHandler(async (req, res) => {
  const [rows] = await pool.execute(
    `SELECT c.id, c.name, c.slug, c.parent_id, p.slug AS parent_slug
     FROM categories c
     LEFT JOIN categories p ON p.id = c.parent_id
     ORDER BY c.parent_id IS NOT NULL, c.name ASC`
  );

  res.json({ success: true, data: rows });
});
