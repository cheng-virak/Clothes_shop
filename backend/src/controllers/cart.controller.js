import { pool, withTransaction } from '../config/db.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';

/**
 * GET /api/cart
 * Authenticated. Returns the caller's cart lines joined with live
 * product/variant data (price, stock, primary image) plus a computed
 * subtotal — the frontend never has to re-derive pricing itself.
 */
export const getCart = asyncHandler(async (req, res) => {
  const [rows] = await pool.execute(
    `SELECT
       ci.variant_id, ci.quantity, ci.updated_at,
       v.sku, v.stock_quantity,
       COALESCE(v.price_override, p.base_price) AS unit_price,
       p.id AS product_id, p.title AS product_title, p.slug AS product_slug,
       s.code AS size, col.name AS color, col.hex_code AS color_hex,
       pi.image_url AS image
     FROM cart_items ci
     JOIN product_variants v ON v.id = ci.variant_id
     JOIN products p ON p.id = v.product_id
     JOIN sizes s ON s.id = v.size_id
     JOIN colors col ON col.id = v.color_id
     LEFT JOIN product_images pi ON pi.product_id = p.id AND pi.is_primary = TRUE
     WHERE ci.user_id = ?
     ORDER BY ci.updated_at DESC`,
    [req.user.id]
  );

  const items = rows.map((row) => ({
    variantId: row.variant_id,
    quantity: row.quantity,
    sku: row.sku,
    stockQuantity: row.stock_quantity,
    unitPrice: row.unit_price,
    lineTotal: row.unit_price * row.quantity,
    productId: row.product_id,
    productTitle: row.product_title,
    productSlug: row.product_slug,
    size: row.size,
    color: row.color,
    colorHex: row.color_hex,
    image: row.image,
  }));

  const subtotal = items.reduce((sum, item) => sum + item.lineTotal, 0);

  res.json({ success: true, data: { items, subtotal } });
});

/**
 * POST /api/cart
 * Authenticated. Adds `quantity` of a variant to the cart, or increments
 * an existing line. Locks the variant row (and any existing cart row) for
 * the duration of the check so two rapid "add to cart" clicks can't both
 * pass a stale stock check.
 */
export const addToCart = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { variantId, quantity } = req.body;

  const newQuantity = await withTransaction(async (conn) => {
    const [variantRows] = await conn.execute(
      'SELECT id, stock_quantity FROM product_variants WHERE id = ? FOR UPDATE',
      [variantId]
    );
    const variant = variantRows[0];
    if (!variant) throw ApiError.notFound('Product variant not found');

    const [existingRows] = await conn.execute(
      'SELECT quantity FROM cart_items WHERE user_id = ? AND variant_id = ? FOR UPDATE',
      [userId, variantId]
    );
    const combinedQuantity = (existingRows[0]?.quantity ?? 0) + quantity;

    if (combinedQuantity > variant.stock_quantity) {
      throw ApiError.conflict('Not enough stock available', {
        requested: combinedQuantity,
        available: variant.stock_quantity,
      });
    }

    await conn.execute(
      `INSERT INTO cart_items (user_id, variant_id, quantity)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE quantity = ?`,
      [userId, variantId, combinedQuantity, combinedQuantity]
    );

    return combinedQuantity;
  });

  res.status(201).json({ success: true, data: { variantId, quantity: newQuantity } });
});

/**
 * PATCH /api/cart/:variantId
 * Authenticated. Sets the line to an absolute quantity (not a delta) —
 * matches how a quantity <input> on the cart page typically behaves.
 */
export const updateCartItem = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { variantId } = req.params;
  const { quantity } = req.body;

  await withTransaction(async (conn) => {
    const [variantRows] = await conn.execute(
      'SELECT stock_quantity FROM product_variants WHERE id = ? FOR UPDATE',
      [variantId]
    );
    const variant = variantRows[0];
    if (!variant) throw ApiError.notFound('Product variant not found');

    if (quantity > variant.stock_quantity) {
      throw ApiError.conflict('Not enough stock available', {
        requested: quantity,
        available: variant.stock_quantity,
      });
    }

    const [result] = await conn.execute(
      'UPDATE cart_items SET quantity = ? WHERE user_id = ? AND variant_id = ?',
      [quantity, userId, variantId]
    );
    if (result.affectedRows === 0) {
      throw ApiError.notFound('Item is not in your cart');
    }
  });

  res.json({ success: true, data: { variantId: Number(variantId), quantity } });
});

/**
 * DELETE /api/cart/:variantId
 * Authenticated. Removes a single line from the cart.
 */
export const removeCartItem = asyncHandler(async (req, res) => {
  const { variantId } = req.params;

  const [result] = await pool.execute(
    'DELETE FROM cart_items WHERE user_id = ? AND variant_id = ?',
    [req.user.id, variantId]
  );
  if (result.affectedRows === 0) {
    throw ApiError.notFound('Item is not in your cart');
  }

  res.json({ success: true, data: { variantId: Number(variantId) } });
});

/**
 * DELETE /api/cart
 * Authenticated. Empties the whole cart (e.g. a "Clear cart" button).
 */
export const clearCart = asyncHandler(async (req, res) => {
  await pool.execute('DELETE FROM cart_items WHERE user_id = ?', [req.user.id]);
  res.json({ success: true, data: null });
});
