import axiosClient from './axiosClient.js';

export function getCategories() {
  return axiosClient.get('/categories');
}
