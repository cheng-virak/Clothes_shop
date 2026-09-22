import { pool } from '../config/db.js';

/**
 * Append a record of an admin mutation.
 *
 * `client` is the transaction client when the caller is inside a
 * transaction (so the log commits or rolls back with the change it
 * describes), or null for a standalone write.
 *
 * Callers pass only the fields they intend to log — never a whole row —
 * which is what keeps password hashes and tokens out of the audit trail
 * by construction rather than by after-the-fact redaction.
 */
export async function logAudit(client, { userId, action, entityType, entityId, before, after, ip }) {
  const db = client ?? pool;

  await db.query(
    `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, before, after, ip)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      userId ?? null,
      action,
      entityType,
      entityId != null ? String(entityId) : null,
      // jsonb columns: the driver sends an object as JSON, but a JS null
      // has to stay SQL NULL rather than becoming the JSON literal null.
      before == null ? null : JSON.stringify(before),
      after == null ? null : JSON.stringify(after),
      ip ?? null,
    ]
  );
}
