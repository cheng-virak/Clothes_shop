import bcrypt from 'bcryptjs';
import { User } from '../models/index.js';
import { env } from '../config/env.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { generateToken } from '../utils/generateToken.js';

/** Response shape is unchanged from the MySQL version — `id` is the
 *  ObjectId serialised to a string, so the frontend needs no changes. */
function toPublicUser(doc) {
  return {
    id: doc._id.toString(),
    fullName: doc.fullName,
    email: doc.email,
    phone: doc.phone ?? null,
    role: doc.role,
  };
}

/**
 * POST /api/auth/register
 * Public. Always creates a 'customer' — role is never taken from the
 * request body, so a client can't self-promote to admin.
 */
export const register = asyncHandler(async (req, res) => {
  const { fullName, email, password, phone } = req.body;

  const existing = await User.findOne({ email }).lean();
  if (existing) {
    throw ApiError.conflict('An account with this email already exists');
  }

  const passwordHash = await bcrypt.hash(password, env.bcryptSaltRounds);

  const user = await User.create({
    fullName,
    email,
    passwordHash,
    phone: phone ?? null,
    role: 'customer',
  });

  const token = generateToken({ id: user._id.toString(), role: user.role });

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

  // passwordHash is `select: false` on the schema, so it has to be asked
  // for explicitly — that default is what stops it leaking elsewhere.
  const user = await User.findOne({ email }).select('+passwordHash');

  if (!user || !user.isActive) {
    throw ApiError.unauthorized('Invalid email or password');
  }

  const passwordMatches = await bcrypt.compare(password, user.passwordHash);
  if (!passwordMatches) {
    throw ApiError.unauthorized('Invalid email or password');
  }

  const token = generateToken({ id: user._id.toString(), role: user.role });

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
  const user = await User.findById(req.user.id);
  if (!user) throw ApiError.notFound('User not found');

  res.json({ success: true, data: toPublicUser(user) });
});
