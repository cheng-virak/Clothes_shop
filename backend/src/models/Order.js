import mongoose from 'mongoose';
import { ORDER_STATUSES } from '@shope/shared/orderStatus';

/**
 * Line items are a SNAPSHOT, embedded — they already were in the SQL
 * schema (product_title, sku, size, colour and price were copied in at
 * checkout) precisely so an order still renders correctly after the
 * product is edited or deleted.
 *
 * `variantId` is a loose reference with no enforcement, which is the
 * natural Mongo equivalent of what migration 012 did in MySQL: it changed
 * the foreign key from blocking a product delete to nulling the reference,
 * because the snapshot is what actually gets displayed. Here a deleted
 * product simply leaves an id that resolves to nothing, and every
 * renderer already reads the snapshot fields instead.
 */
const orderItemSchema = new mongoose.Schema(
  {
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', default: null },
    variantId: { type: mongoose.Schema.Types.ObjectId, default: null },
    productTitle: { type: String, required: true },
    sku: { type: String, required: true },
    sizeCode: { type: String, required: true },
    colorName: { type: String, required: true },
    unitPrice: { type: Number, required: true, min: 0 },
    quantity: { type: Number, required: true, min: 1 },
    lineTotal: { type: Number, required: true, min: 0 },
  },
  { _id: true }
);

/** Replaces the order_status_history table — always read with its order,
 *  never independently, so it embeds. changedBy is null for the row
 *  written at checkout by the customer themselves. */
const statusHistorySchema = new mongoose.Schema(
  {
    status: { type: String, required: true, enum: ORDER_STATUSES },
    note: { type: String, default: null },
    changedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    changedAt: { type: Date, default: Date.now },
  },
  { _id: true }
);

const orderSchema = new mongoose.Schema(
  {
    orderNumber: { type: String, required: true, unique: true, trim: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

    // State/postal/country are no longer collected at checkout; they stay
    // optional so older migrated orders keep the values they were placed
    // with, and every renderer skips the empty parts.
    shipping: {
      name: { type: String, required: true },
      phone: { type: String, required: true },
      line1: { type: String, required: true },
      line2: { type: String, default: null },
      city: { type: String, required: true },
      state: { type: String, default: null },
      postal: { type: String, default: null },
      country: { type: String, default: null },
    },

    subtotal: { type: Number, required: true, min: 0 },
    shippingFee: { type: Number, required: true, default: 0, min: 0 },
    discountTotal: { type: Number, required: true, default: 0, min: 0 },
    taxTotal: { type: Number, required: true, default: 0, min: 0 },
    grandTotal: { type: Number, required: true, min: 0 },

    paymentMethod: { type: String, enum: ['cod', 'stripe', 'paypal'], default: 'cod' },
    paymentStatus: { type: String, enum: ['pending', 'paid', 'failed', 'refunded'], default: 'pending' },
    orderStatus: { type: String, enum: ORDER_STATUSES, default: 'pending' },

    trackingNumber: { type: String, default: null },
    trackingCarrier: { type: String, default: null },
    internalNotes: { type: String, default: null },
    couponCode: { type: String, default: null },

    items: { type: [orderItemSchema], default: [] },
    statusHistory: { type: [statusHistorySchema], default: [] },

    placedAt: { type: Date, default: Date.now },
  },
  { timestamps: { createdAt: false, updatedAt: true } }
);

orderSchema.index({ user: 1, placedAt: -1 }); // "my orders"
orderSchema.index({ orderStatus: 1, placedAt: -1 }); // admin list + status filter
orderSchema.index({ placedAt: -1 });

export const Order = mongoose.model('Order', orderSchema);
