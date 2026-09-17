import axiosClient from './axiosClient.js';

/** Public endpoint, no admin prefix — categories aren't gated. Used here
 *  to populate the category dropdown in the product editor. */
export function listCategories() {
  return axiosClient.get('/categories');
}
