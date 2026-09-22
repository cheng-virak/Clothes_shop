import { query, withTransaction } from '../config/db.js';
import { getSettings } from '../repositories/settings.repo.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { generateOrderNumber } from '../utils/generateToken.js';

/**
 * POST /api/orders
 * Authenticated. Builds the order from the caller's server-side cart (not
 * from client-supplied line items — the server is the source of truth for
 * price and stock), inside one transaction.
 *
 * Overselling is prevented by making the check and the decrement a single
 * statement:
 *
 *   UPDATE product_variants SET stock_quantity = stock_quantity - $qty
 *    WHERE id = $id AND stock_quantity >= $qty
 *
 * Postgres locks the row for the duration of the UPDATE, so a concurrent
 * checkout cannot read the same stale count between the predicate and the
 * write. If another order got there first the WHERE no longer matches,
 * rowCount is 0, and this order rolls back. This is the same guarantee
 * the document model got from a single-document atomic update, and the
 * same one the original MySQL schema needed SELECT ... FOR UPDATE for.
 */
export const createOrder = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { shippingAddress, paymentMethod } = req.body;

  const order = await withTransaction(async (client) => {
    const { rows: lines } = await client.query(
      `SELECT ci.quantity,
              v.id  AS variant_id,
              v.sku,
              v.size,
              v.color,
              p.id    AS product_id,
              p.title AS product_title,
              COALESCE(v.price_override, p.base_price) AS unit_price
         FROM cart_items ci
         JOIN carts c            ON c.id = ci.cart_id
         JOIN product_variants v ON v.id = ci.variant_id
         JOIN products p         ON p.id = v.product_id
        WHERE c.user_id = $1
        ORDER BY ci.added_at`,
      [userId]
    );

    if (lines.length === 0) {
      throw ApiError.badRequest('Your cart is empty');
    }

    const settings = await getSettings(client);

    for (const line of lines) {
      line.lineTotal = line.unit_price * line.quantity;
    }

    const subtotal = lines.reduce((sum, l) => sum + l.lineTotal, 0);
    const shippingFee = settings.flatShippingFee;
    const taxTotal = Math.round(subtotal * (settings.taxRate ?? 0) * 100) / 100;
    const grandTotal = subtotal + shippingFee + taxTotal;

    // Decrement first: if any line can't be satisfied the whole
    // transaction aborts before an order row exists.
    for (const line of lines) {
      const { rowCount } = await client.query(
        `UPDATE product_variants
            SET stock_quantity = stock_quantity - $1
          WHERE id = $2 AND stock_quantity >= $1`,
        [line.quantity, line.variant_id]
      );

      if (rowCount !== 1) {
        // Re-read purely to tell the shopper what IS available; the
        // decision was already made by the UPDATE above.
        const { rows: current } = await client.query(
          'SELECT stock_quantity FROM product_variants WHERE id = $1',
          [line.variant_id]
        );
        throw ApiError.conflict('Some items in your cart no longer have enough stock', [
          {
            sku: line.sku,
            requested: line.quantity,
            available: current[0]?.stock_quantity ?? 0,
          },
        ]);
      }
    }

    const { rows: created } = await client.query(
      `INSERT INTO orders (
         order_number, user_id,
         shipping_name, shipping_phone, shipping_line1, shipping_line2,
         shipping_city, shipping_state, shipping_postal, shipping_country,
         subtotal, shipping_fee, tax_total, grand_total,
         payment_method, payment_status, order_status
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, 'pending', 'pending')
       RETURNING id, order_number, grand_total`,
      [
        generateOrderNumber(),
        userId,
        shippingAddress.recipientName,
        shippingAddress.phone,
        shippingAddress.line1,
        shippingAddress.line2 ?? null,
        shippingAddress.city,
        // No longer collected at checkout; kept optional so migrated
        // orders retain whatever they were originally placed with.
        shippingAddress.state ?? null,
        shippingAddress.postalCode ?? null,
        shippingAddress.country ?? null,
        subtotal,
        shippingFee,
        taxTotal,
        grandTotal,
        paymentMethod,
      ]
    );
    const orderRow = created[0];

    // Line items are a SNAPSHOT: title, sku, size, colour and price are
    // copied in here so the order still renders correctly after the
    // product is edited or deleted.
    const values = [];
    const params = [orderRow.id];
    for (const line of lines) {
      const base = params.length;
      values.push(
        `($1, $${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, ` +
          `$${base + 6}, $${base + 7}, $${base + 8}, $${base + 9})`
      );
      params.push(
        line.product_id,
        line.variant_id,
        line.product_title,
        line.sku,
        line.size,
        line.color,
        line.unit_price,
        line.quantity,
        line.lineTotal
      );
    }
    await client.query(
      `INSERT INTO order_items
         (order_id, product_id, variant_id, product_title, sku, size_code, color_name,
          unit_price, quantity, line_total)
       VALUES ${values.join(', ')}`,
      params
    );

    // changed_by is the customer themselves — the one status change no
    // admin makes — so the timeline reads "who did what, when" from its
    // very first entry.
    await client.query(
      `INSERT INTO order_status_history (order_id, status, note, changed_by)
       VALUES ($1, 'pending', 'Order placed', $2)`,
      [orderRow.id, userId]
    );

    await client.query(
      'DELETE FROM cart_items WHERE cart_id = (SELECT id FROM carts WHERE user_id = $1)',
      [userId]
    );

    return {
      id: orderRow.id,
      orderNumber: orderRow.order_number,
      grandTotal: orderRow.grand_total,
    };
  });

  res.status(201).json({ success: true, data: order });
});

/**
 * GET /api/orders/my-orders
 * Authenticated. Paginated order history for the logged-in user. The
 * items are aggregated by the database into the same nested array the
 * embedded version returned, so this is still one query rather than an
 * N+1 over the order list.
 */
export const getMyOrders = asyncHandler(async (req, res) => {
  const { page, limit } = req.query;
  const userId = req.user.id;

  const [{ rows: countRows }, { rows }] = await Promise.all([
    query('SELECT COUNT(*) AS total FROM orders WHERE user_id = $1', [userId]),
    query(
      `SELECT o.id,
              o.order_number,
              o.subtotal,
              o.shipping_fee,
              o.grand_total,
              o.payment_method,
              o.payment_status,
              o.order_status,
              o.tracking_number,
              o.tracking_carrier,
              o.placed_at,
              COALESCE((
                SELECT json_agg(json_build_object(
                         'productTitle', i.product_title,
                         'sku',          i.sku,
                         'size',         i.size_code,
                         'color',        i.color_name,
                         'unitPrice',    i.unit_price,
                         'quantity',     i.quantity,
                         'lineTotal',    i.line_total
                       ) ORDER BY i.product_title, i.size_code)
                  FROM order_items i
                 WHERE i.order_id = o.id
              ), '[]'::json) AS items
         FROM orders o
        WHERE o.user_id = $1
        ORDER BY o.placed_at DESC
        LIMIT $2 OFFSET $3`,
      [userId, limit, (page - 1) * limit]
    ),
  ]);

  const total = countRows[0].total;

  res.json({
    success: true,
    data: rows,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
});
