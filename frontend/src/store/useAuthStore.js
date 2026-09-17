import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * Minimal auth store — just enough for axiosClient to attach a Bearer
 * token and for route guards to check role. Full login/register actions
 * belong in authApi.js once those pages are built.
 */
export const useAuthStore = create(
  persist(
    (set) => ({
      token: null,
      user: null, // { id, fullName, email, role }

      setSession: (token, user) => set({ token, user }),
      logout: () => set({ token: null, user: null }),
    }),
    { name: 'shope-auth' }
  )
);
