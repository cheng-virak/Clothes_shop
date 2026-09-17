import bcrypt from 'bcryptjs';
import { pool } from '../config/db.js';
import { env } from '../config/env.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { generateToken } from '../utils/generateToken.js';

function toPublicUser(row) {
  return {
    id: row.id,
    fullName: row.full_name,
    email: row.email,
    phone: row.phone,
    role: row.role,
  };
}

/**
 * POST /api/auth/register
 * Public. Always creates a 'customer' — role is never taken from the
 * request body, so a client can't self-promote to admin.
 */
export const register = asyncHandler(async (req, res) => {
  const { fullName, email, password, phone } = req.body;

  const [existing] = await pool.execute('SELECT id FROM users WHERE email = ? LIMIT 1', [email]);
  if (existing.length > 0) {
    throw ApiError.conflict('An account with this email already exists');
  }

  const passwordHash = await bcrypt.hash(password, env.bcryptSaltRounds);

  const [result] = await pool.execute(
    `INSERT INTO users (full_name, email, password_hash, phone, role)
     VALUES (?, ?, ?, ?, 'customer')`,
    [fullName, email, passwordHash, phone ?? null]
  );

  const user = { id: result.insertId, role: 'customer' };
  const token = generateToken(user);

  res.status(201).json({
    success: true,
    data: {
      token,
      user: { id: user.id, fullName, email, phone: phone ?? null, role: 'customer' },
    },
  });
});

/**
 * POST /api/auth/login
 * Public. Generic "invalid credentials" message on any failure step —
 * never reveal whether it was the email or the password that was wrong.
 */
export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  const [rows] = await pool.execute(
    `SELECT id, full_name, email, password_hash, phone, role, is_active
     FROM users WHERE email = ? LIMIT 1`,
    [email]
  );
  const user = rows[0];

  if (!user || !user.is_active) {
    throw ApiError.unauthorized('Invalid email or password');
  }

  const passwordMatches = await bcrypt.compare(password, user.password_hash);
  if (!passwordMatches) {
    throw ApiError.unauthorized('Invalid email or password');
  }

  const token = generateToken({ id: user.id, role: user.role });

  res.json({
    success: true,
    data: { token, user: toPublicUser(user) },
  });
});

/**
 * GET /api/auth/me
 * Authenticated. Lets the frontend rehydrate the logged-in user on refresh.
 */
export const getMe = asyncHandler(async (req, res) => {
  const [rows] = await pool.execute(
    'SELECT id, full_name, email, phone, role FROM users WHERE id = ? LIMIT 1',
    [req.user.id]
  );
  const user = rows[0];
  if (!user) throw ApiError.notFound('User not found');

  res.json({ success: true, data: toPublicUser(user) });
});
