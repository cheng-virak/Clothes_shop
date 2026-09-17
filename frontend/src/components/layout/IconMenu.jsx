import { useEffect, useRef, useState } from 'react';

/**
 * Icon button that opens a small dropdown panel on click — closes on
 * outside click or Escape. Shared by the Shop and Account menus so the
 * open/close logic exists in exactly one place.
 *
 * `tooltip` is a short visible label shown on hover/keyboard focus (hidden
 * while the menu is open, so it doesn't visually collide with the panel) —
 * icon-only nav is only user-friendly if you don't have to guess what an
 * icon does before clicking it. `label` is the fuller aria-label for
 * screen readers, which don't need the hover affordance at all.
 *
 * `children` may be a render-prop `({ close }) => node` when the content
 * needs to close the menu itself (e.g. a link click).
 */
export default function IconMenu({ icon: Icon, label, tooltip, align = 'right', children }) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return undefined;

    function handlePointerDown(event) {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    function handleKeyDown(event) {
      if (event.key === 'Escape') setIsOpen(false);
    }

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-label={label}
        className="group relative flex h-11 w-11 items-center justify-center rounded-full text-stone-700 hover:bg-stone-100"
      >
        <Icon size={22} />
        {!isOpen && tooltip && (
          <span
            role="tooltip"
            className="pointer-events-none absolute left-1/2 top-full z-50 mt-1.5 -translate-x-1/2 whitespace-nowrap rounded bg-stone-900 px-2 py-1 text-xs text-white opacity-0 transition-opacity delay-300 duration-150 group-hover:opacity-100 group-focus-visible:opacity-100"
          >
            {tooltip}
          </span>
        )}
      </button>

      {isOpen && (
        <div
          role="menu"
          className={`absolute top-full z-40 mt-2 w-48 rounded-lg border border-stone-200 bg-white py-3 shadow-lg ${
            align === 'right' ? 'right-0' : 'left-0'
          }`}
        >
          <div className="flex flex-col gap-2.5 px-4">
            {typeof children === 'function' ? children({ close: () => setIsOpen(false) }) : children}
          </div>
        </div>
      )}
    </div>
  );
}
