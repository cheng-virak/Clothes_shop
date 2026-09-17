import { z } from 'zod';

export const addToCartSchema = {
  body: z.object({
    variantId: z.coerce.number().int().positive(),
    quantity: z.coerce.number().int().positive().max(99).default(1),
  }),
};

export const cartItemParamSchema = {
  params: z.object({
    variantId: z.coerce.number().int().positive(),
  }),
};

export const updateCartItemSchema = {
  params: z.object({
    variantId: z.coerce.number().int().positive(),
  }),
  body: z.object({
    quantity: z.coerce.number().int().positive().max(99),
  }),
};
