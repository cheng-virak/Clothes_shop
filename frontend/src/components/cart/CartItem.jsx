import QuantityStepper from '../ui/QuantityStepper.jsx';
import { useCartStore } from '../../store/useCartStore.js';
import { formatCurrency } from '../../utils/formatCurrency.js';
import { isOneSize } from '../../utils/formatSize.js';

export default function CartItem({ item }) {
  const incrementItem = useCartStore((state) => state.incrementItem);
  const decrementItem = useCartStore((state) => state.decrementItem);
  const removeItem = useCartStore((state) => state.removeItem);

  return (
    <li className="flex gap-3 py-4">
      <img
        src={item.image}
        alt={item.title}
        className="h-20 w-16 shrink-0 rounded-md object-cover"
      />

      <div className="flex flex-1 flex-col">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-sm font-medium text-stone-900">{item.title}</p>
            <p className="mt-0.5 text-xs text-stone-500">
              {isOneSize(item.size) ? item.color : `Size ${item.size} · ${item.color}`}
            </p>
          </div>
          <p className="whitespace-nowrap text-sm font-semibold text-stone-900">
            {formatCurrency(item.unitPrice * item.quantity)}
          </p>
        </div>

        <div className="mt-2 flex items-center justify-between">
          {/* min={0}: unlike the product page's pre-add quantity picker
              (which correctly can't go below 1 unit), decrementing a cart
              line from 1 should remove it — updateQuantity() in the store
              already does this for quantity < 1, the stepper just needs
              to not disable the button before that click can happen. */}
          <QuantityStepper
            quantity={item.quantity}
            min={0}
            max={item.stockQuantity ?? 99}
            onIncrement={() => incrementItem(item.variantId)}
            onDecrement={() => decrementItem(item.variantId)}
          />
          <button
            type="button"
            onClick={() => removeItem(item.variantId)}
            className="flex min-h-11 items-center px-2 text-xs font-medium text-stone-500 underline hover:text-red-600"
          >
            Remove
          </button>
        </div>
      </div>
    </li>
  );
}
