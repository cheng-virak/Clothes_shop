import axiosClient from './axiosClient.js';

function cleanParams(params) {
  return Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined && v !== '' && v !== null));
}

export function listInventory(params = {}) {
  return axiosClient.get('/admin/inventory', { params: cleanParams(params) });
}

export function previewInventoryImport(rows) {
  return axiosClient.post('/admin/inventory/import/preview', { rows });
}

export function applyInventoryImport(rows) {
  return axiosClient.post('/admin/inventory/import/apply', { rows });
}
