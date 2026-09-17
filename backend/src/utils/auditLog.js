/**
 * Writes one audit_logs row. Callers pass exactly the before/after shape
 * they want recorded — this never accepts a raw DB row, so there's no
 * risk of a password_hash or token slipping into the log by accident;
 * the redaction rule is "only pass in what you'd be comfortable showing
 * an admin", enforced by every call site being explicit, not by this
 * function trying to guess what to strip after the fact.
 */
export async function logAudit(conn, { userId, action, entityType, entityId, before, after, ip }) {
  await conn.execute(
    `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, before_json, after_json, ip)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      userId ?? null,
      action,
      entityType,
      entityId,
      before ? JSON.stringify(before) : null,
      after ? JSON.stringify(after) : null,
      ip ?? null,
    ]
  );
}
