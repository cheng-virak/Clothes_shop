import fs from 'node:fs/promises';
import path from 'node:path';
import mongoose from 'mongoose';
import { Product, Category } from '../models/index.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { UPLOADS_DIR } from '../middlewares/upload.middleware.js';
import { logAudit } from '../utils/auditLog.js';

const SORT_CLAUSES = {
  newest: { createdAt: -1 },
  price_asc: { basePrice: 1 },
  price_desc: { basePrice: -1 },
  name_asc: { title: 1 },
};

/** Shared card/list shape. Keys stay snake_case where they already were,
 *  so mapProduct.js on the frontend works unchanged. */
function toListProduct(doc) {
  return {
    id: doc._id.toString(),
    title: doc.title,
    slug: doc.slug,
    description: doc.description,
    base_price: doc.basePrice,
    category_name: doc.category?.name ?? null,
    category_slug: doc.category?.slug ?? null,
    primary_image: doc.images?.find((i) => i.isPrimary)?.imageUrl ?? null,
    variants: (doc.variants ?? []).map((v) => ({
      variantId: v._id.toString(),
      size: v.size,
      color: v.color,
      colorHex: v.colorHex,
      stockQuantity: v.stockQuantity,
      price: v.priceOverride ?? doc.basePrice,
    })),
  };
}

/**
 * GET /api/products/colors
 * Public. Distinct colours actually present on active products, so the
 * filter never offers a colour with zero matching products.
 */
export const getProductColors = asyncHandler(async (req, res) => {
  const rows = await Product.aggregate([
    { $match: { status: 'active' } },
    { $unwind: '$variants' },
    { $group: { _id: '$variants.color', hex: { $first: '$variants.colorHex' } } },
    { $sort: { _id: 1 } },
  ]);

  res.json({ success: true, data: rows.map((r) => ({ name: r._id, hex: r.hex })) });
});

/**
 * GET /api/products
 * Public. Filters: category (slug), size, colour, price range, search,
 * inStock, plus sort/page/limit.
 */
