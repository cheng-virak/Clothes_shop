import { pool, withTransaction } from '../../config/db.js';
import { ApiError } from '../../utils/ApiError.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { logAudit } from '../../utils/auditLog.js';
import { isLegalOrderTransition, STOCK_RESTORING_TRANSITIONS } from '@shope/shared/orderStatus';

const SORT_CLAUSES = {
  newest: 'o.placed_at DESC',
  oldest: 'o.placed_at ASC',
  total_desc: 'o.grand_total DESC',
  total_asc: 'o.grand_total ASC',
};

/**
 * GET /api/admin/orders
 * staff or admin. Every list/filter/sort/page state the admin UI has is
 * enforced here, server-side — the query string is the only state.
 */
export const listOrders = asyncHandler(async (req, res) => {
  const { status, q, from, to, page, limit, sort } = req.query;

  const where = [];
  const params = [];

  if (status) {
    where.push('o.order_status = ?');
    params.push(status);
  }
  if (q) {
    where.push('(o.order_number LIKE ? OR u.email LIKE ? OR u.full_name LIKE ?)');
    const like = `%${q}%`;
    params.push(like, like, like);
  }
  if (from) {
    where.push('o.placed_at >= ?');
    params.push(from);
  }
  if (to) {
    where.push('o.placed_at < DATE_ADD(?, INTERVAL 1 DAY)');
    params.push(to);
  }

  const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const orderByClause = SORT_CLAUSES[sort] ?? SORT_CLAUSES.newest;

  const [countRows] = await pool.execute(
    `SELECT COUNT(*) AS total FROM orders o JOIN users u ON u.id = o.user_id ${whereClause}`,
    params
  );
  const total = countRows[0].total;
  const offset = (page - 1) * limit;

  const [rows] = await pool.execute(
    `SELECT
       o.id, o.order_number, o.placed_at, o.grand_total, o.payment_status, o.order_status,
       u.full_name AS customer_name, u.email AS customer_email,
       (SELECT COUNT(*) FROM order_items oi WHERE oi.order_id = o.id) AS item_count
     FROM orders o
     JOIN users u ON u.id = o.user_id
     ${whereClause}
     ORDER BY ${orderByClause}
     LIMIT ${Number(limit)} OFFSET ${Number(offset)}`,
    params
  );

  res.json({
    success: true,
    data: rows,
    meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
});

/**
 * GET /api/admin/orders/:id
 * staff or admin. Items come from the order_items SNAPSHOT — never
 * re-joined to live products/variants, since price/title can have
 * changed since the order was placed (see order.controller.js's
 * createOrder, which writes the snapshot at order time).
 */
export const getOrder = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const [orderRows] = await pool.execute(
    `SELECT o.*, u.full_name AS customer_name, u.email AS customer_email, u.phone AS customer_phone
     FROM orders o
     JOIN users u ON u.id = o.user_id
     WHERE o.id = ?
     LIMIT 1`,
    [id]
  );
  const order = orderRows[0];
  if (!order) throw ApiError.notFound('Order not found');

  const [items] = await pool.execute(
    `SELECT id, variant_id, product_title, sku, size_code, color_name, unit_price, quantity, line_total
     FROM order_items WHERE order_id = ?`,
    [id]
  );

  const [history] = await pool.execute(
    `SELECT h.id, h.status, h.note, h.changed_at, u.full_name AS changed_by_name
     FROM order_status_history h
     LEFT JOIN users u ON u.id = h.changed_by_user_id
     WHERE h.order_id = ?
     ORDER BY h.changed_at ASC`,
    [id]
  );

  const [otherOrders] = await pool.execute(
    `SELECT id, order_number, placed_at, grand_total, order_status
     FROM orders WHERE user_id = ? AND id != ?
     ORDER BY placed_at DESC LIMIT 10`,
    [order.user_id, id]
  );

  res.json({ success: true, data: { ...order, items, statusHistory: history, otherOrdersByCustomer: otherOrders } });
});

/**
 * PATCH /api/admin/orders/:id/status
 * staff or admin. Enforces the state machine server-side (see
 * shared/src/orderStatus.js) — the UI greying out illegal buttons is
 * convenience only. Row-locked (FOR UPDATE) inside one transaction so two
 * concurrent requests can't both read "pending" and both restock; the
 * second one sees the already-applied status and takes the idempotent
 * no-op path instead of double-restocking or erroring.
 */
export const updateOrderStatus = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { status: nextStatus, note } = req.body;
  const actorUserId = req.user.id;

  const result = await withTransaction(async (conn) => {
    const [orderRows] = await conn.execute('SELECT id, order_status FROM orders WHERE id = ? FOR UPDATE', [id]);
    const order = orderRows[0];
    if (!order) throw ApiError.notFound('Order not found');

    const currentStatus = order.order_status;

    // Idempotent: re-applying the status the order is ALREADY at succeeds
    // as a no-op rather than erroring — a double-click or a retried
    // request lands here instead of a false "illegal transition".
    if (currentStatus === nextStatus) {
      return { id: order.id, status: currentStatus, changed: false };
    }

    if (!isLegalOrderTransition(currentStatus, nextStatus)) {
      throw ApiError.conflict(`Cannot change order status from "${currentStatus}" to "${nextStatus}"`, {
        from: currentStatus,
        to: nextStatus,
      });
    }

    const shouldRestoreStock = STOCK_RESTORING_TRANSITIONS[nextStatus]?.includes(currentStatus) ?? false;
    if (shouldRestoreStock) {
      const [items] = await conn.execute('SELECT variant_id, quantity FROM order_items WHERE order_id = ?', [id]);
      for (const item of items) {
        // variant_id is NULL when the product was hard-deleted since this
        // order was placed (migration 012) — there's no live variant row
        // left to restore stock to, so this is correctly a no-op rather
        // than an error.
        if (item.variant_id === null) continue;
        await conn.execute('UPDATE product_variants SET stock_quantity = stock_quantity + ? WHERE id = ?', [
          item.quantity,
          item.variant_id,
        ]);
      }
    }

    await conn.execute('UPDATE orders SET order_status = ? WHERE id = ?', [nextStatus, id]);
    await conn.execute(
      `INSERT INTO order_status_history (order_id, changed_by_user_id, status, note)
       VALUES (?, ?, ?, ?)`,
      [id, actorUserId, nextStatus, note ?? null]
    );
    await logAudit(conn, {
      userId: actorUserId,
      action: 'order.status_changed',
      entityType: 'order',
      entityId: Number(id),
      before: { status: currentStatus },
      after: { status: nextStatus, note: note ?? null, stockRestored: shouldRestoreStock },
      ip: req.ip,
    });

    return { id: order.id, status: nextStatus, changed: true, stockRestored: shouldRestoreStock };
  });

  res.json({ success: true, data: result });
});
