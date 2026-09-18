import { withTransaction } from '../../config/mongo.js';
import { Order, Product, User } from '../../models/index.js';
import { ApiError } from '../../utils/ApiError.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { logAudit } from '../../utils/auditLog.js';
import { isLegalOrderTransition, STOCK_RESTORING_TRANSITIONS } from '@shope/shared/orderStatus';

const SORT_CLAUSES = {
  newest: { placedAt: -1 },
  oldest: { placedAt: 1 },
  total_desc: { grandTotal: -1 },
  total_asc: { grandTotal: 1 },
};

/**
 * GET /api/admin/orders
 * staff or admin. Every list/filter/sort/page state the admin UI has is
 * enforced here, server-side — the query string is the only state.
 */
export const listOrders = asyncHandler(async (req, res) => {
  const { status, q, from, to, page, limit, sort } = req.query;

  const filter = {};
  if (status) filter.orderStatus = status;
  if (from || to) {
    filter.placedAt = {};
    if (from) filter.placedAt.$gte = new Date(from);
    // `to` is an inclusive day in the UI, so match up to the end of it.
    if (to) filter.placedAt.$lt = new Date(new Date(to).getTime() + 24 * 60 * 60 * 1000);
  }

  if (q) {
    const safe = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const rx = new RegExp(safe, 'i');
    // Customer name/email live on the user document, so they're resolved
    // to ids first — the SQL version got this from a JOIN.
    const users = await User.find({ $or: [{ email: rx }, { fullName: rx }] }).select('_id').lean();
    filter.$or = [{ orderNumber: rx }, { user: { $in: users.map((u) => u._id) } }];
  }

  const skip = (page - 1) * limit;

  const [orders, total] = await Promise.all([
    Order.find(filter)
      .populate('user', 'fullName email')
      .sort(SORT_CLAUSES[sort] ?? SORT_CLAUSES.newest)
      .skip(skip)
      .limit(limit)
      .lean(),
    Order.countDocuments(filter),
  ]);

  const data = orders.map((o) => ({
    id: o._id.toString(),
    order_number: o.orderNumber,
    placed_at: o.placedAt,
    grand_total: o.grandTotal,
    payment_status: o.paymentStatus,
    order_status: o.orderStatus,
    customer_name: o.user?.fullName ?? null,
    customer_email: o.user?.email ?? null,
    item_count: o.items.length,
  }));

  res.json({
    success: true,
    data,
    meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
});

/**
 * GET /api/admin/orders/:id
 * staff or admin. Items come from the embedded SNAPSHOT — never re-read
 * from the live product, since price/title can have changed since the
 * order was placed.
 */
export const getOrder = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const order = await Order.findById(id).populate('user', 'fullName email phone').lean();
  if (!order) throw ApiError.notFound('Order not found');

  const changedByIds = order.statusHistory.map((h) => h.changedBy).filter(Boolean);
  const actors = await User.find({ _id: { $in: changedByIds } }).select('fullName').lean();
  const actorNames = new Map(actors.map((a) => [a._id.toString(), a.fullName]));

  const otherOrders = await Order.find({ user: order.user?._id, _id: { $ne: order._id } })
    .sort({ placedAt: -1 })
    .limit(10)
    .lean();

  res.json({
    success: true,
    data: {
      id: order._id.toString(),
      order_number: order.orderNumber,
      placed_at: order.placedAt,
      order_status: order.orderStatus,
      payment_status: order.paymentStatus,
      payment_method: order.paymentMethod,
      subtotal: order.subtotal,
      shipping_fee: order.shippingFee,
      discount_total: order.discountTotal,
      tax_total: order.taxTotal,
      grand_total: order.grandTotal,
      tracking_number: order.trackingNumber,
      tracking_carrier: order.trackingCarrier,
      customer_name: order.user?.fullName ?? null,
      customer_email: order.user?.email ?? null,
      customer_phone: order.user?.phone ?? null,
      shipping_name: order.shipping.name,
      shipping_phone: order.shipping.phone,
      shipping_line1: order.shipping.line1,
      shipping_line2: order.shipping.line2,
      shipping_city: order.shipping.city,
      shipping_state: order.shipping.state,
      shipping_postal: order.shipping.postal,
      shipping_country: order.shipping.country,
      items: order.items.map((i) => ({
        id: i._id.toString(),
        variant_id: i.variantId ? i.variantId.toString() : null,
        product_title: i.productTitle,
        sku: i.sku,
        size_code: i.sizeCode,
        color_name: i.colorName,
        unit_price: i.unitPrice,
        quantity: i.quantity,
        line_total: i.lineTotal,
      })),
      statusHistory: order.statusHistory.map((h) => ({
        id: h._id.toString(),
        status: h.status,
        note: h.note,
        changed_at: h.changedAt,
        changed_by_name: h.changedBy ? actorNames.get(h.changedBy.toString()) ?? null : null,
      })),
      otherOrdersByCustomer: otherOrders.map((o) => ({
        id: o._id.toString(),
        order_number: o.orderNumber,
        placed_at: o.placedAt,
        grand_total: o.grandTotal,
        order_status: o.orderStatus,
      })),
    },
  });
});

