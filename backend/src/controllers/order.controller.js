import { pool, withTransaction } from '../config/db.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { generateOrderNumber } from '../utils/generateToken.js';

const SHIPPING_FEE = 5.0; // flat rate; swap for real shipping calc later

/**
 * POST /api/orders
 * Authenticated. Builds the order from the caller's current cart_items
 * (not from client-supplied line items — the server is the source of
 * truth for price and stock). Runs entirely inside one transaction:
 *
 *   1. Lock the relevant product_variants rows (SELECT ... FOR UPDATE)
 *      so two concurrent checkouts can't both oversell the last unit.
 *   2. Verify every cart line still has enough stock.
 *   3. Snapshot product/price/size/color into order_items.
 *   4. Decrement stock, clear the cart, record status history.
 *
 * Any failure rolls the whole thing back — no partial orders, no stock
 * silently going negative.
 */
export const createOrder = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { shippingAddress, paymentMethod } = req.body;

  const order = await withTransaction(async (conn) => {
    // Lock cart lines joined to their variant's current stock/price.
    const [cartLines] = await conn.execute(
      `SELECT
         ci.variant_id, ci.quantity,
         v.stock_quantity, v.sku,
         COALESCE(v.price_override, p.base_price) AS unit_price,
         p.title AS product_title,
         s.code AS size_code, col.name AS color_name
       FROM cart_items ci
       JOIN product_variants v ON v.id = ci.variant_id
       JOIN products p ON p.id = v.product_id
       JOIN sizes s ON s.id = v.size_id
       JOIN colors col ON col.id = v.color_id
       WHERE ci.user_id = ?
       FOR UPDATE`,
      [userId]
    );

    if (cartLines.length === 0) {
      throw ApiError.badRequest('Your cart is empty');
    }

    const insufficientStock = cartLines.filter((line) => line.quantity > line.stock_quantity);
    if (insufficientStock.length > 0) {
      throw ApiError.conflict(
        'Some items in your cart no longer have enough stock',
        insufficientStock.map((line) => ({
          sku: line.sku,
          requested: line.quantity,
          available: line.stock_quantity,
        }))
      );
    }

    const subtotal = cartLines.reduce((sum, line) => sum + line.unit_price * line.quantity, 0);
    const shippingFee = SHIPPING_FEE;
    const grandTotal = subtotal + shippingFee;
    const orderNumber = generateOrderNumber();

    const [orderResult] = await conn.execute(
      `INSERT INTO orders (
         order_number, user_id,
         shipping_name, shipping_phone, shipping_line1, shipping_line2,
         shipping_city, shipping_state, shipping_postal, shipping_country,
         subtotal, shipping_fee, grand_total,
         payment_method, payment_status, order_status
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 'pending')`,
      [
        orderNumber,
        userId,
        shippingAddress.recipientName,
        shippingAddress.phone,
        shippingAddress.line1,
        shippingAddress.line2 ?? null,
        shippingAddress.city,
        shippingAddress.state ?? null,
        // Checkout no longer collects postal code or country. Both columns
        // are NOT NULL, so an uncollected value is stored as '' rather than
        // forcing a schema migration for two fields the store doesn't use;
        // every address renderer skips empty parts. Existing orders keep
        // the real values they were placed with.
        shippingAddress.postalCode ?? '',
        shippingAddress.country ?? '',
        subtotal,
        shippingFee,
        grandTotal,
        paymentMethod,
      ]
    );
    const orderId = orderResult.insertId;

    for (const line of cartLines) {
      const lineTotal = line.unit_price * line.quantity;

      await conn.execute(
        `INSERT INTO order_items (
           order_id, variant_id, product_title, sku,
           size_code, color_name, unit_price, quantity, line_total
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          orderId,
          line.variant_id,
          line.product_title,
          line.sku,
          line.size_code,
          line.color_name,
          line.unit_price,
          line.quantity,
          lineTotal,
        ]
      );

      await conn.execute(
        `UPDATE product_variants
         SET stock_quantity = stock_quantity - ?
         WHERE id = ? AND stock_quantity >= ?`,
        [line.quantity, line.variant_id, line.quantity]
      );
    }

    // changed_by_user_id is the customer themselves here (the only status
    // change no admin/staff makes) — recorded so the timeline reads "who
    // did what, when" from the very first row, not just for admin edits.
    await conn.execute(
      `INSERT INTO order_status_history (order_id, changed_by_user_id, status, note)
       VALUES (?, ?, 'pending', 'Order placed')`,
      [orderId, userId]
    );

    await conn.execute('DELETE FROM cart_items WHERE user_id = ?', [userId]);

    return { id: orderId, orderNumber, grandTotal };
  });

  res.status(201).json({
    success: true,
    data: order,
  });
});

/**
 * GET /api/orders/my-orders
 * Authenticated. Paginated order history for the logged-in user, each
 * order including its line items (via JSON_ARRAYAGG — one round trip
 * instead of N+1 queries).
 */
export const getMyOrders = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { page, limit } = req.query;
  const offset = (page - 1) * limit;

  const [countRows] = await pool.execute('SELECT COUNT(*) AS total FROM orders WHERE user_id = ?', [
    userId,
  ]);
  const total = countRows[0].total;

  const [orders] = await pool.execute(
    `SELECT
       o.id, o.order_number, o.subtotal, o.shipping_fee, o.grand_total,
       o.payment_method, o.payment_status, o.order_status,
       o.tracking_number, o.tracking_carrier, o.placed_at,
       JSON_ARRAYAGG(
         JSON_OBJECT(
           'productTitle', oi.product_title,
           'sku', oi.sku,
           'size', oi.size_code,
           'color', oi.color_name,
           'unitPrice', oi.unit_price,
           'quantity', oi.quantity,
           'lineTotal', oi.line_total
         )
       ) AS items
     FROM orders o
     JOIN order_items oi ON oi.order_id = o.id
     WHERE o.user_id = ?
     GROUP BY o.id
     ORDER BY o.placed_at DESC
     LIMIT ${Number(limit)} OFFSET ${Number(offset)}`,
    [userId]
  );

  res.json({
    success: true,
    data: orders,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
});
