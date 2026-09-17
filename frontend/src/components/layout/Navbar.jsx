import { useEffect, useId, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import {
  HiOutlineShoppingBag,
  HiOutlineUser,
  HiOutlineSearch,
  HiMenu,
  HiX,
} from 'react-icons/hi';
import { useCartStore } from '../../store/useCartStore.js';
import { useAuthStore } from '../../store/useAuthStore.js';
import { getProducts, suggestProducts } from '../../api/productApi.js';
import { formatCurrency } from '../../utils/formatCurrency.js';
import IconMenu from './IconMenu.jsx';
import IconButton from './IconButton.jsx';

const linkClass = 'text-sm font-medium text-stone-600 transition hover:text-stone-900';
const activeLinkClass = 'text-sm font-semibold text-stone-900';

/** Shop / About — the visible top-level text links. */
function TextNavLinks({ onNavigate, stacked = false }) {
  const location = useLocation();
  const items = [
    { to: '/products', label: 'Shop' },
    { to: '/about', label: 'About' },
  ];

  return (
    <div className={stacked ? 'flex flex-col gap-3' : 'flex items-center gap-6'}>
      {items.map((item) => {
        const isActive = location.pathname === item.to || location.pathname.startsWith(item.to + '/');
        return (
          <Link
            key={item.to}
            to={item.to}
            onClick={onNavigate}
            aria-current={isActive ? 'page' : undefined}
            className={isActive ? activeLinkClass : linkClass}
          >
            {item.label}
          </Link>
        );
      })}
    </div>
  );
}

/** Submits to /products?search=... — the same `search` param the backend
 *  already supports. Also shows a live dropdown: as-you-type product
 *  suggestions once there's a query (debounced), or newest products as a
 *  starting point when the box is focused while still empty — never a
 *  dead click with nothing underneath it. */
function SearchBox({ onSubmit, autoFocus = false }) {
  const [searchParams] = useSearchParams();
  const [value, setValue] = useState(searchParams.get('search') ?? '');
  const [suggestions, setSuggestions] = useState([]);
  const [suggestionsLabel, setSuggestionsLabel] = useState(''); // '' for typed matches, 'New arrivals' for the empty-focus default
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const navigate = useNavigate();
  const containerRef = useRef(null);
  const debounceRef = useRef(null);
  // SearchBox renders twice at once (desktop nav + mobile drawer) — a
  // hardcoded id would duplicate across both, which is invalid HTML and
  // breaks any #id lookup (the second instance is simply unreachable by
  // id). useId() keeps the label/input pairing correct per instance.
  const inputId = useId();

  const loadNewest = () => {
    getProducts({ sort: 'newest', limit: 6 })
      .then((res) => {
        setSuggestions(res.data);
        setSuggestionsLabel('New arrivals');
        setIsOpen(true);
        setActiveIndex(-1);
      })
      .catch(() => setSuggestions([]));
  };

  // Only fires for a non-empty query — the empty case is handled by
  // handleFocus/handleChange calling loadNewest() directly, so this never
  // runs a request on mount before the box has actually been touched.
  useEffect(() => {
    const q = value.trim();
    if (q.length === 0) return undefined;

    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      suggestProducts(q)
        .then((res) => {
          setSuggestions(res.data);
          setSuggestionsLabel('');
          setIsOpen(true);
          setActiveIndex(-1);
        })
        .catch(() => {
          // Suggestions are a convenience — a failed request just means
          // no dropdown, not a broken search box (submit still works).
          setSuggestions([]);
        });
    }, 200);

    return () => clearTimeout(debounceRef.current);
  }, [value]);

  // Click outside closes the dropdown without clearing what was typed.
  useEffect(() => {
    if (!isOpen) return undefined;
    function handleClick(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [isOpen]);

  const handleFocus = () => {
    if (value.trim().length === 0) {
      loadNewest();
    } else if (suggestions.length > 0) {
      setIsOpen(true);
    }
  };

  const handleChange = (e) => {
    const next = e.target.value;
    setValue(next);
    if (next.trim().length === 0) {
      // Cleared back to empty while still focused — fall back to the
      // same "new arrivals" default rather than leaving a stale/empty
      // dropdown open.
      loadNewest();
    }
  };

  const goToProduct = (product) => {
    setIsOpen(false);
    navigate(`/products/${product.slug}`);
    onSubmit?.();
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (activeIndex >= 0 && suggestions[activeIndex]) {
      goToProduct(suggestions[activeIndex]);
      return;
    }
    const q = value.trim();
    setIsOpen(false);
    navigate(q ? `/products?search=${encodeURIComponent(q)}` : '/products');
    onSubmit?.();
  };

  const handleKeyDown = (e) => {
    if (!isOpen || suggestions.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % suggestions.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => (i <= 0 ? suggestions.length - 1 : i - 1));
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    }
  };

  return (
    <div ref={containerRef} className="relative w-full">
      <form onSubmit={handleSubmit} role="search" className="w-full">
        <label htmlFor={inputId} className="sr-only">
          Search products
        </label>
        <div className="relative">
          <HiOutlineSearch
            size={16}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400"
          />
          <input
            id={inputId}
            type="search"
            value={value}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            onFocus={handleFocus}
            placeholder="Search products…"
            autoFocus={autoFocus}
            autoComplete="off"
            role="combobox"
            aria-expanded={isOpen}
            aria-controls={`${inputId}-listbox`}
            aria-autocomplete="list"
            className="w-full rounded-full border border-stone-300 bg-white py-1.5 pl-9 pr-4 text-sm focus:border-stone-900 focus:outline-none focus:ring-1 focus:ring-stone-900"
          />
        </div>
      </form>

      {isOpen && suggestions.length > 0 && (
        <ul
          id={`${inputId}-listbox`}
          role="listbox"
          className="absolute left-0 right-0 top-full z-40 mt-1.5 max-h-80 overflow-y-auto rounded-lg border border-stone-200 bg-white py-1.5 shadow-lg"
        >
          {suggestionsLabel && (
            <li className="px-3 pb-1.5 pt-0.5 text-[11px] font-semibold uppercase tracking-wide text-stone-400">
              {suggestionsLabel}
            </li>
          )}
          {suggestions.map((product, index) => (
            <li key={product.id} role="option" aria-selected={index === activeIndex}>
              <button
                type="button"
                // Fires on mousedown, not click: a real click event needs
                // mousedown+mouseup to land on the same element, and
                // preventDefault() here (to stop the input blurring) was
                // apparently enough of a timing wrinkle in some browsers
                // to swallow the click entirely. mousedown fires reliably
                // and immediately — the same idiom every autocomplete
                // widget (downshift, react-select, etc.) uses for this.
                onMouseDown={(e) => {
                  e.preventDefault();
                  goToProduct(product);
                }}
                // Keyboard activation (Enter/Space on a focused button)
                // never fires mousedown, only click — with detail === 0
                // marking it as keyboard-triggered rather than a pointer
                // click that mousedown already handled.
                onClick={(e) => {
                  if (e.detail === 0) goToProduct(product);
                }}
                onMouseEnter={() => setActiveIndex(index)}
                className={`flex w-full items-center gap-3 px-3 py-2 text-left transition ${
                  index === activeIndex ? 'bg-stone-100' : 'hover:bg-stone-50'
                }`}
              >
                <img
                  src={product.primary_image || 'https://placehold.co/40x50?text=%E2%80%94'}
                  alt=""
                  className="h-10 w-8 shrink-0 rounded object-cover"
                />
                <span className="min-w-0 flex-1 truncate text-sm text-stone-800">{product.title}</span>
                <span className="shrink-0 text-sm text-stone-500">{formatCurrency(product.base_price)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Login or account info + My Orders/My Account/Log Out, depending on auth state. */
function AccountLinks({ onNavigate }) {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const itemClass = 'block text-sm font-medium text-stone-600 transition hover:text-stone-900';

  return (
    <>
      {user ? (
        <>
          <p className="text-sm font-medium text-stone-900">Hi, {user.fullName}</p>
          <Link to="/account" onClick={onNavigate} className={itemClass}>
            My Account
          </Link>
          <Link to="/orders" onClick={onNavigate} className={itemClass}>
            My Orders
          </Link>
          <button
            type="button"
            onClick={() => {
              logout();
              onNavigate?.();
            }}
            className={`w-full text-left ${itemClass}`}
          >
            Log Out
          </button>
        </>
      ) : (
        <>
          <Link to="/login" onClick={onNavigate} className={itemClass}>
            Log In
          </Link>
          <Link to="/signup" onClick={onNavigate} className={itemClass}>
            Create Account
          </Link>
        </>
      )}
      <Link to="/contact" onClick={onNavigate} className={itemClass}>
        Contact
      </Link>
    </>
  );
}

function MobileDrawer({ isOpen, onClose }) {
  const panelRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return undefined;
    function handleKeyDown(e) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKeyDown);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [isOpen, onClose]);

  return (
    <>
      <div
        onClick={onClose}
        aria-hidden="true"
        className={`fixed inset-0 z-40 bg-black/40 transition-opacity sm:hidden ${
          isOpen ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Site menu"
        className={`fixed inset-y-0 left-0 z-50 flex w-full max-w-xs flex-col gap-6 overflow-y-auto bg-white p-5 shadow-xl transition-transform duration-300 ease-out sm:hidden ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between">
          <span className="text-base font-semibold text-stone-900">Menu</span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close menu"
            className="flex h-11 w-11 items-center justify-center rounded-full text-stone-500 hover:bg-stone-100"
          >
            <HiX size={20} />
          </button>
        </div>

        <SearchBox onSubmit={onClose} />
        <TextNavLinks onNavigate={onClose} stacked />
        <div className="flex flex-col gap-3 border-t border-stone-100 pt-4">
          <AccountLinks onNavigate={onClose} />
        </div>
      </div>
    </>
  );
}

export default function Navbar() {
  const totalItems = useCartStore((state) => state.totalItems());
  const openCart = useCartStore((state) => state.openCart);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const location = useLocation();

  // Close the mobile drawer automatically on navigation.
  useEffect(() => {
    setIsMobileOpen(false);
  }, [location.pathname, location.search]);

  return (
    // MobileDrawer must NOT be nested inside this <header>: backdrop-blur
    // is backdrop-filter, which — like filter/transform — creates a new
    // containing block for `position: fixed` descendants. Nested there,
    // the drawer's "fixed, full-height" panel resolves against the
    // header's own ~70px box instead of the viewport. Sibling, not child.
    <>
      <header className="sticky top-0 z-30 border-b border-stone-200 bg-white/90 backdrop-blur">
        <nav className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-4 sm:px-6 lg:px-8">
        <button
          type="button"
          onClick={() => setIsMobileOpen(true)}
          aria-label="Open menu"
          className="flex h-11 w-11 items-center justify-center rounded-full text-stone-700 hover:bg-stone-100 sm:hidden"
        >
          <HiMenu size={22} />
        </button>

        <Link to="/" className="shrink-0 text-lg font-semibold tracking-tight text-stone-900">
          Shope Clothes
        </Link>

        <div className="hidden items-center gap-6 sm:flex">
          <TextNavLinks />
        </div>

        <div className="hidden flex-1 sm:block sm:max-w-xs sm:ml-auto">
          <SearchBox />
        </div>

        <div className="ml-auto flex items-center gap-1 sm:ml-0">
          <IconMenu icon={HiOutlineUser} label="Account menu" tooltip="Account">
            {({ close }) => <AccountLinks onNavigate={close} />}
          </IconMenu>

          <IconButton
            icon={HiOutlineShoppingBag}
            label="Open cart"
            tooltip="Cart"
            onClick={openCart}
            badge={
              totalItems > 0 && (
                <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-stone-900 px-1 text-[10px] font-semibold text-white">
                  {totalItems}
                </span>
              )
            }
          />
        </div>
      </nav>
      </header>

      <MobileDrawer isOpen={isMobileOpen} onClose={() => setIsMobileOpen(false)} />
    </>
  );
}
