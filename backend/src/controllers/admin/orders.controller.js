import { query, withTransaction } from '../../config/db.js';
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

function likePattern(value) {
  return `%${value.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
}

/**
 * GET /api/admin/orders
 * staff or admin. Every list/filter/sort/page state the admin UI has is
 * enforced here, server-side — the query string is the only state.
 */
export const listOrders = asyncHandler(async (req, res) => {
  const { status, q, from, to, page, limit, sort } = req.query;

  const params = [];
  const bind = (value) => {
    params.push(value);
    return `$${params.length}`;
  };

  const where = ['TRUE'];

  if (status) where.push(`o.order_status = ${bind(status)}`);
  if (from) where.push(`o.placed_at >= ${bind(from)}::date`);
  // `to` is an inclusive day in the UI, so match up to the end of it.
  if (to) where.push(`o.placed_at < ${bind(to)}::date + INTERVAL '1 day'`);
  if (q) {
    // Customer name/email are a join away rather than a separate lookup:
    // the document version had to resolve them to user ids first.
    const pattern = bind(likePattern(q));
    where.push(
      `(o.order_number ILIKE ${pattern} OR u.email ILIKE ${pattern} OR u.full_name ILIKE ${pattern})`
    );
  }

  const fromAndWhere = `
      FROM orders o
      JOIN users u ON u.id = o.user_id
     WHERE ${where.join(' AND ')}`;

  const filterParams = [...params];
  const pageParams = [...params, limit, (page - 1) * limit];
  const limitAt = `$${params.length + 1}`;
  const offsetAt = `$${params.length + 2}`;

  const [{ rows: countRows }, { rows }] = await Promise.all([
    query(`SELECT COUNT(*) AS total ${fromAndWhere}`, filterParams),
    query(
      `SELECT o.id,
              o.order_number,
              o.placed_at,
              o.grand_total,
              o.payment_status,
              o.order_status,
              u.full_name AS customer_name,
              u.email     AS customer_email,
              (SELECT COUNT(*) FROM order_items i WHERE i.order_id = o.id) AS item_count
         ${fromAndWhere}
        ORDER BY ${SORT_CLAUSES[sort] ?? SORT_CLAUSES.newest}
        LIMIT ${limitAt} OFFSET ${offsetAt}`,
      pageParams
    ),
  ]);

  const total = countRows[0].total;

  res.json({
    success: true,
    data: rows,
    meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
});

/**
 * GET /api/admin/orders/:id
 * staff or admin. Items come from the SNAPSHOT columns on order_items —
 * never re-read from the live product, since price/title can have
 * changed since the order was placed.
 */
export const getOrder = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const { rows } = await query(
    `SELECT o.id,
            o.order_number,
            o.placed_at,
            o.order_status,
            o.payment_status,
            o.payment_method,
            o.subtotal,
            o.shipping_fee,
            o.discount_total,
            o.tax_total,
            o.grand_total,
            o.tracking_number,
            o.tracking_carrier,
            o.shipping_name,
            o.shipping_phone,
            o.shipping_line1,
            o.shipping_line2,
            o.shipping_city,
            o.shipping_state,
            o.shipping_postal,
            o.shipping_country,
            o.user_id,
            u.full_name AS customer_name,
            u.email     AS customer_email,
            u.phone     AS customer_phone,
            COALESCE((
              SELECT json_agg(json_build_object(
                       'id',            i.id,
                       'variant_id',    i.variant_id,
                       'product_title', i.product_title,
                       'sku',           i.sku,
                       'size_code',     i.size_code,
                       'color_name',    i.color_name,
                       'unit_price',    i.unit_price,
                       'quantity',      i.quantity,
                       'line_total',    i.line_total
                     ) ORDER BY i.product_title, i.size_code)
                FROM order_items i WHERE i.order_id = o.id
            ), '[]'::json) AS items,
            COALESCE((
              SELECT json_agg(json_build_object(
                       'id',              h.id,
                       'status',          h.status,
                       'note',            h.note,
                       'changed_at',      h.changed_at,
                       'changed_by_name', actor.full_name
                     ) ORDER BY h.changed_at)
                FROM order_status_history h
                LEFT JOIN users actor ON actor.id = h.changed_by
               WHERE h.order_id = o.id
            ), '[]'::json) AS "statusHistory"
       FROM orders o
       JOIN users u ON u.id = o.user_id
      WHERE o.id = $1`,
    [id]
  );
  if (rows.length === 0) throw ApiError.notFound('Order not found');

  const order = rows[0];

  const { rows: otherOrders } = await query(
    `SELECT id, order_number, placed_at, grand_total, order_status
       FROM orders
      WHERE user_id = $1 AND id <> $2
      ORDER BY placed_at DESC
      LIMIT 10`,
    [order.user_id, id]
  );

  // user_id is only needed to find the customer's other orders; it isn't
  // part of the response the admin app consumes.
  delete order.user_id;

  res.json({
    success: true,
    data: { ...order, otherOrdersByCustomer: otherOrders },
  });
});

/**
 * PATCH /api/admin/orders/:id/status
 * staff or admin. Enforces the state machine server-side (see
 * shared/src/orderStatus.js) — the UI greying out illegal buttons is
 * convenience only.
 *
 * The double-restock race is handled by making the status write itself
 * conditional: the UPDATE only matches while the order is still in the
 * status we read, so of two concurrent cancels exactly one matches and
 * restores stock. The other finds rowCount 0 and fails rather than
 * restocking a second time.
 */
export const updateOrderStatus = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { status: nextStatus, note } = req.body;
  const actorUserId = req.user.id;

  const result = await withTransaction(async (client) => {
    const { rows: existing } = await client.query(
      'SELECT order_status FROM orders WHERE id = $1',
      [id]
    );
    if (existing.length === 0) throw ApiError.notFound('Order not found');

    const currentStatus = existing[0].order_status;

    // Idempotent: re-applying the status the order is ALREADY at succeeds
    // as a no-op rather than erroring — a double-click or a retried
    // request lands here instead of a false "illegal transition".
    if (currentStatus === nextStatus) {
      return { id, status: currentStatus, changed: false };
    }

    if (!isLegalOrderTransition(currentStatus, nextStatus)) {
      throw ApiError.conflict(
        `Cannot change order status from "${currentStatus}" to "${nextStatus}"`,
        { from: currentStatus, to: nextStatus }
      );
    }

    const shouldRestoreStock =
      STOCK_RESTORING_TRANSITIONS[nextStatus]?.includes(currentStatus) ?? false;

    // Conditional on the status just read — this is the concurrency
    // guard, not the SELECT above.
    const { rowCount } = await client.query(
      'UPDATE orders SET order_status = $2 WHERE id = $1 AND order_status = $3',
      [id, nextStatus, currentStatus]
    );
    if (rowCount !== 1) {
      throw ApiError.conflict('Order status changed concurrently — reload and try again');
    }

    await client.query(
      `INSERT INTO order_status_history (order_id, status, note, changed_by)
       VALUES ($1, $2, $3, $4)`,
      [id, nextStatus, note ?? null, actorUserId]
    );

    if (shouldRestoreStock) {
      // variant_id is NULL when the product was hard-deleted since the
      // order was placed — there is no live variant to restore stock to,
      // so those rows are correctly skipped rather than erroring.
      //
      // The quantities are summed per variant before the join: UPDATE
      // ... FROM applies at most one source row to each target row, so
      // two lines of the same order pointing at one variant would
      // otherwise restore only one of them.
      await client.query(
        `UPDATE product_variants v
            SET stock_quantity = v.stock_quantity + restore.quantity
           FROM (SELECT variant_id, SUM(quantity) AS quantity
                   FROM order_items
                  WHERE order_id = $1 AND variant_id IS NOT NULL
                  GROUP BY variant_id) restore
          WHERE restore.variant_id = v.id`,
        [id]
      );
    }

    await logAudit(client, {
      userId: actorUserId,
      action: 'order.status_changed',
      entityType: 'order',
      entityId: id,
      before: { status: currentStatus },
      after: { status: nextStatus, note: note ?? null, stockRestored: shouldRestoreStock },
      ip: req.ip,
    });

    return { id, status: nextStatus, changed: true, stockRestored: shouldRestoreStock };
  });

  res.json({ success: true, data: result });
});
