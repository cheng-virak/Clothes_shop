import { useEffect, useRef } from 'react';
import { HiX } from 'react-icons/hi';
import ColorSwatches from './ColorSwatches.jsx';
import SizeSelector from './SizeSelector.jsx';
import { useProductVariantSelection } from '../../hooks/useProductVariantSelection.js';
import { formatCurrency } from '../../utils/formatCurrency.js';
import { usesContainFit } from '../../utils/productImageFit.js';

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Phone-only quick-add: the size/colour picker that no longer fits in a
 * 173px-wide card, moved into a bottom sheet behind the card's "+" button.
 *
 * It runs its own useProductVariantSelection(product) rather than sharing
 * the card's — the card no longer renders any selection UI on phone, so
 * there's nothing to stay in sync with, and a fresh sheet each time is the
 * expected behaviour for a modal anyway.
 */
export default function QuickAddSheet({ product, isOpen, onClose }) {
  const {
    selectedColor,
    selectedSize,
    setSelectedSize,
    selectColor,
    sizes,
    showSizeSelector,
    unavailableSizes,
    addToCart,
  } = useProductVariantSelection(product);

  const panelRef = useRef(null);
  const previouslyFocusedRef = useRef(null);

  useEffect(() => {
    if (panelRef.current) panelRef.current.inert = !isOpen;

    if (isOpen) {
      previouslyFocusedRef.current = document.activeElement;
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
      previouslyFocusedRef.current?.focus?.();
    }

    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return undefined;

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        onClose();
        return;
      }
      if (event.key !== 'Tab' || !panelRef.current) return;

      const focusables = Array.from(panelRef.current.querySelectorAll(FOCUSABLE_SELECTOR));
      if (focusables.length === 0) return;

      const first = focusables[0];
      const last = focusables[focusables.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const handleAdd = () => {
    // addToCart already opens the cart drawer on success; closing the sheet
    // first keeps the two from stacking on top of each other.
    const added = addToCart(1);
    if (added) onClose();
  };

  return (
    <div className="sm:hidden">
      <div
        onClick={onClose}
        aria-hidden="true"
        className={`fixed inset-0 z-40 bg-black/40 transition-opacity duration-300 ${
          isOpen ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={`Add ${product.title} to cart`}
        className={`fixed inset-x-0 bottom-0 z-50 flex max-h-[85vh] flex-col rounded-t-2xl bg-white shadow-xl transition-transform duration-300 ease-out ${
          isOpen ? 'translate-y-0' : 'translate-y-full'
        }`}
      >
        <div className="flex items-start gap-3 border-b border-stone-200 px-5 py-4">
          <div className="h-16 w-14 shrink-0 overflow-hidden rounded-md bg-stone-100">
            <img
              src={product.image}
              alt=""
              className={usesContainFit(product.slug) ? 'h-full w-full object-contain p-1.5' : 'h-full w-full object-cover'}
            />
          </div>
          <div className="min-w-0 flex-1">
            <p className="line-clamp-2 text-sm font-medium text-stone-900">{product.title}</p>
            <p className="mt-0.5 text-sm font-semibold text-stone-900">{formatCurrency(product.price)}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-stone-500 hover:bg-stone-100"
          >
            <HiX size={20} />
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
          {product.colors?.length > 0 && (
            <div>
              <h3 className="mb-1 text-sm font-semibold text-stone-900">Color</h3>
              <ColorSwatches
                colors={product.colors}
                selectedColor={selectedColor}
                onSelect={selectColor}
                size="md"
              />
            </div>
          )}

          {showSizeSelector && (
            <div>
              <h3 className="mb-2 text-sm font-semibold text-stone-900">Size</h3>
              <SizeSelector
                sizes={sizes}
                selectedSize={selectedSize}
                onSelect={setSelectedSize}
                unavailableSizes={unavailableSizes}
              />
            </div>
          )}
        </div>

        <div className="border-t border-stone-200 px-5 py-4">
          <button
            type="button"
            onClick={handleAdd}
            className="w-full rounded-lg bg-stone-900 py-3 text-sm font-semibold uppercase tracking-wide text-white transition hover:bg-stone-700"
          >
            Add to Cart
          </button>
        </div>
      </div>
    </div>
  );
}
