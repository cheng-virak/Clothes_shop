import { useAdminAuthStore } from '../store/useAdminAuthStore.js';

const STOREFRONT_URL = import.meta.env.VITE_STOREFRONT_URL || 'http://localhost:5173';

/**
 * Shown to a logged-in user whose role isn't allowed here — never a
 * silent redirect. They know exactly why they can't proceed and what to
 * do next, rather than mysteriously bouncing somewhere else.
 */
export default function AccessDenied() {
  const user = useAdminAuthStore((s) => s.user);
  const logout = useAdminAuthStore((s) => s.logout);

  return (
    <div className="flex min-h-screen items-center justify-center bg-stone-50 px-4">
      <div className="max-w-sm text-center">
        <h1 className="text-xl font-semibold text-stone-900">You don't have access to this area</h1>
        <p className="mt-2 text-sm text-stone-600">
          {user ? (
            <>
              Signed in as <span className="font-medium">{user.email}</span> (
              <span className="capitalize">{user.role}</span>) — this account isn't an admin or
              staff account.
            </>
          ) : (
            'This account is not authorized for the admin area.'
          )}
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <a
            href={STOREFRONT_URL}
            className="rounded-lg border border-stone-300 px-4 py-2 text-sm font-medium text-stone-700 hover:bg-stone-100"
          >
            Go to storefront
          </a>
          <button
            type="button"
            onClick={logout}
            className="rounded-lg bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-700"
          >
            Log out
          </button>
        </div>
      </div>
    </div>
  );
}
