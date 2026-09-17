import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { formatCurrency, formatDate } from '@shope/shared/format';
import { ORDER_STATUSES, ORDER_STATUS_LABELS } from '@shope/shared/orderStatus';
import { listOrders } from '../../api/ordersApi.js';

const STATUS_BADGE = {
  pending: 'bg-amber-100 text-amber-800',
  confirmed: 'bg-blue-100 text-blue-800',
  processing: 'bg-indigo-100 text-indigo-800',
  shipped: 'bg-purple-100 text-purple-800',
  delivered: 'bg-green-100 text-green-800',
  cancelled: 'bg-stone-200 text-stone-600',
};

export default function OrdersList() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  const status = searchParams.get('status') || '';
  const q = searchParams.get('q') || '';
  const sort = searchParams.get('sort') || 'newest';
  const page = Number(searchParams.get('page') || 1);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    listOrders({ status, q, sort, page, limit: 20 })
      .then((res) => {
        if (!cancelled) setResult(res);
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
  }, [status, q, sort, page]);

  function updateParam(key, value) {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== 'page') next.delete('page');
    setSearchParams(next);
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold text-stone-900">Orders</h1>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input
          type="search"
          defaultValue={q}
          placeholder="Search order #, customer name or email…"
          onKeyDown={(e) => e.key === 'Enter' && updateParam('q', e.currentTarget.value)}
          onBlur={(e) => updateParam('q', e.currentTarget.value)}
          className="w-72 rounded-md border border-stone-300 px-3 py-1.5 text-sm"
        />
        <select
          value={status}
          onChange={(e) => updateParam('status', e.target.value)}
          className="rounded-md border border-stone-300 px-3 py-1.5 text-sm"
        >
          <option value="">All statuses</option>
          {ORDER_STATUSES.map((s) => (
            <option key={s} value={s}>
              {ORDER_STATUS_LABELS[s]}
            </option>
          ))}
        </select>
        <select
          value={sort}
          onChange={(e) => updateParam('sort', e.target.value)}
          className="rounded-md border border-stone-300 px-3 py-1.5 text-sm"
        >
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
          <option value="total_desc">Total: high to low</option>
          <option value="total_asc">Total: low to high</option>
        </select>
      </div>

      {isLoading && <p className="py-16 text-center text-sm text-stone-500">Loading…</p>}
      {!isLoading && error && <p className="py-16 text-center text-sm text-red-600">{error}</p>}

      {!isLoading && !error && result && (
        <>
          <div className="overflow-hidden rounded-lg border border-stone-200 bg-white">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-stone-200 bg-stone-50 text-xs uppercase tracking-wide text-stone-500">
                <tr>
                  <th className="px-4 py-2.5">Order</th>
                  <th className="px-4 py-2.5">Customer</th>
                  <th className="px-4 py-2.5">Placed</th>
                  <th className="px-4 py-2.5">Items</th>
                  <th className="px-4 py-2.5">Total</th>
                  <th className="px-4 py-2.5">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {result.data.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-stone-500">
                      No orders match these filters.
                    </td>
                  </tr>
                )}
                {result.data.map((order) => (
                  <tr key={order.id} className="hover:bg-stone-50">
                    <td className="px-4 py-3">
                      <Link to={`/orders/${order.id}`} className="font-medium text-stone-900 hover:underline">
                        {order.order_number}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-stone-600">
                      <div>{order.customer_name}</div>
                      <div className="text-xs text-stone-400">{order.customer_email}</div>
                    </td>
                    <td className="px-4 py-3 text-stone-600">{formatDate(order.placed_at)}</td>
                    <td className="px-4 py-3 text-stone-600">{order.item_count}</td>
                    <td className="px-4 py-3 font-medium text-stone-900">{formatCurrency(order.grand_total)}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${STATUS_BADGE[order.order_status] ?? 'bg-stone-100 text-stone-600'}`}
                      >
                        {ORDER_STATUS_LABELS[order.order_status] ?? order.order_status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {result.meta.totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between text-sm text-stone-600">
              <span>
                Page {result.meta.page} of {result.meta.totalPages} · {result.meta.total} orders
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => updateParam('page', String(page - 1))}
                  className="rounded-md border border-stone-300 px-3 py-1 disabled:opacity-40"
                >
                  Previous
                </button>
                <button
                  type="button"
                  disabled={page >= result.meta.totalPages}
                  onClick={() => updateParam('page', String(page + 1))}
                  className="rounded-md border border-stone-300 px-3 py-1 disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
