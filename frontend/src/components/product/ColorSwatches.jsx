import clsx from 'clsx';

/**
 * `colors` is an array of { name, hex }. Purely presentational + a
 * click callback — no fetching here.
 *
 * The visible dot stays small (~20-24px) but the actual button is a full
 * 44x44 tap target — the dot is an inner element centered inside it, not
 * the button itself. `gap-0` on the row is intentional: each 44px button
 * already carries ~12px of its own padding on every side, so adjacent
 * dots end up with plenty of breathing room without adding a second
 * layer of spacing on top of it (which would just push the row wider).
 */
export default function ColorSwatches({ colors, selectedColor, onSelect, size = 'sm' }) {
  const dotDimension = size === 'sm' ? 'h-5 w-5' : 'h-7 w-7';

  return (
    <div className="flex flex-wrap gap-0" role="radiogroup" aria-label="Select color">
      {colors.map((color) => {
        const isSelected = selectedColor === color.name;
        return (
          <button
            key={color.name}
            type="button"
            role="radio"
            aria-checked={isSelected}
            aria-label={color.name}
            title={color.name}
            onClick={() => onSelect(color.name)}
            className="group flex h-11 w-11 shrink-0 items-center justify-center"
          >
            <span
              aria-hidden="true"
              className={clsx(
                dotDimension,
                'rounded-full ring-offset-2 transition',
                isSelected ? 'ring-2 ring-stone-900' : 'ring-1 ring-stone-300 group-hover:ring-stone-500'
              )}
              style={{ backgroundColor: color.hex || '#d6d3d1' }}
            />
          </button>
        );
      })}
    </div>
  );
}
