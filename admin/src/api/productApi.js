import axiosClient from './axiosClient.js';

export function getProducts(filters = {}) {
  const params = Object.fromEntries(
    Object.entries(filters).filter(([, value]) => value !== undefined && value !== '' && value !== null)
  );
  return axiosClient.get('/products', { params });
}

/** `identifier` may be the numeric product id or its slug — the backend accepts either. */
export function getProduct(identifier) {
  return axiosClient.get(`/products/${identifier}`);
}
