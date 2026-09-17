import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useCartStore } from '../../store/useCartStore.js';
import { useAuthStore } from '../../store/useAuthStore.js';
import { createOrder } from '../../api/orderApi.js';
import { syncCartToServer } from '../../api/cartApi.js';
import { formatCurrency } from '../../utils/formatCurrency.js';
import { isOneSize } from '../../utils/formatSize.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^[0-9+\-\s()]{6,20}$/;

function Field({ label, name, error, children }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium text-stone-700">{label}</span>
      {children}
      {error && (
        <span id={`${name}-error`} className="mt-1 block text-xs text-red-600">
          {error}
        </span>
      )}
    </label>
  );
}

const inputClass = (hasError) =>
  `w-full rounded-md border px-3 py-2 text-sm text-stone-900 focus:outline-none focus:ring-1 ${
    hasError
      ? 'border-red-400 focus:border-red-500 focus:ring-red-500'
      : 'border-stone-300 focus:border-stone-900 focus:ring-stone-900'
  }`;

// State/region, postal code and country were dropped from checkout — the
// store ships within one country, so they were friction with no payload.
// The `orders` columns still exist (and older orders still hold real
// values), they're just no longer collected; everything that renders an
// address skips the parts that are empty.
const EMPTY_ADDRESS = {
  recipientName: '',
  email: '',
  line1: '',
  line2: '',
  city: '',
  phone: '',
};

function validateAddress(values) {
  const errors = {};
  if (!values.recipientName.trim()) errors.recipientName = 'Name is required';
  if (!values.email.trim()) errors.email = 'Email is required';
  else if (!EMAIL_RE.test(values.email)) errors.email = 'Enter a valid email';
  if (!values.line1.trim()) errors.line1 = 'Address is required';
  if (!values.city.trim()) errors.city = 'City is required';
  if (!values.phone.trim()) errors.phone = 'Phone is required';
  else if (!PHONE_RE.test(values.phone)) errors.phone = 'Enter a valid phone number';
  return errors;
}

function OrderConfirmation({ order }) {
  return (
    <div className="mx-auto max-w-lg px-4 py-20 text-center">
      <h1 className="text-2xl font-semibold text-stone-900">Order confirmed</h1>
      <p className="mt-2 text-sm text-stone-600">
        Order <span className="font-mono font-medium">{order.orderNumber}</span> has been placed.
      </p>
      <p className="mt-1 text-sm text-stone-600">Total: {formatCurrency(order.grandTotal)}</p>
      <Link
        to="/products"
        className="mt-8 inline-block rounded-lg bg-stone-900 px-6 py-3 text-sm font-semibold uppercase tracking-wide text-white transition hover:bg-stone-700"
      >
        Continue shopping
      </Link>
    </div>
  );
}

