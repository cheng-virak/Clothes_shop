import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { query } from '../config/db.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';

/**
 * Verifies the Bearer JWT and attaches `req.user = { id, role }`.
 * Re-reads the user's active/role status from the DB on every request
 * (cheap primary-key lookup) so a deactivated account or a revoked admin
 * role takes effect immediately instead of waiting for token expiry.
 */
export const verifyToken = asyncHandler(async (req, res, next) => {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    throw ApiError.unauthorized('Missing or malformed Authorization header');
  }

  let payload;
  try {
    payload = jwt.verify(token, env.jwt.secret);
  } catch {
    throw ApiError.unauthorized('Invalid or expired token');
  }

  // A `sub` that isn't a uuid (an old ObjectId- or integer-era token from
  // a previous datastore) makes Postgres reject the parameter outright
  // rather than return no rows, so it's caught and treated as an invalid
  // token instead of surfacing as a 500.
  let rows;
  try {
    ({ rows } = await query('SELECT id, role, is_active FROM users WHERE id = $1', [payload.sub]));
  } catch {
    throw ApiError.unauthorized('Invalid or expired token');
  }

  const user = rows[0];
  if (!user || !user.is_active) {
    throw ApiError.unauthorized('Account not found or disabled');
  }

  req.user = { id: user.id, role: user.role };
  next();
});

/** Requires verifyToken to have run first. */
export const isAdmin = (req, res, next) => {
  if (!req.user) {
    return next(ApiError.unauthorized());
  }
  if (req.user.role !== 'admin') {
    return next(ApiError.forbidden('Admin access required'));
  }
  next();
};

/**
 * Requires verifyToken to have run first. Staff can access orders +
 * inventory routes; everything else in the admin area stays isAdmin-only
 * (products, customers, coupons, settings, admin user management, etc).
 */
export const isStaffOrAdmin = (req, res, next) => {
  if (!req.user) {
    return next(ApiError.unauthorized());
  }
  if (req.user.role !== 'staff' && req.user.role !== 'admin') {
    return next(ApiError.forbidden('Staff or admin access required'));
  }
  next();
};
