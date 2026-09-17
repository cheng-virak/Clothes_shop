import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { HiX } from 'react-icons/hi';
import CartItem from './CartItem.jsx';
import { useCartStore } from '../../store/useCartStore.js';
import { formatCurrency } from '../../utils/formatCurrency.js';

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Slide-out cart panel. Mount this once near the root (e.g. in App.jsx) —
 * it reads `isOpen` from the store itself, so anything can trigger it via
 * `useCartStore.getState().openCart()` without prop drilling.
 */
export default function CartDrawer() {
  const isOpen = useCartStore((state) => state.isOpen);
  const closeCart = useCartStore((state) => state.closeCart);
  const items = useCartStore((state) => state.items);
  const totalItems = useCartStore((state) => state.totalItems());
  const subtotal = useCartStore((state) => state.subtotal());
  const navigate = useNavigate();

  const panelRef = useRef(null);
  const closeButtonRef = useRef(null);
  const previouslyFocusedRef = useRef(null);

  // Open/close side effects: lock page scroll, move focus into the panel
  // (and back out again on close), and exclude the panel from tab order /
  // hit-testing entirely while closed (it's still in the DOM, just
  // translated off-screen).
  useEffect(() => {
    if (panelRef.current) panelRef.current.inert = !isOpen;

    if (isOpen) {
      previouslyFocusedRef.current = document.activeElement;
      document.body.style.overflow = 'hidden';
      closeButtonRef.current?.focus();
    } else {
      document.body.style.overflow = '';
      previouslyFocusedRef.current?.focus?.();
    }

    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  // Escape closes; Tab/Shift+Tab is trapped inside the panel while open.
  useEffect(() => {
    if (!isOpen) return undefined;

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        closeCart();
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
  }, [isOpen, closeCart]);

  const handleCheckout = () => {
    closeCart();
    navigate('/checkout');
  };

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={closeCart}
        aria-hidden="true"
        className={`fixed inset-0 z-40 bg-black/40 transition-opacity duration-300 ${
          isOpen ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
      />

      {/* Panel */}
      <aside
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="cart-drawer-title"
        className={`fixed inset-y-0 right-0 z-50 flex w-full max-w-sm flex-col bg-white shadow-xl transition-transform duration-300 ease-out ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between border-b border-stone-200 px-5 py-4">
          <h2 id="cart-drawer-title" className="text-base font-semibold text-stone-900">
            Your Cart {totalItems > 0 && `(${totalItems})`}
          </h2>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={closeCart}
            aria-label="Close cart"
            className="flex h-11 w-11 items-center justify-center rounded-full text-stone-500 hover:bg-stone-100 hover:text-stone-900"
          >
            <HiX size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5">
          {items.length === 0 ? (
            <p className="py-16 text-center text-sm text-stone-500">Your cart is empty.</p>
          ) : (
            <ul className="divide-y divide-stone-100">
              {items.map((item) => (
                <CartItem key={item.variantId} item={item} />
              ))}
            </ul>
          )}
        </div>

        {items.length > 0 && (
          <div className="border-t border-stone-200 px-5 py-4">
            <div className="mb-4 flex items-center justify-between text-sm">
              <span className="text-stone-600">Subtotal</span>
              <span className="text-base font-semibold text-stone-900">
                {formatCurrency(subtotal)}
              </span>
            </div>
            <button
              type="button"
              onClick={handleCheckout}
              className="w-full rounded-lg bg-stone-900 py-3 text-sm font-semibold uppercase tracking-wide text-white transition hover:bg-stone-700"
            >
              Checkout
            </button>
          </div>
        )}
      </aside>
    </>
  );
}
