import { z } from 'zod';
import { uuid } from './uuid.js';

export const listProductsSchema = {
  query: z.object({
    category: z.string().trim().min(1).optional(), // category slug
    size: z.string().trim().toUpperCase().optional(), // e.g. S, M, L, XL
    color: z.string().trim().optional(), // color name
    minPrice: z.coerce.number().nonnegative().optional(),
    maxPrice: z.coerce.number().nonnegative().optional(),
    search: z.string().trim().min(1).max(100).optional(),
    inStock: z
      .enum(['true', 'false'])
      .optional()
      .transform((v) => (v === undefined ? undefined : v === 'true')),
    sort: z.enum(['newest', 'price_asc', 'price_desc', 'name_asc']).default('newest'),
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(20),
  }),
};

// q intentionally allows a single character — the whole point is showing
// something useful after the first keystroke or two, not requiring a
// minimum the user has to type through first.
export const suggestProductsSchema = {
  query: z.object({
    q: z.string().trim().min(1).max(100),
    limit: z.coerce.number().int().positive().max(10).default(6),
  }),
};

export const productIdentifierParamSchema = {
  params: z.object({
    identifier: z.string().trim().min(1).max(220), // uuid or slug
  }),
};

export const productIdParamSchema = {
  params: z.object({
    id: uuid,
  }),
};

export const productImageParamSchema = {
  params: z.object({
    id: uuid,
    imageId: uuid,
  }),
};

// Apparel sizes, 'ONE_SIZE' (no size selector shown on the storefront for
// these — totes, beanies, sunglasses, etc.), and belt waist sizes in
// inches. Mirrors the size values the product form offers.
const SIZE_CODES = ['S', 'M', 'L', 'XL', 'XXL', 'ONE_SIZE', '30', '32', '34', '36'];

const variantSchema = z.object({
  sizeCode: z.enum(SIZE_CODES),
  colorName: z.string().trim().min(1).max(50),
  colorHex: z
    .string()
    .trim()
    .regex(/^#[0-9A-Fa-f]{6}$/)
    .optional(),
  sku: z.string().trim().min(1).max(60),
  stockQuantity: z.coerce.number().int().nonnegative(),
  priceOverride: z.coerce.number().positive().optional(),
});

export const createProductSchema = {
  body: z.object({
    title: z.string().trim().min(2).max(200),
    description: z.string().trim().max(5000).optional(),
    categoryId: uuid,
    basePrice: z.coerce.number().positive(),
    // Optional and normally empty from the admin UI — real photos go on
    // afterward via POST /:id/images (multipart upload), same as every
    // other product's Images tab. This only exists for a caller that
    // already has hosted image URLs (e.g. a future import script).
    images: z.array(z.string().trim().url()).default([]),
    variants: z.array(variantSchema).min(1, 'At least one size/color variant is required'),
  }),
};
