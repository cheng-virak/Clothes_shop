import bcrypt from 'bcryptjs';
import { query } from '../config/db.js';
import { env } from '../config/env.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { generateToken } from '../utils/generateToken.js';

/**
 * The columns a user row may be read with anywhere outside login.
 *
 * Postgres has no way to mark a column as never-selected-by-default, so
 * the rule lives here instead: read this constant, never `SELECT *` from
 * users, and the hash can then only reach code that asks for it by name
 * (login, below).
 */
const PUBLIC_USER_COLUMNS = 'id, full_name, email, phone, role';

/** Response shape is unchanged — `id` is the uuid as a string, so the
 *  frontend needs no changes. */
function toPublicUser(row) {
  return {
    id: row.id,
    fullName: row.full_name,
    email: row.email,
    phone: row.phone ?? null,
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

  const { rows: existing } = await query('SELECT id FROM users WHERE email = $1', [email]);
  if (existing.length > 0) {
    throw ApiError.conflict('An account with this email already exists');
  }

  const passwordHash = await bcrypt.hash(password, env.bcryptSaltRounds);

  // The check above is not the real guarantee — two concurrent
  // registrations can both pass it. The UNIQUE index on users.email is,
  // and its 23505 is rendered as a clean 409 by the error middleware.
  const { rows } = await query(
    `INSERT INTO users (full_name, email, password_hash, phone, role)
     VALUES ($1, $2, $3, $4, 'customer')
     RETURNING ${PUBLIC_USER_COLUMNS}`,
    [fullName, email, passwordHash, phone ?? null]
  );

  const user = rows[0];
  const token = generateToken({ id: user.id, role: user.role });

  res.status(201).json({
    success: true,
    data: { token, user: toPublicUser(user) },
  });
});

/**
 * POST /api/auth/login
 * Public. Generic "invalid credentials" message on any failure step —
 * never reveal whether it was the email or the password that was wrong.
 */
export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  // The one query that reads password_hash — see PUBLIC_USER_COLUMNS.
  const { rows } = await query(
    `SELECT ${PUBLIC_USER_COLUMNS}, is_active, password_hash FROM users WHERE email = $1`,
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
  const { rows } = await query(`SELECT ${PUBLIC_USER_COLUMNS} FROM users WHERE id = $1`, [
    req.user.id,
  ]);
  if (rows.length === 0) throw ApiError.notFound('User not found');

  res.json({ success: true, data: toPublicUser(rows[0]) });
});
