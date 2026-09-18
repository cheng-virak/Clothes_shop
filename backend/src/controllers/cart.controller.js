import mongoose from 'mongoose';
import { Cart, Product } from '../models/index.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';

/**
 * Cart lines only store a product + variant id + quantity; price, stock
 * and imagery are always read live from the product so a cart can never
 * show a stale price. Resolving them means loading the referenced
 * products and matching the embedded variant by its _id.
 */
async function resolveCartItems(cart) {
  if (!cart || cart.items.length === 0) return [];

  const products = await Product.find({ _id: { $in: cart.items.map((i) => i.product) } }).lean();
  const byId = new Map(products.map((p) => [p._id.toString(), p]));

  const items = [];
  for (const line of cart.items) {
    const product = byId.get(line.product.toString());
    if (!product) continue; // product deleted since it was added
    const variant = product.variants.find((v) => v._id.equals(line.variantId));
    if (!variant) continue; // variant removed since it was added

    const unitPrice = variant.priceOverride ?? product.basePrice;
    items.push({
      variantId: variant._id.toString(),
      quantity: line.quantity,
      sku: variant.sku,
      stockQuantity: variant.stockQuantity,
      unitPrice,
      lineTotal: unitPrice * line.quantity,
      productId: product._id.toString(),
      productTitle: product.title,
      productSlug: product.slug,
      size: variant.size,
      color: variant.color,
      colorHex: variant.colorHex,
      image: product.images.find((img) => img.isPrimary)?.imageUrl ?? null,
    });
  }
  return items;
}

/** Finds the product owning an embedded variant — the equivalent of the
 *  old `JOIN product_variants v ON v.id = ?`, since an embedded subdoc
 *  can only be reached through its parent document. */
async function findProductByVariantId(variantId) {
  if (!mongoose.isValidObjectId(variantId)) return null;
  return Product.findOne({ 'variants._id': variantId });
}

/**
 * GET /api/cart
 * Authenticated. Returns the caller's cart lines with live
 * product/variant data (price, stock, primary image) plus a computed
 * subtotal — the frontend never has to re-derive pricing itself.
 */
export const getCart = asyncHandler(async (req, res) => {
  const cart = await Cart.findOne({ user: req.user.id });
  const items = await resolveCartItems(cart);
  const subtotal = items.reduce((sum, item) => sum + item.lineTotal, 0);

  res.json({ success: true, data: { items, subtotal } });
});

/**
 * POST /api/cart
 * Authenticated. Adds `quantity` of a variant, or increments an existing
 * line. The stock check reads the variant's live quantity and the result
 * is written with an upsert; overselling is ultimately prevented at
 * checkout, which decrements stock with a conditional atomic update.
 */
export const addToCart = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { variantId, quantity } = req.body;

  const product = await findProductByVariantId(variantId);
  if (!product) throw ApiError.notFound('Product variant not found');
  const variant = product.variants.id(variantId);

  const cart = await Cart.findOneAndUpdate(
    { user: userId },
    { $setOnInsert: { user: userId, items: [] } },
    { returnDocument: 'after', upsert: true }
  );

  const existing = cart.items.find((i) => i.variantId.equals(variant._id));
  const combinedQuantity = (existing?.quantity ?? 0) + quantity;

  if (combinedQuantity > variant.stockQuantity) {
    throw ApiError.conflict('Not enough stock available', {
      requested: combinedQuantity,
      available: variant.stockQuantity,
    });
  }

  if (existing) {
    existing.quantity = combinedQuantity;
  } else {
    cart.items.push({ product: product._id, variantId: variant._id, quantity });
  }
  await cart.save();

  res.status(201).json({
    success: true,
    data: { variantId: variant._id.toString(), quantity: combinedQuantity },
  });
});

/**
 * PATCH /api/cart/:variantId
 * Authenticated. Sets the line to an absolute quantity (not a delta) —
 * matches how a quantity <input> on the cart page typically behaves.
 */
export const updateCartItem = asyncHandler(async (req, res) => {
  const { variantId } = req.params;
  const { quantity } = req.body;

  const product = await findProductByVariantId(variantId);
  if (!product) throw ApiError.notFound('Product variant not found');
  const variant = product.variants.id(variantId);

  if (quantity > variant.stockQuantity) {
    throw ApiError.conflict('Not enough stock available', {
      requested: quantity,
      available: variant.stockQuantity,
    });
  }

  const cart = await Cart.findOne({ user: req.user.id });
  const line = cart?.items.find((i) => i.variantId.equals(variant._id));
  if (!line) throw ApiError.notFound('Item is not in your cart');

  line.quantity = quantity;
  await cart.save();

  res.json({ success: true, data: { variantId: variant._id.toString(), quantity } });
});

/**
 * DELETE /api/cart/:variantId
 * Authenticated. Removes a single line from the cart.
 */
export const removeCartItem = asyncHandler(async (req, res) => {
  const { variantId } = req.params;
  if (!mongoose.isValidObjectId(variantId)) {
    throw ApiError.notFound('Item is not in your cart');
  }

  const result = await Cart.updateOne(
    { user: req.user.id },
    { $pull: { items: { variantId } } }
  );
  if (result.modifiedCount === 0) {
    throw ApiError.notFound('Item is not in your cart');
  }

  res.json({ success: true, data: { variantId } });
});

/**
 * DELETE /api/cart
 * Authenticated. Empties the whole cart (e.g. a "Clear cart" button).
 */
export const clearCart = asyncHandler(async (req, res) => {
  await Cart.updateOne({ user: req.user.id }, { $set: { items: [] } });
  res.json({ success: true, data: null });
});
