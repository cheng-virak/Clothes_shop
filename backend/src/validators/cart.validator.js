import { z } from 'zod';
import { uuid } from './uuid.js';

export const addToCartSchema = {
  body: z.object({
    variantId: uuid,
    quantity: z.coerce.number().int().positive().max(99).default(1),
  }),
};

export const cartItemParamSchema = {
  params: z.object({
    variantId: uuid,
  }),
};

export const updateCartItemSchema = {
  params: z.object({
    variantId: uuid,
  }),
  body: z.object({
    quantity: z.coerce.number().int().positive().max(99),
  }),
};
