import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { formatCurrency, formatRelativeTime } from '@shope/shared/format';
import { ORDER_STATUS_LABELS } from '@shope/shared/orderStatus';
import { listOrders } from '../api/ordersApi.js';
import { listInventory } from '../api/inventoryApi.js';

const STATUS_BADGE = {
  pending: 'bg-amber-100 text-amber-800',
  confirmed: 'bg-blue-100 text-blue-800',
  processing: 'bg-indigo-100 text-indigo-800',
  shipped: 'bg-purple-100 text-purple-800',
  delivered: 'bg-green-100 text-green-800',
  cancelled: 'bg-stone-200 text-stone-600',
};

export default function Dashboard() {
  const [recentOrders, setRecentOrders] = useState(null);
  const [lowStock, setLowStock] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    Promise.all([
      listOrders({ sort: 'newest', limit: 8 }),
      listInventory({ lowStock: true, limit: 8 }),
    ])
      .then(([orders, inventory]) => {
        if (cancelled) return;
        setRecentOrders(orders);
        setLowStock(inventory);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const isLoading = recentOrders === null && lowStock === null && !error;

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold text-stone-900">Dashboard</h1>

      {isLoading && <p className="py-16 text-center text-sm text-stone-500">Loading…</p>}
      {error && <p className="py-16 text-center text-sm text-red-600">{error}</p>}

      {!error && (recentOrders || lowStock) && (
        <div className="grid gap-6 lg:grid-cols-2">
          <section className="rounded-lg border border-stone-200 bg-white">
            <header className="flex items-center justify-between border-b border-stone-200 px-4 py-3">
              <h2 className="text-sm font-semibold text-stone-900">Recent orders</h2>
              <Link to="/orders" className="text-xs font-medium text-stone-500 underline hover:text-stone-900">
                View all
              </Link>
            </header>
            {recentOrders && recentOrders.data.length === 0 && (
              <p className="px-4 py-8 text-center text-sm text-stone-500">No orders yet.</p>
            )}
            {recentOrders && recentOrders.data.length > 0 && (
              <ul className="divide-y divide-stone-100">
                {recentOrders.data.map((order) => (
                  <li key={order.id}>
                    <Link
                      to={`/orders/${order.id}`}
                      className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-stone-50"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-stone-900">{order.order_number}</p>
                        <p className="truncate text-xs text-stone-500">
                          {order.customer_name} · {formatRelativeTime(order.placed_at)}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <span className="text-sm font-medium text-stone-900">
                          {formatCurrency(order.grand_total)}
                        </span>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${STATUS_BADGE[order.order_status] ?? 'bg-stone-100 text-stone-600'}`}
                        >
                          {ORDER_STATUS_LABELS[order.order_status] ?? order.order_status}
                        </span>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-lg border border-stone-200 bg-white">
            <header className="flex items-center justify-between border-b border-stone-200 px-4 py-3">
              <h2 className="text-sm font-semibold text-stone-900">Low stock</h2>
              <Link to="/inventory" className="text-xs font-medium text-stone-500 underline hover:text-stone-900">
                View all
              </Link>
            </header>
            {lowStock && lowStock.data.length === 0 && (
              <p className="px-4 py-8 text-center text-sm text-stone-500">Nothing below the low-stock threshold.</p>
            )}
            {lowStock && lowStock.data.length > 0 && (
              <ul className="divide-y divide-stone-100">
                {lowStock.data.map((row) => (
                  <li key={row.variant_id} className="flex items-center justify-between gap-3 px-4 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-stone-900">{row.product_title}</p>
                      <p className="truncate text-xs text-stone-500">
                        {row.size} · {row.color} · {row.sku}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                        row.stock_quantity === 0 ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'
                      }`}
                    >
                      {row.stock_quantity} left
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
