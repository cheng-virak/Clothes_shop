import axiosClient from './axiosClient.js';

export function listCategories() {
  return axiosClient.get('/admin/categories');
}

export function checkCategorySlug(slug) {
  return axiosClient.get('/admin/categories/check-slug', { params: { slug } });
}

export function createCategory(fields) {
  return axiosClient.post('/admin/categories', fields);
}

export function updateCategory(id, fields) {
  return axiosClient.patch(`/admin/categories/${id}`, fields);
}

export function reorderCategory(id, direction) {
  return axiosClient.patch(`/admin/categories/${id}/reorder`, { direction });
}

export function deleteCategory(id) {
  return axiosClient.delete(`/admin/categories/${id}`);
}
