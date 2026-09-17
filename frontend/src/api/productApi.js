import axiosClient from './axiosClient.js';

/**
 * @param {Object} filters
 * @param {string} [filters.category]  category slug
 * @param {string} [filters.size]      size code, e.g. "M"
 * @param {number} [filters.minPrice]
 * @param {number} [filters.maxPrice]
 * @param {string} [filters.search]
 * @param {number} [filters.page]
 * @param {number} [filters.limit]
 */
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

/** Distinct colors actually available on active products — backs the color filter. */
export function getProductColors() {
  return axiosClient.get('/products/colors');
}

/** Lightweight as-you-type suggestions for the navbar search box — not
 *  the full paginated search results (that's getProducts). */
export function suggestProducts(q, limit = 6) {
  return axiosClient.get('/products/suggest', { params: { q, limit } });
}
