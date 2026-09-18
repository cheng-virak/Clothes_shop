import { z } from 'zod';
import { objectId } from '../objectId.js';
import { ORDER_STATUSES } from '@shope/shared/orderStatus';

export const listAdminOrdersSchema = {
  query: z.object({
    status: z.enum(ORDER_STATUSES).optional(),
    q: z.string().trim().min(1).max(100).optional(), // order number / email / customer name
    from: z.string().trim().optional(), // date (YYYY-MM-DD)
    to: z.string().trim().optional(),
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(20),
    sort: z.enum(['newest', 'oldest', 'total_desc', 'total_asc']).default('newest'),
  }),
};

export const orderIdParamSchema = {
  params: z.object({
    id: objectId,
  }),
};

export const updateOrderStatusSchema = {
  params: z.object({
    id: objectId,
  }),
  body: z.object({
    status: z.enum(ORDER_STATUSES),
    note: z.string().trim().max(500).optional(),
  }),
};
