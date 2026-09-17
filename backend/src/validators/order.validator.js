import { z } from 'zod';

export const createOrderSchema = {
  body: z.object({
    shippingAddress: z.object({
      recipientName: z.string().trim().min(2).max(120),
      phone: z.string().trim().min(5).max(20),
      line1: z.string().trim().min(2).max(255),
      line2: z.string().trim().max(255).optional(),
      city: z.string().trim().min(1).max(100),
      // Optional since checkout stopped collecting these — the store
      // ships within one country, so they were friction with no payload.
      // Still accepted (and still stored) if a caller does send them, so
      // this doesn't break any existing client or re-order flow.
      state: z.string().trim().max(100).optional(),
      postalCode: z.string().trim().max(20).optional(),
      country: z.string().trim().max(100).optional(),
    }),
    paymentMethod: z.enum(['cod', 'stripe', 'paypal']).default('cod'),
  }),
};

export const myOrdersQuerySchema = {
  query: z.object({
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(50).default(10),
  }),
};
