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

  // MongoDB duplicate key (unique index on email/slug/sku/orderNumber).
  // Names the field so "SKU already in use" isn't a generic mystery.
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue ?? err.keyPattern ?? {})[0];
    const label = field ? field.split('.').pop() : null;
    return res.status(409).json({
      success: false,
      message: label ? `That ${label} is already in use` : 'A record with these details already exists',
    });
  }

  // A malformed ObjectId that slipped past validation (validators reject
  // these up front, so this is a backstop) — a bad id is a 400, not a 500.
  if (err.name === 'CastError') {
    return res.status(400).json({ success: false, message: `Invalid ${err.path}` });
  }

  // Schema-level rule broken (e.g. negative stock, unknown enum value).
  if (err.name === 'ValidationError') {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      details: Object.values(err.errors).map((e) => ({ path: e.path, message: e.message })),
    });
  }

  // Anything else is unexpected — log full detail server-side, leak nothing to the client
  console.error('[Unhandled Error]', err);
  return res.status(500).json({
    success: false,
    message: 'Internal server error',
    stack: env.nodeEnv === 'development' ? err.stack : undefined,
  });
}
