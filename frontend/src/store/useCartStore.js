import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * Cart line shape kept in state:
 * {
 *   variantId, productId, slug, title, image,
 *   size, color, colorHex, unitPrice, quantity, stockQuantity
 * }
 *
 * Keyed by variantId (product + size + color), matching the backend's
 * product_variants table — the same shirt in a different size is a
 * different line, never merged.
 */
export const useCartStore = create(
  persist(
    (set, get) => ({
      items: [],
      isOpen: false,

      openCart: () => set({ isOpen: true }),
      closeCart: () => set({ isOpen: false }),
      toggleCart: () => set((state) => ({ isOpen: !state.isOpen })),

      /**
       * Adds `quantity` of a variant, or increments the existing line.
       * Clamps to the variant's known stock so the UI can't silently
       * accumulate more than is purchasable (the backend re-validates
       * this at checkout regardless — this is just a UX guard).
       */
      addItem: (product, quantity = 1) =>
        set((state) => {
          const existing = state.items.find((item) => item.variantId === product.variantId);

          if (existing) {
            const nextQuantity = Math.min(
              existing.quantity + quantity,
              existing.stockQuantity ?? Infinity
            );
            return {
              items: state.items.map((item) =>
                item.variantId === product.variantId ? { ...item, quantity: nextQuantity } : item
              ),
            };
          }

          const initialQuantity = Math.min(quantity, product.stockQuantity ?? Infinity);
          return { items: [...state.items, { ...product, quantity: initialQuantity }] };
        }),

      updateQuantity: (variantId, quantity) =>
        set((state) => {
          if (quantity < 1) {
            return { items: state.items.filter((item) => item.variantId !== variantId) };
          }
          return {
            items: state.items.map((item) =>
              item.variantId === variantId
                ? { ...item, quantity: Math.min(quantity, item.stockQuantity ?? Infinity) }
                : item
            ),
          };
        }),

      incrementItem: (variantId) => {
        const item = get().items.find((i) => i.variantId === variantId);
        if (item) get().updateQuantity(variantId, item.quantity + 1);
      },

      decrementItem: (variantId) => {
        const item = get().items.find((i) => i.variantId === variantId);
        if (item) get().updateQuantity(variantId, item.quantity - 1);
      },

      removeItem: (variantId) =>
        set((state) => ({ items: state.items.filter((item) => item.variantId !== variantId) })),

      clearCart: () => set({ items: [] }),

      // ---- derived values (call as functions: useCartStore.getState().subtotal()) ----
      totalItems: () => get().items.reduce((sum, item) => sum + item.quantity, 0),
      subtotal: () => get().items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0),
    }),
    {
      name: 'shope-cart', // localStorage key
      partialize: (state) => ({ items: state.items }), // never persist drawer open/close state
    }
  )
);
