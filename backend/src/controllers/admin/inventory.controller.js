import { query, withTransaction } from '../../config/db.js';
import { getSettings } from '../../repositories/settings.repo.js';
import { ApiError } from '../../utils/ApiError.js';
import { asyncHandler } from '../../utils/asyncHandler.js';

const SORT_CLAUSES = {
  stock_asc: 'v.stock_quantity ASC, v.id ASC',
  stock_desc: 'v.stock_quantity DESC, v.id ASC',
};

/**
 * GET /api/admin/inventory
 * staff or admin. One row per VARIANT (not product) — a size/colour combo
 * is what actually has a stock count, and since variants are a table
 * again that is simply what this selects, with no $unwind needed.
 * lowStock/outOfStock compare against the single configured
 * settings.lowStockThreshold. Defaults to stock ascending — the point of
 * this screen is surfacing what's running out first.
 */
export const listInventory = asyncHandler(async (req, res) => {
  const { lowStock, outOfStock, category, sort, page, limit } = req.query;
  const { lowStockThreshold } = await getSettings();

  const params = [];
  const bind = (value) => {
    params.push(value);
    return `$${params.length}`;
  };

  const where = ['TRUE'];

  if (category) where.push(`c.slug = ${bind(category)}`);
  if (outOfStock) where.push('v.stock_quantity = 0');
  else if (lowStock) where.push(`v.stock_quantity <= ${bind(lowStockThreshold)}`);

  const fromAndWhere = `
      FROM product_variants v
      JOIN products p   ON p.id = v.product_id
      JOIN categories c ON c.id = p.category_id
     WHERE ${where.join(' AND ')}`;

  const filterParams = [...params];
  const pageParams = [...params, limit, (page - 1) * limit];
  const limitAt = `$${params.length + 1}`;
  const offsetAt = `$${params.length + 2}`;

  const [{ rows: countRows }, { rows }] = await Promise.all([
    query(`SELECT COUNT(*) AS total ${fromAndWhere}`, filterParams),
    query(
      `SELECT v.id    AS variant_id,
              p.id    AS product_id,
              p.title AS product_title,
              c.name  AS category_name,
              c.slug  AS category_slug,
              v.size,
              v.color,
              v.sku,
              v.stock_quantity
         ${fromAndWhere}
        ORDER BY ${SORT_CLAUSES[sort] ?? SORT_CLAUSES.stock_asc}
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
 * A CSV import may list the same SKU twice. Collapsing to one entry per
 * SKU, last occurrence winning, keeps the outcome the same as applying
 * the rows in order while letting the whole import run as set-based
 * statements rather than a round trip per row.
 */
function dedupeRows(rows) {
  const bySku = new Map();
  for (const row of rows) bySku.set(row.sku, row.stockQuantity);
  return bySku;
}

/**
 * POST /api/admin/inventory/import/preview
 * staff or admin. Read-only — looks each SKU up and returns the diff
 * (current vs. proposed stock) without writing anything, so the admin can
 * review exactly what an import will change before committing to it.
 */
export const previewImport = asyncHandler(async (req, res) => {
  const { rows } = req.body;
  const bySku = dedupeRows(rows);

  const { rows: found } = await query(
    `SELECT v.id, v.sku, v.size, v.color, v.stock_quantity, p.title AS product_title
       FROM product_variants v
       JOIN products p ON p.id = v.product_id
      WHERE v.sku = ANY($1)`,
    [[...bySku.keys()]]
  );
  const variantBySku = new Map(found.map((v) => [v.sku, v]));

  const results = [...bySku].map(([sku, newStock]) => {
    const hit = variantBySku.get(sku);
    if (!hit) return { sku, found: false, newStock };
    return {
      sku,
      found: true,
      variantId: hit.id,
      productTitle: hit.product_title,
      size: hit.size,
      color: hit.color,
      currentStock: hit.stock_quantity,
      newStock,
      delta: newStock - hit.stock_quantity,
    };
  });

  res.json({ success: true, data: results });
});

/**
 * POST /api/admin/inventory/import/apply
 * staff or admin. Re-validates every SKU fresh (never trusts the preview,
 * which could be stale by the time the admin confirms) inside ONE
 * transaction — any unknown SKU aborts the whole import, so it's all rows
 * or none. Each row's before/after stock is audit-logged individually.
 *
 * An import can carry up to 2000 rows, so this is set-based: four
 * statements regardless of the row count, rather than a lookup, an update
 * and a log per row (which at that size is thousands of round trips to a
 * database on the other side of the network).
 */
export const applyImport = asyncHandler(async (req, res) => {
  const { rows } = req.body;
  const actorUserId = req.user.id;
  const bySku = dedupeRows(rows);
  const skus = [...bySku.keys()];

  const changes = await withTransaction(async (client) => {
    // FOR UPDATE so the before-values reported below are the ones this
    // transaction actually overwrites, not a snapshot another writer
    // changed in between.
    const { rows: current } = await client.query(
      'SELECT id, sku, stock_quantity FROM product_variants WHERE sku = ANY($1) FOR UPDATE',
      [skus]
    );

    const bySkuCurrent = new Map(current.map((v) => [v.sku, v]));
    const unknown = skus.find((sku) => !bySkuCurrent.has(sku));
    if (unknown) {
      throw ApiError.badRequest(`Unknown SKU: ${unknown} — import aborted, nothing was changed`);
    }

    const quantities = skus.map((sku) => bySku.get(sku));

    await client.query(
      `UPDATE product_variants v
          SET stock_quantity = incoming.stock_quantity
         FROM unnest($1::text[], $2::integer[]) AS incoming(sku, stock_quantity)
        WHERE v.sku = incoming.sku`,
      [skus, quantities]
    );

    const applied = skus.map((sku) => ({
      sku,
      variantId: bySkuCurrent.get(sku).id,
      from: bySkuCurrent.get(sku).stock_quantity,
      to: bySku.get(sku),
    }));

    // One INSERT for the whole import rather than a statement per row.
    const values = [];
    const params = [actorUserId, req.ip ?? null];
    for (const change of applied) {
      const base = params.length;
      values.push(
        `($1, 'inventory.stock_imported', 'product_variant', $${base + 1}, $${base + 2}, $${base + 3}, $2)`
      );
      params.push(
        change.variantId,
        JSON.stringify({ stockQuantity: change.from }),
        JSON.stringify({ stockQuantity: change.to })
      );
    }
    await client.query(
      `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, before, after, ip)
       VALUES ${values.join(', ')}`,
      params
    );

    return applied;
  });

  res.json({ success: true, data: { updatedCount: changes.length, changes } });
});
