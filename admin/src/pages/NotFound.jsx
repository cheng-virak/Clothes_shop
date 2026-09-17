import { Link } from 'react-router-dom';
import { NAV_ITEMS } from '../components/navItems.js';

/**
 * Catch-all for any unmatched admin route. Rendered inside the normal
 * Layout (sidebar stays visible) — previously an unmatched route was a
 * blank white page with no way back.
 */
export default function NotFound() {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center rounded-lg border border-dashed border-stone-300 bg-white text-center">
      <h1 className="text-2xl font-semibold text-stone-900">404 — Page not found</h1>
      <p className="mt-2 max-w-sm text-sm text-stone-500">
        There's no admin page at this address. Pick a section from the sidebar, or jump to one below.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        {NAV_ITEMS.map((item) => (
          <Link
            key={item.to}
            to={item.to}
            className="rounded-md border border-stone-300 px-3 py-1.5 text-sm font-medium text-stone-700 hover:bg-stone-100"
          >
            {item.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
