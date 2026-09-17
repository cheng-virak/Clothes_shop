import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useAuthStore } from '../../store/useAuthStore.js';
import { getMyOrders } from '../../api/orderApi.js';
import { formatCurrency } from '../../utils/formatCurrency.js';

export default function Account() {
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const [recentOrders, setRecentOrders] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    getMyOrders({ limit: 3 })
      .then((res) => {
        if (!cancelled) setRecentOrders(res.data);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (!token) {
    return <Navigate to="/login" replace state={{ from: '/account' }} />;
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <h1 className="mb-6 text-2xl font-semibold text-stone-900">My Account</h1>

      <section className="mb-8 rounded-lg border border-stone-200 p-5">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-stone-500">
          Profile
        </h2>
        <dl className="space-y-1 text-sm">
          <div className="flex justify-between">
            <dt className="text-stone-500">Name</dt>
            <dd className="text-stone-900">{user.fullName}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-stone-500">Email</dt>
            <dd className="text-stone-900">{user.email}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-stone-500">Phone</dt>
            <dd className="text-stone-900">{user.phone || '—'}</dd>
          </div>
        </dl>
      </section>

      <section className="mb-8 rounded-lg border border-stone-200 p-5">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-stone-500">
          Saved Addresses
        </h2>
        {/* Honest placeholder: there's no address API yet — see audit notes.
            Not faking a form that would silently do nothing on submit. */}
        <p className="text-sm text-stone-500">
          Saved addresses aren't available yet — for now, enter your shipping address at
          checkout each time.
        </p>
      </section>

      <section className="mb-8 rounded-lg border border-stone-200 p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-500">
            Recent Orders
          </h2>
          <Link
            to="/orders"
            className="flex min-h-11 items-center px-2 text-xs font-medium text-stone-600 underline hover:text-stone-900"
          >
            View all
          </Link>
        </div>

        {isLoading && <p className="text-sm text-stone-500">Loading…</p>}
        {!isLoading && recentOrders.length === 0 && (
          <p className="text-sm text-stone-500">You haven't placed any orders yet.</p>
        )}
        {!isLoading && recentOrders.length > 0 && (
          <ul className="divide-y divide-stone-100 text-sm">
            {recentOrders.map((order) => (
              <li key={order.id} className="flex items-center justify-between py-2">
                <span className="font-mono text-stone-700">{order.order_number}</span>
                <span className="capitalize text-stone-500">{order.order_status}</span>
                <span className="font-medium text-stone-900">
                  {formatCurrency(order.grand_total)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <button
        type="button"
        onClick={logout}
        className="min-h-11 rounded-lg border border-stone-300 px-5 py-2.5 text-sm font-semibold text-stone-700 transition hover:bg-stone-100"
      >
        Log Out
      </button>
    </div>
  );
}
