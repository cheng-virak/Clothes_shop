import { z } from 'zod';

export const listAdminProductsSchema = {
  query: z.object({
    q: z.string().trim().min(1).max(100).optional(), // title or SKU
    category: z.string().trim().min(1).optional(), // category slug
    status: z.enum(['draft', 'active', 'archived']).optional(),
    stockState: z.enum(['in_stock', 'low_stock', 'out_of_stock']).optional(),
    sort: z.enum(['newest', 'title_asc', 'price_asc', 'price_desc', 'stock_asc', 'stock_desc']).default('newest'),
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(20),
  }),
};

export const productIdParamSchema = {
  params: z.object({
    id: z.coerce.number().int().positive(),
  }),
};

export const updateProductStatusSchema = {
  params: z.object({
    id: z.coerce.number().int().positive(),
  }),
  body: z.object({
    status: z.enum(['draft', 'active', 'archived']),
  }),
};

// Editable core fields only — slug is deliberately excluded so an edit
// never breaks an existing bookmarked/shared product URL. All fields are
// optional so the client can send only what changed.
export const updateProductSchema = {
  params: z.object({
    id: z.coerce.number().int().positive(),
  }),
  body: z
    .object({
      title: z.string().trim().min(2).max(200),
      description: z.string().trim().max(5000).nullable(),
      categoryId: z.coerce.number().int().positive(),
      basePrice: z.coerce.number().positive(),
    })
    .partial()
    .refine((body) => Object.keys(body).length > 0, { message: 'At least one field is required' }),
};

// priceOverride: null explicitly clears the override back to inheriting
// the product's base price — omitted (undefined) leaves it unchanged.
export const updateVariantSchema = {
  params: z.object({
    id: z.coerce.number().int().positive(),
    variantId: z.coerce.number().int().positive(),
  }),
  body: z
    .object({
      priceOverride: z.coerce.number().positive().nullable(),
      stockQuantity: z.coerce.number().int().nonnegative(),
    })
    .partial()
    .refine((body) => Object.keys(body).length > 0, { message: 'At least one field is required' }),
};