/**
 * PATCH /api/admin/orders/:id/status
 * staff or admin. Enforces the state machine server-side (see
 * shared/src/orderStatus.js) — the UI greying out illegal buttons is
 * convenience only.
 *
 * The double-restock race that SELECT ... FOR UPDATE guarded in MySQL is
 * handled here by making the status write itself conditional: the update
 * only matches while the order is still in the status we read, so of two
 * concurrent cancels exactly one matches and restores stock. The other
 * finds the order already cancelled and takes the idempotent no-op path.
 */
export const updateOrderStatus = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { status: nextStatus, note } = req.body;
  const actorUserId = req.user.id;

  const result = await withTransaction(async (session) => {
    const order = await Order.findById(id).session(session);
    if (!order) throw ApiError.notFound('Order not found');

    const currentStatus = order.orderStatus;

    // Idempotent: re-applying the status the order is ALREADY at succeeds
    // as a no-op rather than erroring — a double-click or a retried
    // request lands here instead of a false "illegal transition".
    if (currentStatus === nextStatus) {
      return { id: order._id.toString(), status: currentStatus, changed: false };
    }

    if (!isLegalOrderTransition(currentStatus, nextStatus)) {
      throw ApiError.conflict(`Cannot change order status from "${currentStatus}" to "${nextStatus}"`, {
        from: currentStatus,
        to: nextStatus,
      });
    }

    const shouldRestoreStock = STOCK_RESTORING_TRANSITIONS[nextStatus]?.includes(currentStatus) ?? false;

    // Conditional on the status we just read — this is the concurrency
    // guard, not the findById above.
    const applied = await Order.updateOne(
      { _id: order._id, orderStatus: currentStatus },
      {
        $set: { orderStatus: nextStatus },
        $push: { statusHistory: { status: nextStatus, note: note ?? null, changedBy: actorUserId } },
      },
      { session }
    );
    if (applied.modifiedCount !== 1) {
      throw ApiError.conflict('Order status changed concurrently — reload and try again');
    }

    if (shouldRestoreStock) {
      for (const item of order.items) {
        // null when the product was hard-deleted since the order was
        // placed — there's no live variant to restore stock to, so this
        // is correctly a no-op rather than an error.
        if (!item.variantId || !item.productId) continue;
        await Product.updateOne(
          { _id: item.productId, 'variants._id': item.variantId },
          { $inc: { 'variants.$.stockQuantity': item.quantity } },
          { session }
        );
      }
    }

    await logAudit(session, {
      userId: actorUserId,
      action: 'order.status_changed',
      entityType: 'order',
      entityId: order._id.toString(),
      before: { status: currentStatus },
      after: { status: nextStatus, note: note ?? null, stockRestored: shouldRestoreStock },
      ip: req.ip,
    });

    return { id: order._id.toString(), status: nextStatus, changed: true, stockRestored: shouldRestoreStock };
  });

  res.json({ success: true, data: result });
});
