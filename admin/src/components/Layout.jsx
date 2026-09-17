import { Link } from 'react-router-dom';
import EnvBadge from './EnvBadge.jsx';
import Sidebar from './Sidebar.jsx';
import { useAdminAuthStore } from '../store/useAdminAuthStore.js';

const STOREFRONT_URL = import.meta.env.VITE_STOREFRONT_URL || 'http://localhost:5173';

/**
 * Full admin shell: persistent sidebar + top bar, wrapping every route
 * (including the catch-all 404) so there is never a blank/dead page.
 */
export default function Layout({ children }) {
  const user = useAdminAuthStore((s) => s.user);
  const logout = useAdminAuthStore((s) => s.logout);

  return (
    <div className="min-h-screen bg-stone-50">
      <header className="border-b border-stone-200 bg-white">
        <div className="flex items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <Link to="/" className="text-base font-semibold text-stone-900">
              Shope Clothes Admin
            </Link>
            <EnvBadge />
          </div>

          <div className="flex items-center gap-4 text-sm">
            <a
              href={STOREFRONT_URL}
              target="_blank"
              rel="noreferrer"
              className="text-stone-600 underline hover:text-stone-900"
            >
              View storefront ↗
            </a>
            {user && (
              <>
                <span className="text-stone-500">
                  {user.fullName} <span className="capitalize text-stone-400">({user.role})</span>
                </span>
                <button
                  type="button"
                  onClick={logout}
                  className="rounded-md border border-stone-300 px-3 py-1.5 font-medium text-stone-700 hover:bg-stone-100"
                >
                  Log out
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      <div className="flex">
        <Sidebar />
        <main className="min-w-0 flex-1 px-4 py-8 sm:px-6">{children}</main>
      </div>
    </div>
  );
}
