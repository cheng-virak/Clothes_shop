import axiosClient from './axiosClient.js';

function cleanParams(params) {
  return Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined && v !== '' && v !== null));
}

export function listOrders(params = {}) {
  return axiosClient.get('/admin/orders', { params: cleanParams(params) });
}

export function getOrder(id) {
  return axiosClient.get(`/admin/orders/${id}`);
}

export function updateOrderStatus(id, { status, note }) {
  return axiosClient.patch(`/admin/orders/${id}/status`, { status, note });
}
