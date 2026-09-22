import { ZodError } from 'zod';
import { MulterError } from 'multer';
import { ApiError } from '../utils/ApiError.js';
import { env } from '../config/env.js';

export function notFoundHandler(req, res) {
  res.status(404).json({
    success: false,
    message: `Route not found: ${req.method} ${req.originalUrl}`,
  });
}

/**
 * Postgres reports the offending column in `detail`, e.g.
 * `Key (email)=(a@b.test) already exists.` — that's more precise than the
 * constraint name (`users_email_key`) and needs no lookup table, so it's
 * tried first. Only the column name is used; the VALUE is deliberately
 * not echoed back, since it can be another customer's email address.
 */
function violatingColumn(err) {
  const fromDetail = /^Key \(([^)]+)\)=/.exec(err.detail ?? '');
  if (fromDetail) return fromDetail[1].split(',')[0].trim();
  // Fall back to trimming the conventional `<table>_<column>_key` suffix.
  const fromConstraint = /^[a-z_]+?_([a-z_]+)_key$/.exec(err.constraint ?? '');
  return fromConstraint ? fromConstraint[1] : null;
}

/**
 * Single place that turns any thrown error into a consistent JSON shape.
 * Must be registered last, after all routes.
 */
// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  // Known, intentional application error
  if (err instanceof ApiError) {
    return res.status(err.statusCode).json({
      success: false,
      message: err.message,
      details: err.details ?? undefined,
    });
  }

  // Request validation error (zod)
  if (err instanceof ZodError) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      details: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    });
  }

  // Upload rejected (wrong field name, too many files, over the size limit)
  if (err instanceof MulterError) {
    const message =
      err.code === 'LIMIT_FILE_SIZE' ? 'Image must be 5MB or smaller' : err.message;
    return res.status(400).json({ success: false, message });
  }

  // Postgres constraint violations. The database is the last line of
  // defence behind the controllers' own checks, so reaching one of these
  // is usually a race (two requests claiming the same SKU at once)
  // rather than a bug — a clean 4xx, not a 500.
  switch (err.code) {
    // unique_violation — email, slug, sku, order_number, one primary image.
    case '23505': {
      const column = violatingColumn(err);
      return res.status(409).json({
        success: false,
        message: column
          ? `That ${column.replace(/_/g, ' ')} is already in use`
          : 'A record with these details already exists',
      });
    }
    // foreign_key_violation — a referenced row is missing, or a referenced
    // row is still in use by something with ON DELETE RESTRICT.
    case '23503':
      return res.status(409).json({
        success: false,
        message: 'That change conflicts with another record that references it',
      });
    // check_violation — a schema-level rule broken, e.g. negative stock
    // or a status outside the allowed set.
    case '23514':
      return res.status(400).json({ success: false, message: 'Validation failed' });
    // not_null_violation
    case '23502':
      return res.status(400).json({
        success: false,
        message: err.column ? `${err.column.replace(/_/g, ' ')} is required` : 'Validation failed',
      });
    // invalid_text_representation — a malformed uuid that slipped past the
    // validators (which reject these up front, so this is a backstop).
    case '22P02':
      return res.status(400).json({ success: false, message: 'Invalid id' });
    // string_data_right_truncation — a value longer than its column.
    case '22001':
      return res.status(400).json({ success: false, message: 'A value is too long' });
    default:
      break;
  }

  // Anything else is unexpected — log full detail server-side, leak nothing to the client
  console.error('[Unhandled Error]', err);
  return res.status(500).json({
    success: false,
    message: 'Internal server error',
    stack: env.nodeEnv === 'development' ? err.stack : undefined,
  });
}
