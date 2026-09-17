import axiosClient from './axiosClient.js';

/**
 * @param {Object} payload
 * @param {Object} payload.shippingAddress
 * @param {'cod'|'stripe'|'paypal'} payload.paymentMethod
 * Matches POST /api/orders exactly — the backend builds the order from the
 * caller's own cart_items server-side, so no line items are sent here.
 */
export function createOrder(payload) {
  return axiosClient.post('/orders', payload);
}

export function getMyOrders(params = {}) {
  return axiosClient.get('/orders/my-orders', { params });
}
