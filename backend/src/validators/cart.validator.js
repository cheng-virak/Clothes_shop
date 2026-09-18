import { z } from 'zod';
import { objectId } from './objectId.js';

export const addToCartSchema = {
  body: z.object({
    variantId: objectId,
    quantity: z.coerce.number().int().positive().max(99).default(1),
  }),
};

export const cartItemParamSchema = {
  params: z.object({
    variantId: objectId,
  }),
};

export const updateCartItemSchema = {
  params: z.object({
    variantId: objectId,
  }),
  body: z.object({
    quantity: z.coerce.number().int().positive().max(99),
  }),
};
