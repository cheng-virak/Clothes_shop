import clsx from 'clsx';

/**
 * Row of size pills. `sizes` is a plain array of codes ("S","M","L","XL");
 * `unavailableSizes` (optional) greys out sizes that are out of stock
 * without hiding them, matching normal eCommerce UX.
 *
 * Out-of-stock treatment: a muted, outlined fill (not just faint grey
 * text — stone-300 text on white fails WCAG AA contrast) plus a
 * line-through, `aria-disabled`, and a native tooltip. `min-h-11 min-w-11`
 * on every chip keeps the tap target at 44px even when the visible pill
 * is narrower (a single-character size like "S" doesn't need to be 44px
 * wide to look right, but it still needs to be that wide to tap reliably).
 */
export default function SizeSelector({ sizes, selectedSize, onSelect, unavailableSizes = [] }) {
  return (
    <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Select size">
      {sizes.map((size) => {
        const isUnavailable = unavailableSizes.includes(size);
        const isSelected = selectedSize === size;
        return (
          <button
            key={size}
            type="button"
            role="radio"
            aria-checked={isSelected}
            aria-disabled={isUnavailable}
            disabled={isUnavailable}
            title={isUnavailable ? 'Out of stock' : undefined}
            onClick={() => onSelect(size)}
            className={clsx(
              'flex min-h-11 min-w-11 items-center justify-center rounded-md border px-2 text-xs font-medium transition',
              // stone-600 on stone-50, not stone-500 — stone-500 measures
              // ~4.4:1, just under the 4.5:1 WCAG AA threshold for normal
              // text; stone-600 clears it with margin (~6.5:1).
              isUnavailable && 'cursor-not-allowed border-stone-300 bg-stone-50 text-stone-600 line-through',
              !isUnavailable &&
                isSelected &&
                'border-stone-900 bg-stone-900 text-white',
              !isUnavailable &&
                !isSelected &&
                'border-stone-300 text-stone-700 hover:border-stone-900'
            )}
          >
            {size}
          </button>
        );
      })}
    </div>
  );
}
