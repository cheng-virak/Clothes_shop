/**
 * Shared Tailwind design tokens — colors/spacing/type-scale only, NOT
 * components. The storefront and admin apps have different layouts and
 * densities (editorial retail vs. dense back-office tables), so sharing
 * actual UI components this early would fight both of them; this preset
 * is what keeps their *tokens* — the actual brand palette — in sync
 * without forcing shared markup.
 *
 * Usage in each app's tailwind.config.js:
 *   import sharedPreset from '../shared/tailwind-preset.js';
 *   export default { presets: [sharedPreset], content: [...], ... };
 */
export default {
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#f5f5f4',
          100: '#e7e5e4',
          600: '#44403c',
          900: '#1c1917',
        },
      },
    },
  },
};
