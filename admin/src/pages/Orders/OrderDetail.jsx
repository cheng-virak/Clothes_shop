import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { formatCurrency, formatDate } from '@shope/shared/format';
import { ORDER_STATUS_LABELS, ORDER_STATUS_TRANSITIONS } from '@shope/shared/orderStatus';
import { getOrder, updateOrderStatus } from '../../api/ordersApi.js';

export default function OrderDetail() {
  const { id } = useParams();
  const [order, setOrder] = useState(null);
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);

  const reload = useCallback(() => {
    setIsLoading(true);
    getOrder(id)
      .then((res) => setOrder(res.data))
      .catch((err) => setError(err.message))
      .finally(() => setIsLoading(false));
  }, [id]);

  useEffect(() => {
    reload();
  }, [reload]);

  async function handleTransition(nextStatus) {
    if (nextStatus === 'cancelled' && !window.confirm('Cancel this order? Stock will be restored if applicable.')) {
      return;
    }
    setIsUpdating(true);
    try {
      const res = await updateOrderStatus(id, { status: nextStatus });
      if (res.data.stockRestored) {
        toast.success(`Order cancelled — stock restored for ${order.items.length} line item(s)`);
      } else {
        toast.success(`Order marked ${ORDER_STATUS_LABELS[nextStatus]}`);
      }
      reload();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setIsUpdating(false);
    }
  }

  if (isLoading) return <p className="py-16 text-center text-sm text-stone-500">Loading…</p>;
  if (error) return <p className="py-16 text-center text-sm text-red-600">{error}</p>;
  if (!order) return null;

  const legalNextStatuses = ORDER_STATUS_TRANSITIONS[order.order_status] ?? [];

  return (
    <div>
      <Link to="/orders" className="mb-4 inline-block text-sm text-stone-500 hover:text-stone-900">
        ← Back to orders
      </Link>

      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-stone-900">{order.order_number}</h1>
          <p className="text-sm text-stone-500">Placed {formatDate(order.placed_at)}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-stone-900 px-3 py-1 text-xs font-semibold text-white">
            {ORDER_STATUS_LABELS[order.order_status]}
          </span>
          {legalNextStatuses.length === 0 && (
            <span className="text-xs text-stone-400">Final status — no further transitions.</span>
          )}
          {legalNextStatuses.map((next) => (
            <button
              key={next}
              type="button"
              disabled={isUpdating}
              onClick={() => handleTransition(next)}
              className={`rounded-md border px-3 py-1.5 text-xs font-semibold disabled:opacity-50 ${
                next === 'cancelled'
                  ? 'border-red-300 text-red-700 hover:bg-red-50'
                  : 'border-stone-300 text-stone-700 hover:bg-stone-100'
              }`}
            >
              Mark {ORDER_STATUS_LABELS[next]}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="rounded-lg border border-stone-200 bg-white lg:col-span-2">
          <header className="border-b border-stone-200 px-4 py-3">
            <h2 className="text-sm font-semibold text-stone-900">Items</h2>
          </header>
          <ul className="divide-y divide-stone-100">
            {order.items.map((item) => (
              <li key={item.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                <div>
                  <p className="font-medium text-stone-900">{item.product_title}</p>
                  <p className="text-xs text-stone-500">
                    {item.size_code === 'ONE_SIZE' ? 'One Size' : item.size_code} · {item.color_name} · {item.sku} ·
                    Qty {item.quantity}
                  </p>
                </div>
                <span className="font-medium text-stone-900">{formatCurrency(item.line_total)}</span>
              </li>
            ))}
          </ul>
          <div className="space-y-1 border-t border-stone-200 px-4 py-3 text-sm">
            <div className="flex justify-between text-stone-600">
              <span>Subtotal</span>
              <span>{formatCurrency(order.subtotal)}</span>
            </div>
            <div className="flex justify-between text-stone-600">
              <span>Shipping</span>
              <span>{formatCurrency(order.shipping_fee)}</span>
            </div>
            <div className="flex justify-between text-stone-600">
              <span>Tax</span>
              <span>{formatCurrency(order.tax_total)}</span>
            </div>
            {order.discount_total > 0 && (
              <div className="flex justify-between text-stone-600">
                <span>Discount</span>
                <span>-{formatCurrency(order.discount_total)}</span>
              </div>
            )}
            <div className="flex justify-between text-base font-semibold text-stone-900">
              <span>Total</span>
              <span>{formatCurrency(order.grand_total)}</span>
            </div>
          </div>
        </section>

        <div className="space-y-6">
          <section className="rounded-lg border border-stone-200 bg-white p-4">
            <h2 className="mb-2 text-sm font-semibold text-stone-900">Customer</h2>
            <p className="text-sm text-stone-700">{order.customer_name}</p>
            <p className="text-sm text-stone-500">{order.customer_email}</p>
            {order.customer_phone && <p className="text-sm text-stone-500">{order.customer_phone}</p>}
            <div className="mt-2 text-sm text-stone-500">
              <p>{order.shipping_name}</p>
              <p>{order.shipping_phone}</p>
              <p>{order.shipping_line1}</p>
              {order.shipping_line2 && <p>{order.shipping_line2}</p>}
              {/* State/postal/country aren't collected at checkout any more,
                  so each part renders only if the order actually carries it
                  — older orders still have real values here. */}
              <p>
                {[order.shipping_city, order.shipping_state, order.shipping_postal]
                  .filter(Boolean)
                  .join(', ')}
              </p>
              {order.shipping_country && <p>{order.shipping_country}</p>}
            </div>
            {order.tracking_number && (
              <p className="mt-2 text-xs text-stone-500">
                Tracking: {order.tracking_number} {order.tracking_carrier ? `(${order.tracking_carrier})` : ''}
              </p>
            )}

            {order.otherOrdersByCustomer.length > 0 && (
              <div className="mt-4 border-t border-stone-100 pt-3">
                <p className="mb-1 text-xs font-medium uppercase tracking-wide text-stone-400">
                  Other orders from this customer
                </p>
                <ul className="space-y-1">
                  {order.otherOrdersByCustomer.map((o) => (
                    <li key={o.id}>
                      <Link to={`/orders/${o.id}`} className="text-xs text-stone-600 hover:underline">
                        {o.order_number} · {formatCurrency(o.grand_total)} · {ORDER_STATUS_LABELS[o.order_status]}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>

          <section className="rounded-lg border border-stone-200 bg-white p-4">
            <h2 className="mb-2 text-sm font-semibold text-stone-900">Status history</h2>
            <ul className="space-y-2">
              {order.statusHistory.map((h) => (
                <li key={h.id} className="text-xs">
                  <span className="font-medium text-stone-700">{ORDER_STATUS_LABELS[h.status] ?? h.status}</span>
                  <span className="text-stone-400"> · {formatDate(h.changed_at)}</span>
                  {h.changed_by_name && <span className="text-stone-400"> · {h.changed_by_name}</span>}
                  {h.note && <p className="mt-0.5 text-stone-500">{h.note}</p>}
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
