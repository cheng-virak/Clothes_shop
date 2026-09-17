import mongoose from 'mongoose';

/**
 * One document per user with embedded lines, replacing the flat
 * `cart_items` table. The unique index on `user` is what enforced
 * uq_cart_user_variant's "one row per user+variant" — the per-variant
 * half is handled in the controller by incrementing an existing line
 * instead of pushing a duplicate.
 */
const cartItemSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    variantId: { type: mongoose.Schema.Types.ObjectId, required: true },
    quantity: { type: Number, required: true, min: 1 },
    addedAt: { type: Date, default: Date.now },
  },
  { _id: true }
);

const cartSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    items: { type: [cartItemSchema], default: [] },
  },
  { timestamps: true }
);

export const Cart = mongoose.model('Cart', cartSchema);