export default function Checkout() {
  const items = useCartStore((s) => s.items);
  const subtotal = useCartStore((s) => s.subtotal());
  const clearCart = useCartStore((s) => s.clearCart);
  const token = useAuthStore((s) => s.token);

  const [values, setValues] = useState(EMPTY_ADDRESS);
  const [errors, setErrors] = useState({});
  const [submitError, setSubmitError] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [confirmedOrder, setConfirmedOrder] = useState(null);

  // Clearing the cart in an effect (rather than inline in handleSubmit,
  // right after setConfirmedOrder) matters: zustand's store update and
  // React's own setState are not guaranteed to land in the same render,
  // so clearing inline could produce a transient render where items is
  // already [] but confirmedOrder hasn't committed yet — which would trip
  // the empty-cart guard below and bounce the user back to "/" instead of
  // the confirmation screen. An effect guarantees confirmedOrder is
  // already committed before the cart-clearing render happens.
  useEffect(() => {
    if (confirmedOrder) clearCart();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [confirmedOrder]);

  if (items.length === 0 && !confirmedOrder) {
    return <Navigate to="/products" replace state={{ notice: 'Your cart is empty.' }} />;
  }

  if (confirmedOrder) {
    return <OrderConfirmation order={confirmedOrder} />;
  }

  if (!token) {
    return <Navigate to="/login" replace state={{ from: '/checkout' }} />;
  }

  const update = (key) => (e) => setValues((v) => ({ ...v, [key]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    const fieldErrors = validateAddress(values);
    setErrors(fieldErrors);
    if (Object.keys(fieldErrors).length > 0) return;

    setSubmitError(null);
    setIsSubmitting(true);
    try {
      // The backend builds the order from its own server-side cart, which
      // this local (localStorage) cart was never pushed to until now.
      await syncCartToServer(items);

      const res = await createOrder({
        shippingAddress: {
          recipientName: values.recipientName,
          phone: values.phone,
          line1: values.line1,
          line2: values.line2 || undefined,
          city: values.city,
        },
        // Not part of the orders schema yet — sent for a future contact-email
        // column; the backend currently ignores unrecognized fields.
        contactEmail: values.email,
        paymentMethod: 'cod',
      });
      // Cart is cleared by the effect above, once this commits.
      setConfirmedOrder(res.data);
    } catch (err) {
      setSubmitError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <h1 className="mb-6 text-2xl font-semibold text-stone-900">Checkout</h1>

      <ul className="mb-6 divide-y divide-stone-100 rounded-lg border border-stone-200">
        {items.map((item) => (
          <li key={item.variantId} className="flex justify-between px-4 py-3 text-sm">
            <span>
              {item.title} ({isOneSize(item.size) ? item.color : `${item.size}, ${item.color}`}) × {item.quantity}
            </span>
            <span className="font-medium">{formatCurrency(item.unitPrice * item.quantity)}</span>
          </li>
        ))}
      </ul>

      <div className="mb-8 flex justify-between text-base font-semibold">
        <span>Subtotal</span>
        <span>{formatCurrency(subtotal)}</span>
      </div>

      <h2 className="mb-4 text-lg font-semibold text-stone-900">Shipping address</h2>
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <Field label="Full name" name="recipientName" error={errors.recipientName}>
          <input
            value={values.recipientName}
            onChange={update('recipientName')}
            aria-invalid={Boolean(errors.recipientName)}
            aria-describedby={errors.recipientName ? 'recipientName-error' : undefined}
            className={inputClass(errors.recipientName)}
          />
        </Field>

        <Field label="Email" name="email" error={errors.email}>
          <input
            type="email"
            value={values.email}
            onChange={update('email')}
            aria-invalid={Boolean(errors.email)}
            aria-describedby={errors.email ? 'email-error' : undefined}
            className={inputClass(errors.email)}
          />
        </Field>

        <Field label="Address line 1" name="line1" error={errors.line1}>
          <input
            value={values.line1}
            onChange={update('line1')}
            aria-invalid={Boolean(errors.line1)}
            aria-describedby={errors.line1 ? 'line1-error' : undefined}
            className={inputClass(errors.line1)}
          />
        </Field>

        <Field label="Address line 2 (optional)" name="line2">
          <input value={values.line2} onChange={update('line2')} className={inputClass(false)} />
        </Field>

        <Field label="City" name="city" error={errors.city}>
          <input
            value={values.city}
            onChange={update('city')}
            aria-invalid={Boolean(errors.city)}
            aria-describedby={errors.city ? 'city-error' : undefined}
            className={inputClass(errors.city)}
          />
        </Field>

        <Field label="Phone" name="phone" error={errors.phone}>
          <input
            type="tel"
            value={values.phone}
            onChange={update('phone')}
            aria-invalid={Boolean(errors.phone)}
            aria-describedby={errors.phone ? 'phone-error' : undefined}
            className={inputClass(errors.phone)}
          />
        </Field>

        {submitError && (
          <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {submitError}
          </p>
        )}

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full rounded-lg bg-stone-900 py-3 text-sm font-semibold uppercase tracking-wide text-white transition hover:bg-stone-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSubmitting ? 'Placing order…' : 'Place Order'}
        </button>
      </form>
    </div>
  );
}
