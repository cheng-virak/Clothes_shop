import { useEffect, useRef, useState } from 'react';
import { formatCurrency } from '../../utils/formatCurrency.js';

const DEBOUNCE_MS = 400;

/**
 * Dual-thumb price slider built from two overlaid native <input type="range">
 * elements (no extra dependency — and natively keyboard-operable via arrow
 * keys, Home/End, Page Up/Down). `value` is [min, max]; onChange receives
 * the next [min, max] tuple, already clamped so the thumbs can't cross.
 *
 * Dragging updates the visible thumbs/labels immediately (local state), but
 * `onChange` — which triggers a network request upstream — only fires
 * `DEBOUNCE_MS` after the user stops moving, so a drag doesn't spam the API.
 */
export default function PriceRangeSlider({ min, max, value, onChange, step = 5 }) {
  const [local, setLocal] = useState(value);
  const debounceRef = useRef(null);

  // Follow external resets (e.g. "Clear all filters") without fighting them.
  useEffect(() => {
    setLocal(value);
  }, [value[0], value[1]]);

  useEffect(() => () => clearTimeout(debounceRef.current), []);

  const commit = (next) => {
    setLocal(next);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => onChange(next), DEBOUNCE_MS);
  };

  const [lo, hi] = local;
  const loPercent = ((lo - min) / (max - min)) * 100;
  const hiPercent = ((hi - min) / (max - min)) * 100;

  return (
    <div>
      <div className="relative h-4">
        <div className="absolute top-1/2 h-1 w-full -translate-y-1/2 rounded-full bg-stone-200" />
        <div
          className="absolute top-1/2 h-1 -translate-y-1/2 rounded-full bg-stone-900"
          style={{ left: `${loPercent}%`, right: `${100 - hiPercent}%` }}
        />
        <input
          type="range"
          className="price-range absolute inset-0 w-full"
          min={min}
          max={max}
          step={step}
          value={lo}
          onChange={(e) => commit([Math.min(Number(e.target.value), hi - step), hi])}
          aria-label="Minimum price"
        />
        <input
          type="range"
          className="price-range absolute inset-0 w-full"
          min={min}
          max={max}
          step={step}
          value={hi}
          onChange={(e) => commit([lo, Math.max(Number(e.target.value), lo + step)])}
          aria-label="Maximum price"
        />
      </div>
      <div className="mt-2 flex justify-between text-xs text-stone-600">
        <span>{formatCurrency(lo)}</span>
        <span>{formatCurrency(hi)}</span>
      </div>
    </div>
  );
}
