import { z } from 'zod';
import { objectId } from '../objectId.js';

export const categoryIdParamSchema = {
  params: z.object({
    id: objectId,
  }),
};

export const checkSlugSchema = {
  query: z.object({
    slug: z.string().trim().min(1).max(120),
    excludeId: objectId.optional(),
  }),
};

export const createCategorySchema = {
  body: z.object({
    name: z.string().trim().min(1).max(100),
    parentId: objectId.nullable().optional(),
    imageUrl: z.string().trim().url().nullable().optional(),
  }),
};

// name/parentId/imageUrl only — slug is generated once at creation and is
// immutable after that, same reasoning as products: changing it out from
// under an existing filtered URL (e.g. /products?category=men) breaks
// that link with no redirect.
export const updateCategorySchema = {
  params: z.object({
    id: objectId,
  }),
  body: z
    .object({
      name: z.string().trim().min(1).max(100),
      parentId: objectId.nullable(),
      imageUrl: z.string().trim().url().nullable(),
    })
    .partial()
    .refine((body) => Object.keys(body).length > 0, { message: 'At least one field is required' }),
};

export const reorderCategorySchema = {
  params: z.object({
    id: objectId,
  }),
  body: z.object({
    direction: z.enum(['up', 'down']),
  }),
};
