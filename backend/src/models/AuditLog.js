import mongoose from 'mongoose';

/**
 * Append-only record of admin mutations. `before`/`after` were JSON
 * columns in MySQL and are Mixed here — callers pass only the fields they
 * intend to log (never a whole row), which is what keeps password hashes
 * and tokens out of the log by construction rather than by redaction.
 */
const auditLogSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    action: { type: String, required: true },
    entityType: { type: String, required: true },
    entityId: { type: String, default: null },
    before: { type: mongoose.Schema.Types.Mixed, default: null },
    after: { type: mongoose.Schema.Types.Mixed, default: null },
    ip: { type: String, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

auditLogSchema.index({ createdAt: -1 });
auditLogSchema.index({ entityType: 1, entityId: 1 });

export const AuditLog = mongoose.model('AuditLog', auditLogSchema);
