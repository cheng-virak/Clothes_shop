/**
 * Product photos come in two shapes: a garment shown edge-to-edge (the
 * `aspect-[3/4]` frame with `object-cover` reads fine — nothing to fix),
 * and a compact object shot on a plain backdrop with a lot of surrounding
 * space (object-cover zooms into that backdrop rather than the product,
 * so it reads as "floating small" next to a full-bleed garment shot).
 *
 * There's no DB column for this — it's a one-time photography judgment
 * call, not a computed product attribute — so it's a small hardcoded set
 * here, keyed by slug (slugs are immutable once a product is created, see
 * product.controller.js). Flagged products render with a neutral
 * (bg-stone-100) background and `object-contain` + padding instead of
 * `object-cover`, so the whole product is always visible with even
 * breathing room instead of getting cropped into a corner of itself.
 */
const CONTAIN_FIT_SLUGS = new Set([
  'leather-belt-1789375104779',
  'wool-beanie-1789375104785',
  'canvas-tote-bag-1789375104790',
  'aviator-sunglasses-1789375104794',
]);

export function usesContainFit(slug) {
  return CONTAIN_FIT_SLUGS.has(slug);
}
