import { useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { HiOutlineEye, HiOutlineEyeOff } from 'react-icons/hi';
import { useAdminAuthStore } from '../store/useAdminAuthStore.js';
import { login } from '../api/authApi.js';
import EnvBadge from '../components/EnvBadge.jsx';

/**
 * The admin app's own login — it does not reach into the storefront app
 * for this (they're genuinely separate bundles/origins now). Calls the
 * same POST /api/auth/login the storefront uses (one real backend, no
 * duplicated auth logic), but stores the session under this app's own
 * key (see useAdminAuthStore) so the two sessions can never be confused.
 */
export default function Login() {
  const token = useAdminAuthStore((s) => s.token);
  const setSession = useAdminAuthStore((s) => s.setSession);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const returnTo = searchParams.get('returnTo') || '/';

  const [values, setValues] = useState({ email: '', password: '' });
  const [error, setError] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);

  if (token) {
    return <Navigate to={returnTo} replace />;
  }

  const update = (key) => (e) => setValues((v) => ({ ...v, [key]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      const res = await login(values);
      if (!['admin', 'staff'].includes(res.data.user.role)) {
        // A real customer account can authenticate fine — the backend has
        // no reason to refuse a valid password — but this app has nothing
        // for them. Don't store the session; say so plainly.
        setError("This account doesn't have admin or staff access.");
        return;
      }
      setSession(res.data.token, res.data.user);
      navigate(returnTo, { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-stone-50 px-4">
      <div className="w-full max-w-sm rounded-xl border border-stone-200 bg-white p-8 shadow-sm">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-lg font-semibold text-stone-900">Shope Clothes Admin</h1>
          <EnvBadge />
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-stone-700">Email</span>
            <input
              type="email"
              value={values.email}
              onChange={update('email')}
              required
              autoFocus
              className="w-full rounded-md border border-stone-300 px-3 py-2 text-sm focus:border-stone-900 focus:outline-none focus:ring-1 focus:ring-stone-900"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-stone-700">Password</span>
            <div className="relative">
              <input
                type={isPasswordVisible ? 'text' : 'password'}
                value={values.password}
                onChange={update('password')}
                required
                className="w-full rounded-md border border-stone-300 px-3 py-2 pr-10 text-sm focus:border-stone-900 focus:outline-none focus:ring-1 focus:ring-stone-900"
              />
              <button
                type="button"
                onClick={() => setIsPasswordVisible((v) => !v)}
                aria-label={isPasswordVisible ? 'Hide password' : 'Show password'}
                tabIndex={-1}
                className="absolute inset-y-0 right-0 flex items-center px-3 text-stone-400 hover:text-stone-700"
              >
                {isPasswordVisible ? <HiOutlineEyeOff size={18} /> : <HiOutlineEye size={18} />}
              </button>
            </div>
          </label>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-lg bg-stone-900 py-2.5 text-sm font-semibold uppercase tracking-wide text-white transition hover:bg-stone-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? 'Signing in…' : 'Log In'}
          </button>
        </form>
      </div>
    </div>
  );
}
