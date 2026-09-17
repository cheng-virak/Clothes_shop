import axiosClient from './axiosClient.js';

/** Uploads a single image file for a product (multipart/form-data).
 *  `onProgress(percent)` is optional and fires as the upload streams. */
export function uploadProductImage(productId, file, onProgress) {
  const formData = new FormData();
  formData.append('image', file);
  return axiosClient.post(`/products/${productId}/images`, formData, {
    // Unset the instance's default 'application/json' header so the
    // browser sets 'multipart/form-data; boundary=...' itself — axios
    // won't override an explicitly-set Content-Type, even for FormData.
    headers: { 'Content-Type': undefined },
    onUploadProgress: onProgress
      ? (event) => onProgress(event.total ? Math.round((event.loaded / event.total) * 100) : 0)
      : undefined,
  });
}

export function deleteProductImage(productId, imageId) {
  return axiosClient.delete(`/products/${productId}/images/${imageId}`);
}

export function setPrimaryProductImage(productId, imageId) {
  return axiosClient.patch(`/products/${productId}/images/${imageId}/primary`);
}
