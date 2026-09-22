import { query } from '../config/db.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';

/**
 * Cart lines only store a variant + quantity; price, stock and imagery
 * are always read live through the join so a cart can never show a stale
 * price.
 *
 * The document version had to skip lines whose product or variant had
 * been deleted since they were added. That case is gone: cart_items holds
 * a real foreign key to product_variants with ON DELETE CASCADE, so a
 * deleted variant takes its cart lines with it and a dangling line can no
 * longer exist to be filtered out.
 */
const CART_ITEMS_SQL = `
  SELECT ci.variant_id,
         ci.quantity,
         v.sku,
         v.stock_quantity,
         v.size,
         v.color,
         v.color_hex,
         COALESCE(v.price_override, p.base_price) AS unit_price,
         p.id    AS product_id,
         p.title AS product_title,
         p.slug  AS product_slug,
         (SELECT pi.image_url
            FROM product_images pi
           WHERE pi.product_id = p.id AND pi.is_primary
           LIMIT 1) AS image
    FROM cart_items ci
    JOIN carts c            ON c.id = ci.cart_id
    JOIN product_variants v ON v.id = ci.variant_id
    JOIN products p         ON p.id = v.product_id
   WHERE c.user_id = $1
   ORDER BY ci.added_at
`;

function toCartItem(row) {
  return {
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
  };
}

/** The variant a cart operation targets, or a 404 — replaces the
 *  "find the product that embeds this variant" lookup the document model
 *  forced, since a variant is a row of its own again. */
async function findVariant(variantId) {
  const { rows } = await query(
    'SELECT id, sku, stock_quantity FROM product_variants WHERE id = $1',
    [variantId]
  );
  if (rows.length === 0) throw ApiError.notFound('Product variant not found');
  return rows[0];
}

/** The caller's cart id, creating the cart on first use. */
async function getOrCreateCartId(userId) {
  const { rows } = await query(
    `INSERT INTO carts (user_id) VALUES ($1)
     ON CONFLICT (user_id) DO UPDATE SET updated_at = now()
     RETURNING id`,
    [userId]
  );
  return rows[0].id;
}

/**
 * GET /api/cart
 * Authenticated. Returns the caller's cart lines with live
 * product/variant data (price, stock, primary image) plus a computed
 * subtotal — the frontend never has to re-derive pricing itself.
 */
export const getCart = asyncHandler(async (req, res) => {
  const { rows } = await query(CART_ITEMS_SQL, [req.user.id]);
  const items = rows.map(toCartItem);
  const subtotal = items.reduce((sum, item) => sum + item.lineTotal, 0);

  res.json({ success: true, data: { items, subtotal } });
});

/**
 * POST /api/cart
 * Authenticated. Adds `quantity` of a variant, or increments an existing
 * line. The stock check reads the variant's live quantity; overselling is
 * ultimately prevented at checkout, which decrements stock with a
 * conditional update.
 */
export const addToCart = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { variantId, quantity } = req.body;

  const variant = await findVariant(variantId);
  const cartId = await getOrCreateCartId(userId);

  const { rows: existing } = await query(
    'SELECT quantity FROM cart_items WHERE cart_id = $1 AND variant_id = $2',
    [cartId, variantId]
  );
  const combinedQuantity = (existing[0]?.quantity ?? 0) + quantity;

  if (combinedQuantity > variant.stock_quantity) {
    throw ApiError.conflict('Not enough stock available', {
      requested: combinedQuantity,
      available: variant.stock_quantity,
    });
  }

  // Sets the absolute combined figure rather than adding again, so the
  // number that was just stock-checked is exactly the number stored.
  // uq_cart_variant is what keeps this to one line per variant.
  await query(
    `INSERT INTO cart_items (cart_id, variant_id, quantity)
     VALUES ($1, $2, $3)
     ON CONFLICT (cart_id, variant_id) DO UPDATE SET quantity = $3`,
    [cartId, variantId, combinedQuantity]
  );

  res.status(201).json({
    success: true,
    data: { variantId, quantity: combinedQuantity },
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

  const variant = await findVariant(variantId);

  if (quantity > variant.stock_quantity) {
    throw ApiError.conflict('Not enough stock available', {
      requested: quantity,
      available: variant.stock_quantity,
    });
  }

  const { rowCount } = await query(
    `UPDATE cart_items SET quantity = $1
      WHERE variant_id = $2
        AND cart_id = (SELECT id FROM carts WHERE user_id = $3)`,
    [quantity, variantId, req.user.id]
  );
  if (rowCount === 0) throw ApiError.notFound('Item is not in your cart');

  res.json({ success: true, data: { variantId, quantity } });
});

/**
 * DELETE /api/cart/:variantId
 * Authenticated. Removes a single line from the cart.
 */
export const removeCartItem = asyncHandler(async (req, res) => {
  const { variantId } = req.params;

  const { rowCount } = await query(
    `DELETE FROM cart_items
      WHERE variant_id = $1
        AND cart_id = (SELECT id FROM carts WHERE user_id = $2)`,
    [variantId, req.user.id]
  );
  if (rowCount === 0) throw ApiError.notFound('Item is not in your cart');

  res.json({ success: true, data: { variantId } });
});

/**
 * DELETE /api/cart
 * Authenticated. Empties the whole cart (e.g. a "Clear cart" button).
 */
export const clearCart = asyncHandler(async (req, res) => {
  await query(
    'DELETE FROM cart_items WHERE cart_id = (SELECT id FROM carts WHERE user_id = $1)',
    [req.user.id]
  );
  res.json({ success: true, data: null });
});
