import { registerBodySchema, loginBodySchema } from '@shope/shared/authSchemas';

// The actual validation rules live in shared/src/authSchemas.js — both
// this backend and any client form import the same schema, so the shape
// can't silently drift between what the server accepts and what a form
// validates client-side. This file just wraps them for the Express
// validate() middleware, which expects a { body, query, params } shape.
export const registerSchema = { body: registerBodySchema };
export const loginSchema = { body: loginBodySchema };
