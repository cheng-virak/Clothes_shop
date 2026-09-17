/**
 * Controlled +/- quantity stepper. `max` disables the increment button
 * once reached (typically the variant's remaining stock).
 */
export default function QuantityStepper({ quantity, onIncrement, onDecrement, min = 1, max = 99 }) {
  return (
    <div className="inline-flex items-center rounded-full border border-stone-300">
      <button
        type="button"
        onClick={onDecrement}
        disabled={quantity <= min}
        aria-label="Decrease quantity"
        className="flex h-11 w-11 items-center justify-center rounded-full text-lg leading-none text-stone-600 transition hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-30"
      >
        −
      </button>
      <span className="w-8 text-center text-sm font-medium text-stone-900" aria-live="polite">
        {quantity}
      </span>
      <button
        type="button"
        onClick={onIncrement}
        disabled={quantity >= max}
        aria-label="Increase quantity"
        className="flex h-11 w-11 items-center justify-center rounded-full text-lg leading-none text-stone-600 transition hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-30"
      >
        +
      </button>
    </div>
  );
}
