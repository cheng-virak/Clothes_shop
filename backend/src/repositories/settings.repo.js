import { pool } from '../config/db.js';

/**
 * The store settings singleton (see the CHECK (id = 1) on the table).
 *
 * `client` is the transaction client when the caller is inside one, so
 * the read sees that transaction's own uncommitted writes; omit it for a
 * standalone read.
 *
 * Returns camelCase so callers read `settings.flatShippingFee` rather
 * than carrying column names around.
 */
export async function getSettings(client) {
  const db = client ?? pool;

  let { rows } = await db.query('SELECT * FROM settings WHERE id = 1');

  if (rows.length === 0) {
    // First call on a fresh database. ON CONFLICT DO NOTHING rather than
    // a plain INSERT because two requests can race here, and losing that
    // race should return the row the winner created, not a 500.
    ({ rows } = await db.query(
      'INSERT INTO settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING RETURNING *'
    ));
    if (rows.length === 0) {
      ({ rows } = await db.query('SELECT * FROM settings WHERE id = 1'));
    }
  }

  const row = rows[0];
  return {
    storeName: row.store_name,
    contactEmail: row.contact_email,
    currency: row.currency,
    timezone: row.timezone,
    taxRate: row.tax_rate,
    flatShippingFee: row.flat_shipping_fee,
    freeShippingThreshold: row.free_shipping_threshold,
    lowStockThreshold: row.low_stock_threshold,
  };
}