export const getProducts = asyncHandler(async (req, res) => {
  const { category, size, color, minPrice, maxPrice, search, inStock, sort, page, limit } = req.query;

  const filter = { status: 'active' };

  if (category) {
    const categoryDoc = await Category.findOne({ slug: category }).select('_id').lean();
    // An unknown slug must return nothing, not everything — without this
    // the category clause would simply be dropped from the filter.
    filter.category = categoryDoc ? categoryDoc._id : null;
  }

  if (minPrice !== undefined || maxPrice !== undefined) {
    filter.basePrice = {};
    if (minPrice !== undefined) filter.basePrice.$gte = minPrice;
    if (maxPrice !== undefined) filter.basePrice.$lte = maxPrice;
  }

  if (search) {
    // Escaped so a user typing "(" or "*" can't inject a broken/expensive
    // regex — this is the equivalent of the parameterised LIKE it replaces.
    const safe = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const rx = new RegExp(safe, 'i');
    filter.$or = [{ title: rx }, { description: rx }];
  }

  // size/colour match a product that has AT LEAST ONE matching variant —
  // $elemMatch keeps both conditions on the same variant.
  if (size || color) {
    const variantMatch = {};
    if (size) variantMatch.size = size;
    if (color) variantMatch.color = color;
    filter.variants = { $elemMatch: variantMatch };
  }

  if (inStock) {
    filter.variants = filter.variants
      ? { $elemMatch: { ...filter.variants.$elemMatch, stockQuantity: { $gt: 0 } } }
      : { $elemMatch: { stockQuantity: { $gt: 0 } } };
  }

  const skip = (page - 1) * limit;

  const [docs, total] = await Promise.all([
    Product.find(filter)
      .populate('category', 'name slug')
      .sort(SORT_CLAUSES[sort] ?? SORT_CLAUSES.newest)
      .skip(skip)
      .limit(limit),
    Product.countDocuments(filter),
  ]);

  res.json({
    success: true,
    data: docs.map(toListProduct),
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
});

/**
 * GET /api/products/suggest
 * Public. Lightweight as-you-type suggestions for the navbar search box —
 * no count query, no variants payload.
 */
export const suggestProducts = asyncHandler(async (req, res) => {
  const { q, limit } = req.query;
  const safe = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  const docs = await Product.find({ status: 'active', title: new RegExp(safe, 'i') })
    .select('title slug basePrice images')
    .sort({ title: 1 })
    .limit(limit)
    .lean();

  res.json({
    success: true,
    data: docs.map((d) => ({
      id: d._id.toString(),
      title: d.title,
      slug: d.slug,
      base_price: d.basePrice,
      primary_image: d.images?.find((i) => i.isPrimary)?.imageUrl ?? null,
    })),
  });
});

/** Shared by the public and admin single-product reads. */
function toDetailProduct(doc) {
  return {
    id: doc._id.toString(),
    title: doc.title,
    slug: doc.slug,
    description: doc.description,
    base_price: doc.basePrice,
    status: doc.status,
    updated_at: doc.updatedAt,
    category_id: doc.category?._id?.toString() ?? null,
    category_name: doc.category?.name ?? null,
    category_slug: doc.category?.slug ?? null,
    images: doc.images
      .slice()
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((i) => ({
        id: i._id.toString(),
        image_url: i.imageUrl,
        is_primary: i.isPrimary,
        sort_order: i.sortOrder,
      })),
    variants: doc.variants.map((v) => ({
      variantId: v._id.toString(),
      sku: v.sku,
      stockQuantity: v.stockQuantity,
      price: v.priceOverride ?? doc.basePrice,
      size: v.size,
      color: v.color,
      colorHex: v.colorHex,
    })),
  };
}

/**
 * GET /api/products/:identifier
 * Public. Accepts the id or the slug. Draft and archived products return a
 * plain 404 — deliberately indistinguishable from a nonexistent product,
 * so this never leaks "exists but isn't published" to a public caller.
 * Admin tooling uses GET /api/admin/products/:id, which ignores status.
 */
export const getProduct = asyncHandler(async (req, res) => {
  const { identifier } = req.params;

  const query = mongoose.isValidObjectId(identifier)
    ? { _id: identifier, status: 'active' }
    : { slug: identifier, status: 'active' };

  const doc = await Product.findOne(query).populate('category', 'name slug');
  if (!doc) throw ApiError.notFound('Product not found');

  res.json({ success: true, data: toDetailProduct(doc) });
});

/**
 * POST /api/products
 * Admin only. A new product always starts as 'draft' so it's never live
 * on the storefront before it has been reviewed and given photos.
 */
export const createProduct = asyncHandler(async (req, res) => {
  const { title, description, categoryId, basePrice, images = [], variants } = req.body;

  const category = await Category.findById(categoryId).lean();
  if (!category) {
    throw ApiError.badRequest('categoryId does not reference an existing category');
  }

  const slug = `${title}-${Date.now()}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

  const product = await Product.create({
    title,
    description: description ?? null,
    basePrice,
    status: 'draft',
    category: category._id,
    images: images.map((imageUrl, index) => ({
      imageUrl,
      isPrimary: index === 0,
      sortOrder: index,
    })),
    variants: variants.map((v) => ({
      size: v.sizeCode,
      color: v.colorName,
      colorHex: v.colorHex ?? null,
      sku: v.sku,
      priceOverride: v.priceOverride ?? null,
      stockQuantity: v.stockQuantity,
    })),
    slug,
  });

  await logAudit(null, {
    userId: req.user.id,
    action: 'product.created',
    entityType: 'product',
    entityId: product._id.toString(),
    before: null,
    after: { title, categoryId, basePrice, variantCount: variants.length },
    ip: req.ip,
  });

  res.status(201).json({ success: true, data: { id: product._id.toString(), slug } });
});

/**
 * POST /api/products/:id/images
 * Admin only. Accepts one multipart "image" file, saves it under
 * /uploads, and appends it to the product's embedded images. The first
 * image a product gets becomes primary automatically.
 */
export const addProductImage = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!req.file) throw ApiError.badRequest('No image file was provided');

  const product = await Product.findById(id);
  if (!product) throw ApiError.notFound('Product not found');

  const imageUrl = `/uploads/${req.file.filename}`;
  const isFirst = product.images.length === 0;

  product.images.push({
    imageUrl,
    isPrimary: isFirst,
    sortOrder: product.images.length,
  });
  await product.save();

  const created = product.images[product.images.length - 1];
  res.status(201).json({
    success: true,
    data: { id: created._id.toString(), image_url: imageUrl, is_primary: created.isPrimary },
  });
});

/**
 * DELETE /api/products/:id/images/:imageId
 * Admin only. Removes the row and the file on disk. If the primary image
 * is removed, the next remaining image is promoted so a product is never
 * left with images but no primary.
 */
export const deleteProductImage = asyncHandler(async (req, res) => {
  const { id, imageId } = req.params;

  const product = await Product.findById(id);
  if (!product) throw ApiError.notFound('Product not found');

  const image = product.images.id(imageId);
  if (!image) throw ApiError.notFound('Image not found');

  const wasPrimary = image.isPrimary;
  const { imageUrl } = image;
  image.deleteOne();

  if (wasPrimary && product.images.length > 0) {
    product.images[0].isPrimary = true;
  }
  await product.save();

  // Best effort: a missing file shouldn't fail the request, the database
  // record is what the storefront actually reads.
  if (imageUrl.startsWith('/uploads/')) {
    await fs.unlink(path.join(UPLOADS_DIR, path.basename(imageUrl))).catch(() => {});
  }

  res.json({ success: true, data: { id: imageId } });
});

/**
 * PATCH /api/products/:id/images/:imageId/primary
 * Admin only. Exactly one image per product is primary; this clears the
 * flag on the others in the same save.
 */
export const setPrimaryProductImage = asyncHandler(async (req, res) => {
  const { id, imageId } = req.params;

  const product = await Product.findById(id);
  if (!product) throw ApiError.notFound('Product not found');
  if (!product.images.id(imageId)) throw ApiError.notFound('Image not found');

  for (const image of product.images) {
    image.isPrimary = image._id.equals(imageId);
  }
  await product.save();

  res.json({ success: true, data: { id: imageId } });
});
