import { withTransaction } from '../config/mongo.js';
import { Cart, Order, Product, getSettings } from '../models/index.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { generateOrderNumber } from '../utils/generateToken.js';

/**
 * POST /api/orders
 * Authenticated. Builds the order from the caller's server-side cart (not
 * from client-supplied line items — the server is the source of truth for
 * price and stock), inside one transaction.
 *
 * Overselling is prevented differently than it was in MySQL. There, the
 * variant rows were locked with SELECT ... FOR UPDATE, checked, then
 * decremented. Here the check and the decrement are a single conditional
 * update:
 *
 *   updateOne({ _id, variants: { $elemMatch: { _id, stockQuantity: { $gte: qty } } } },
 *             { $inc: { 'variants.$.stockQuantity': -qty } })
 *
 * A document-level update in MongoDB is atomic, so the "is there enough
 * stock" predicate and the decrement can't be split by a concurrent
 * checkout. If another order got there first, the filter no longer
 * matches, modifiedCount is 0, and this order rolls back — no lock
 * needed, and no window where two callers both read the same stale count.
 */
export const createOrder = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { shippingAddress, paymentMethod } = req.body;

  const order = await withTransaction(async (session) => {
    const cart = await Cart.findOne({ user: userId }).session(session);
    if (!cart || cart.items.length === 0) {
      throw ApiError.badRequest('Your cart is empty');
    }

    const products = await Product.find({ _id: { $in: cart.items.map((i) => i.product) } }).session(session);
    const byId = new Map(products.map((p) => [p._id.toString(), p]));

    const settings = await getSettings(session);

    const lines = [];
    for (const line of cart.items) {
      const product = byId.get(line.product.toString());
      if (!product) throw ApiError.conflict('A product in your cart is no longer available');

      const variant = product.variants.id(line.variantId);
      if (!variant) throw ApiError.conflict('A product in your cart is no longer available');

      const unitPrice = variant.priceOverride ?? product.basePrice;
      lines.push({
        product,
        variant,
        quantity: line.quantity,
        unitPrice,
        lineTotal: unitPrice * line.quantity,
      });
    }

    const subtotal = lines.reduce((sum, l) => sum + l.lineTotal, 0);
    const shippingFee = settings.flatShippingFee;
    const taxTotal = Math.round(subtotal * (settings.taxRate ?? 0) * 100) / 100;
    const grandTotal = subtotal + shippingFee + taxTotal;

    // Decrement first: if any line can't be satisfied the whole
    // transaction aborts before an order document exists.
    for (const l of lines) {
      const result = await Product.updateOne(
        {
          _id: l.product._id,
          variants: { $elemMatch: { _id: l.variant._id, stockQuantity: { $gte: l.quantity } } },
        },
        { $inc: { 'variants.$.stockQuantity': -l.quantity } },
        { session }
      );

      if (result.modifiedCount !== 1) {
        throw ApiError.conflict('Some items in your cart no longer have enough stock', [
          { sku: l.variant.sku, requested: l.quantity, available: l.variant.stockQuantity },
        ]);
      }
    }

    const [created] = await Order.create(
      [
        {
          orderNumber: generateOrderNumber(),
          user: userId,
          shipping: {
            name: shippingAddress.recipientName,
            phone: shippingAddress.phone,
            line1: shippingAddress.line1,
            line2: shippingAddress.line2 ?? null,
            city: shippingAddress.city,
            // No longer collected at checkout; kept optional so migrated
            // orders retain whatever they were originally placed with.
            state: shippingAddress.state ?? null,
            postal: shippingAddress.postalCode ?? null,
            country: shippingAddress.country ?? null,
          },
          subtotal,
          shippingFee,
          taxTotal,
          grandTotal,
          paymentMethod,
          paymentStatus: 'pending',
          orderStatus: 'pending',
          items: lines.map((l) => ({
            productId: l.product._id,
            variantId: l.variant._id,
            productTitle: l.product.title,
            sku: l.variant.sku,
            sizeCode: l.variant.size,
            colorName: l.variant.color,
            unitPrice: l.unitPrice,
            quantity: l.quantity,
            lineTotal: l.lineTotal,
          })),
          // changedBy is the customer themselves — the one status change
          // no admin makes — so the timeline reads "who did what, when"
          // from its very first entry.
          statusHistory: [{ status: 'pending', note: 'Order placed', changedBy: userId }],
        },
      ],
      { session }
    );

    await Cart.updateOne({ user: userId }, { $set: { items: [] } }, { session });

    return { id: created._id.toString(), orderNumber: created.orderNumber, grandTotal: created.grandTotal };
  });

  res.status(201).json({ success: true, data: order });
});

/**
 * GET /api/orders/my-orders
 * Authenticated. Paginated order history for the logged-in user. Items
 * come back embedded already, so this is one query rather than the
 * JSON_ARRAYAGG join the SQL version needed to avoid N+1.
 */
export const getMyOrders = asyncHandler(async (req, res) => {
  const { page, limit } = req.query;
  const skip = (page - 1) * limit;

  const [orders, total] = await Promise.all([
    Order.find({ user: req.user.id }).sort({ placedAt: -1 }).skip(skip).limit(limit).lean(),
    Order.countDocuments({ user: req.user.id }),
  ]);

  // Field names match the previous response exactly so the storefront's
  // Orders page needs no changes.
  const data = orders.map((o) => ({
    id: o._id.toString(),
    order_number: o.orderNumber,
    subtotal: o.subtotal,
    shipping_fee: o.shippingFee,
    grand_total: o.grandTotal,
    payment_method: o.paymentMethod,
    payment_status: o.paymentStatus,
    order_status: o.orderStatus,
    tracking_number: o.trackingNumber,
    tracking_carrier: o.trackingCarrier,
    placed_at: o.placedAt,
    items: o.items.map((i) => ({
      productTitle: i.productTitle,
      sku: i.sku,
      size: i.sizeCode,
      color: i.colorName,
      unitPrice: i.unitPrice,
      quantity: i.quantity,
      lineTotal: i.lineTotal,
    })),
  }));

  res.json({
    success: true,
    data,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
});
