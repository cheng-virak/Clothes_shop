import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/useAuthStore.js';
import { login, register } from '../api/authApi.js';

/**
 * Standalone login/register page. Reachable directly from the account
 * menu, and also the redirect target for any page that requires auth
 * (Checkout, Orders) — those pass `state.from` so we can send the user
 * back to what they were doing once they're signed in.
 */
export default function Login() {
  const token = useAuthStore((s) => s.token);
  const setSession = useAuthStore((s) => s.setSession);
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from ?? '/';

  // /login and /signup render this same component — the URL is the source
  // of truth for which mode is showing, so a bookmark or a direct link to
  // /signup lands on the register form, not just a toggle button click.
  const mode = location.pathname === '/signup' ? 'register' : 'login';
  const [values, setValues] = useState({ fullName: '', email: '', password: '' });
  const [error, setError] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (token) {
    return <Navigate to={from} replace />;
  }

  const update = (key) => (e) => setValues((v) => ({ ...v, [key]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      const res =
        mode === 'login'
          ? await login({ email: values.email, password: values.password })
          : await register(values);
      setSession(res.data.token, res.data.user);
      navigate(from, { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-sm px-4 py-16">
      <h1 className="mb-1 text-xl font-semibold text-stone-900">
        {mode === 'login' ? 'Log in' : 'Create an account'}
      </h1>
      <p className="mb-6 text-sm text-stone-500">
        {mode === 'login'
          ? 'Welcome back — log in to check out and view your orders.'
          : 'Orders are tied to your account so you can track them later.'}
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        {mode === 'register' && (
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-stone-700">Full name</span>
            <input
              value={values.fullName}
              onChange={update('fullName')}
              required
              className="w-full rounded-md border border-stone-300 px-3 py-2 text-sm focus:border-stone-900 focus:outline-none focus:ring-1 focus:ring-stone-900"
            />
          </label>
        )}
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-stone-700">Email</span>
          <input
            type="email"
            value={values.email}
            onChange={update('email')}
            required
            className="w-full rounded-md border border-stone-300 px-3 py-2 text-sm focus:border-stone-900 focus:outline-none focus:ring-1 focus:ring-stone-900"
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-stone-700">Password</span>
          <input
            type="password"
            value={values.password}
            onChange={update('password')}
            required
            minLength={mode === 'register' ? 8 : undefined}
            className="w-full rounded-md border border-stone-300 px-3 py-2 text-sm focus:border-stone-900 focus:outline-none focus:ring-1 focus:ring-stone-900"
          />
        </label>

        {mode === 'login' && (
          <Link to="/forgot-password" className="block text-right text-xs text-stone-500 underline hover:text-stone-900">
            Forgot password?
          </Link>
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full rounded-lg bg-stone-900 py-3 text-sm font-semibold uppercase tracking-wide text-white transition hover:bg-stone-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSubmitting ? 'Please wait…' : mode === 'login' ? 'Log In' : 'Create Account'}
        </button>
      </form>

      <button
        type="button"
        onClick={() => {
          setError(null);
          // Preserve state.from across the switch so a checkout/orders
          // redirect still resolves correctly after registering instead.
          navigate(mode === 'login' ? '/signup' : '/login', { state: location.state });
        }}
        className="mt-4 text-sm text-stone-500 underline hover:text-stone-900"
      >
        {mode === 'login' ? "Don't have an account? Create one" : 'Already have an account? Log in'}
      </button>
    </div>
  );
}
