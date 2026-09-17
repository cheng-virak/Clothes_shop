import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuthStore } from '../../store/useAuthStore.js';
import { getMyOrders } from '../../api/orderApi.js';
import { formatCurrency } from '../../utils/formatCurrency.js';
import { isOneSize } from '../../utils/formatSize.js';

const STATUS_STYLES = {
  pending: 'bg-amber-100 text-amber-800',
  confirmed: 'bg-blue-100 text-blue-800',
  processing: 'bg-blue-100 text-blue-800',
  shipped: 'bg-indigo-100 text-indigo-800',
  delivered: 'bg-green-100 text-green-800',
  cancelled: 'bg-red-100 text-red-800',
};

export default function Orders() {
  const token = useAuthStore((s) => s.token);
  const [orders, setOrders] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;

    getMyOrders({ limit: 20 })
      .then((res) => {
        if (!cancelled) setOrders(res.data);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [token]);

  if (!token) {
    return <Navigate to="/login" replace state={{ from: '/orders' }} />;
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <h1 className="mb-6 text-2xl font-semibold text-stone-900">My Orders</h1>

      {isLoading && <p className="py-16 text-center text-sm text-stone-500">Loading orders…</p>}

      {!isLoading && error && <p className="py-16 text-center text-sm text-red-600">{error}</p>}

      {!isLoading && !error && orders.length === 0 && (
        <p className="py-16 text-center text-sm text-stone-500">
          You haven't placed any orders yet.
        </p>
      )}

      {!isLoading && !error && orders.length > 0 && (
        <ul className="space-y-4">
          {orders.map((order) => (
            <li key={order.id} className="rounded-lg border border-stone-200 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-mono text-sm font-medium text-stone-900">
                    {order.order_number}
                  </p>
                  <p className="text-xs text-stone-500">
                    {new Date(order.placed_at).toLocaleDateString(undefined, {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                    })}
                  </p>
                </div>
                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-medium capitalize ${
                    STATUS_STYLES[order.order_status] ?? 'bg-stone-100 text-stone-700'
                  }`}
                >
                  {order.order_status}
                </span>
              </div>

              <ul className="mt-3 space-y-1 border-t border-stone-100 pt-3 text-sm text-stone-600">
                {order.items.map((item, index) => (
                  <li key={index} className="flex justify-between gap-4">
                    <span>
                      {item.productTitle} ({isOneSize(item.size) ? item.color : `${item.size}, ${item.color}`}) ×{' '}
                      {item.quantity}
                    </span>
                    <span className="whitespace-nowrap">{formatCurrency(item.lineTotal)}</span>
                  </li>
                ))}
              </ul>

              <div className="mt-3 flex justify-between border-t border-stone-100 pt-3 text-sm font-semibold text-stone-900">
                <span>Total</span>
                <span>{formatCurrency(order.grand_total)}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
