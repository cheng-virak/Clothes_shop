import axios from 'axios';
import { useAuthStore } from '../store/useAuthStore.js';

const axiosClient = axios.create({
  // Relative by default — proxied to the backend in dev (see
  // vite.config.js), and correct in production too whenever the API is
  // served from the same origin as this app. VITE_API_BASE_URL overrides
  // it with an absolute URL for the deployment shape this project
  // actually uses, where the storefront and the API are separate Vercel
  // projects on separate domains. That origin must also be listed in the
  // API's CORS_ORIGINS, or the browser blocks every request.
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
  headers: { 'Content-Type': 'application/json' },
});

axiosClient.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Unwrap { success, data } and normalize errors to a plain Error so
// components can just `catch (err) { toast.error(err.message) }` — but
// keep the HTTP status on the error too (err.status), so callers that
// need to tell "not found" apart from "server broke" still can (e.g. a
// product detail page rendering a 404 state vs a generic error banner).
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
