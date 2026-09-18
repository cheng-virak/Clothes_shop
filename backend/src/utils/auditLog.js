import { AuditLog } from '../models/index.js';

/**
 * Append a record of an admin mutation.
 *
 * `session` is the Mongo session when the caller is inside a transaction
 * (so the log commits or rolls back with the change it describes), or
 * null for a standalone write.
 *
 * Callers pass only the fields they intend to log — never a whole
 * document — which is what keeps password hashes and tokens out of the
 * audit trail by construction rather than by after-the-fact redaction.
 */
export async function logAudit(session, { userId, action, entityType, entityId, before, after, ip }) {
  const doc = {
    user: userId ?? null,
    action,
    entityType,
    entityId: entityId != null ? String(entityId) : null,
    before: before ?? null,
    after: after ?? null,
    ip: ip ?? null,
  };

  if (session) {
    await AuditLog.create([doc], { session });
  } else {
    await AuditLog.create(doc);
  }
}
