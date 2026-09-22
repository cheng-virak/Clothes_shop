import { z } from 'zod';
import { uuid } from '../uuid.js';

export const categoryIdParamSchema = {
  params: z.object({
    id: uuid,
  }),
};

export const checkSlugSchema = {
  query: z.object({
    slug: z.string().trim().min(1).max(120),
    excludeId: uuid.optional(),
  }),
};

export const createCategorySchema = {
  body: z.object({
    name: z.string().trim().min(1).max(100),
    parentId: uuid.nullable().optional(),
    imageUrl: z.string().trim().url().nullable().optional(),
  }),
};

// name/parentId/imageUrl only — slug is generated once at creation and is
// immutable after that, same reasoning as products: changing it out from
// under an existing filtered URL (e.g. /products?category=men) breaks
// that link with no redirect.
export const updateCategorySchema = {
  params: z.object({
    id: uuid,
  }),
  body: z
    .object({
      name: z.string().trim().min(1).max(100),
      parentId: uuid.nullable(),
      imageUrl: z.string().trim().url().nullable(),
    })
    .partial()
    .refine((body) => Object.keys(body).length > 0, { message: 'At least one field is required' }),
};

export const reorderCategorySchema = {
  params: z.object({
    id: uuid,
  }),
  body: z.object({
    direction: z.enum(['up', 'down']),
  }),
};
