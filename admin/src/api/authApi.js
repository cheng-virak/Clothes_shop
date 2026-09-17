import axiosClient from './axiosClient.js';

export function login(credentials) {
  return axiosClient.post('/auth/login', credentials);
}
