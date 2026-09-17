import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * Deliberately its own localStorage key ("shope-admin-token", not
 * "shope-auth") — even though localhost:5173 and localhost:5174 are
 * already isolated by origin (localStorage is origin-keyed, and the port
 * is part of the origin), a distinct key means a dev poking at both apps'
 * storage in the same browser profile can never visually confuse the two
 * sessions with each other.
 */
export const useAdminAuthStore = create(
  persist(
    (set) => ({
      token: null,
      user: null, // { id, fullName, email, role }

      setSession: (token, user) => set({ token, user }),
      logout: () => set({ token: null, user: null }),
    }),
    { name: 'shope-admin-token' }
  )
);
