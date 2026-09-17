import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

/**
 * Signs a JWT carrying only the claims auth middleware needs.
 * Never put password hashes or full user rows in the token payload.
 */
export function generateToken({ id, role }) {
  return jwt.sign({ sub: id, role }, env.jwt.secret, {
    expiresIn: env.jwt.expiresIn,
  });
}

export function generateOrderNumber() {
  const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const randomPart = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `ORD-${datePart}-${randomPart}`;
}
