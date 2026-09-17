import axiosClient from './axiosClient.js';

export function addToServerCart(variantId, quantity) {
  return axiosClient.post('/cart', { variantId, quantity });
}

export function clearServerCart() {
  return axiosClient.delete('/cart');
}

/**
 * The backend builds orders from its own server-side cart_items table
 * (never from client-supplied line items — see order.controller.js), but
 * "add to cart" in this app only ever touched the local Zustand store.
 * Call this right before POST /api/orders so the server's cart exactly
 * mirrors what the shopper sees locally: clear first (so a retried
 * checkout doesn't double the quantities via the upsert-add endpoint),
 * then push every local line.
 */
export async function syncCartToServer(items) {
  await clearServerCart();
  for (const item of items) {
    await addToServerCart(item.variantId, item.quantity);
  }
}
