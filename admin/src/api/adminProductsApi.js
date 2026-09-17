import axiosClient from './axiosClient.js';

function cleanParams(params) {
  return Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined && v !== '' && v !== null));
}

/** The admin product LIST (all statuses, aggregated price/stock) — distinct
 *  from productApi.js's getProducts/getProduct, which hit the public,
 *  active-only storefront endpoints. */
export function listAdminProducts(params = {}) {
  return axiosClient.get('/admin/products', { params: cleanParams(params) });
}

/** Status-agnostic single-product lookup (draft/active/archived) — the
 *  public getProduct() in productApi.js 404s on anything but 'active'. */
export function getAdminProduct(id) {
  return axiosClient.get(`/admin/products/${id}`);
}

export function updateProductStatus(id, status) {
  return axiosClient.patch(`/admin/products/${id}/status`, { status });
}

/** Editable core fields only (title/description/categoryId/basePrice) — never the slug. */
export function updateProduct(id, fields) {
  return axiosClient.patch(`/admin/products/${id}`, fields);
}

/** priceOverride: pass null to clear it back to inheriting the base price. */
export function updateVariant(productId, variantId, fields) {
  return axiosClient.patch(`/admin/products/${productId}/variants/${variantId}`, fields);
}

/** Refused (409) if the product has any order history — Archive is the
 *  everyday "remove from the store" action; this is only for cleaning up
 *  a product that was created by mistake and never sold. */
export function deleteProduct(id) {
  return axiosClient.delete(`/admin/products/${id}`);
}

/** Hits POST /api/products (not /admin/products) — creation lives on the
 *  original product routes, shared with the public read endpoints. New
 *  products always start as 'draft'; real photos are added afterward via
 *  the editor's Images tab, so `images` is never sent from this form. */
export function createProduct(fields) {
  return axiosClient.post('/products', fields);
}
