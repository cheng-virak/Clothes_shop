import { z } from 'zod';

/**
 * The single source of truth for register/login shape validation.
 * backend/src/validators/auth.validator.js imports these directly and
 * wraps them in `{ body: ... }` for the Express validate() middleware —
 * it does not redefine the rules. Any client form (frontend, admin) can
 * import the same raw schemas to validate before submitting.
 */
export const registerBodySchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  email: z.string().trim().toLowerCase().email().max(190),
  password: z.string().min(8).max(72), // bcrypt truncates beyond 72 bytes
  phone: z.string().trim().max(20).optional(),
});

export const loginBodySchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
});
