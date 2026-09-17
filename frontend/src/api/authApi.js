import axiosClient from './axiosClient.js';

export function login(credentials) {
  return axiosClient.post('/auth/login', credentials);
}

export function register(payload) {
  return axiosClient.post('/auth/register', payload);
}
