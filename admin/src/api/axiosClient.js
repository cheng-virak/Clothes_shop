import axios from 'axios';
import { useAdminAuthStore } from '../store/useAdminAuthStore.js';

const axiosClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api', // proxied to the backend in dev, see vite.config.js
  headers: { 'Content-Type': 'application/json' },
});

axiosClient.interceptors.request.use((config) => {
  const token = useAdminAuthStore.getState().token;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Same envelope-unwrapping/error-normalizing contract as the storefront's
// axiosClient — kept identical on purpose so both apps' API-layer code
// reads the same way, even though this isn't shared code (each app owns
// its own client since the auth store it reads from differs).
axiosClient.interceptors.response.use(
  (response) => response.data,
  (error) => {
    const message = error.response?.data?.message || error.message || 'Something went wrong';
    const normalized = new Error(message);
    normalized.status = error.response?.status ?? null;
    normalized.details = error.response?.data?.details ?? null;
    return Promise.reject(normalized);
  }
);

export default axiosClient;
