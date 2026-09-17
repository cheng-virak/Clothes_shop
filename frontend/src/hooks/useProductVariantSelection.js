import { useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { useCartStore } from '../store/useCartStore.js';
import { isOneSize } from '../utils/formatSize.js';

// Apparel sizes, then belt waist sizes ascending, then 'ONE_SIZE' last —
// a single product only ever has variants from one of these families, so
// this is really three independent orderings living in one list; each
// filters down to just what that product actually has.
const SIZE_ORDER = ['S', 'M', 'L', 'XL', 'XXL', '30', '32', '34', '36', 'ONE_SIZE'];

/**
 * Shared size/color selection + "add to cart" logic for a product, used by
 * both ProductCard (quick add from the grid) and ProductDetail (full page).
 * Keeping this in one place means the two can never validate differently.
 */
export function useProductVariantSelection(product) {
  const [selectedColor, setSelectedColorState] = useState(product.colors?.[0]?.name ?? null);
  const addItem = useCartStore((state) => state.addItem);
  const openCart = useCartStore((state) => state.openCart);

  const sizes = useMemo(() => {
    const present = new Set((product.variants ?? []).map((v) => v.size));
    return SIZE_ORDER.filter((s) => present.has(s));
  }, [product.variants]);

  // A product with variants at all, but only ever 'ONE_SIZE', never had a
  // real size choice — the selector doesn't render for these (see
  // showSizeSelector below) and there's nothing to prompt the shopper to
  // pick, so it's pre-selected rather than left null.
  const isOneSizeOnly = sizes.length === 1 && isOneSize(sizes[0]);
  const showSizeSelector = sizes.length > 0 && !isOneSizeOnly;

  const [selectedSize, setSelectedSize] = useState(isOneSizeOnly ? sizes[0] : null);

  const unavailableSizes = useMemo(
    () =>
      sizes.filter((size) => {
        const variant = product.variants?.find(
          (v) => v.size === size && v.color === selectedColor
        );
        return !variant || variant.stockQuantity < 1;
      }),
    [sizes, product.variants, selectedColor]
  );

  const selectedVariant = useMemo(
    () =>
      product.variants?.find((v) => v.size === selectedSize && v.color === selectedColor) ?? null,
    [product.variants, selectedSize, selectedColor]
  );

  /** Selecting a new color invalidates the current size (stock differs per
   *  color) — except for a One Size product, which has nothing to
   *  re-invalidate and no selector left to re-pick it from. */
  const selectColor = (name) => {
    setSelectedColorState(name);
    setSelectedSize(isOneSizeOnly ? sizes[0] : null);
  };

  // One shared id per product for every toast this hook can produce (the
  // "please select a size" error, the "out of stock" error, and the
  // success toast) — react-hot-toast replaces a toast in place when a new
  // one shares its id instead of stacking a second one, so a shopper can
  // never see "Please select a size" and "added to cart" at once for the
  // same product, and a retry after fixing the error swaps the message
  // rather than piling on.
  const toastId = `add-to-cart-${product.id}`;

  /** Returns true on success, false if validation failed (so callers can bail out). */
  const addToCart = (quantity = 1) => {
    if (showSizeSelector && !selectedSize) {
      toast.error('Please select a size', { id: toastId });
      return false;
    }
    if (!selectedVariant || selectedVariant.stockQuantity < 1) {
      toast.error('That size/color is out of stock', { id: toastId });
      return false;
    }

    addItem(
      {
        variantId: selectedVariant.variantId,
        productId: product.id,
        slug: product.slug,
        title: product.title,
        image: product.image,
        size: selectedSize,
        color: selectedColor,
        colorHex: product.colors?.find((c) => c.name === selectedColor)?.hex,
        unitPrice: selectedVariant.price,
        stockQuantity: selectedVariant.stockQuantity,
      },
      quantity
    );
    toast.success(`${product.title} added to cart`, { id: toastId });
    openCart();
    return true;
  };

  return {
    selectedColor,
    selectedSize,
    setSelectedSize,
    selectColor,
    sizes,
    showSizeSelector,
    unavailableSizes,
    selectedVariant,
    addToCart,
  };
}
