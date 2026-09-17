import { z } from 'zod';

export const listInventorySchema = {
  query: z.object({
    lowStock: z
      .enum(['true', 'false'])
      .optional()
      .transform((v) => (v === undefined ? undefined : v === 'true')),
    outOfStock: z
      .enum(['true', 'false'])
      .optional()
      .transform((v) => (v === undefined ? undefined : v === 'true')),
    category: z.string().trim().min(1).optional(), // category slug
    sort: z.enum(['stock_asc', 'stock_desc']).default('stock_asc'),
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(1000).default(20),
  }),
};

const importRowSchema = z.object({
  sku: z.string().trim().min(1),
  stockQuantity: z.coerce.number().int().nonnegative(),
});

export const inventoryImportSchema = {
  body: z.object({
    rows: z.array(importRowSchema).min(1).max(2000),
  }),
};
