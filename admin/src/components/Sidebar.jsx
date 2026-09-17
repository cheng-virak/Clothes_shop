import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { NAV_ITEMS } from './navItems.js';
import { listOrders } from '../api/ordersApi.js';

export default function Sidebar() {
  const location = useLocation();
  const [pendingCount, setPendingCount] = useState(null);

  useEffect(() => {
    // Badge on Orders — count "awaiting action" (pending). Best-effort:
    // if this fails (e.g. a staff token without orders access yet), the
    // badge just doesn't render rather than breaking the sidebar.
    listOrders({ status: 'pending', limit: 1 })
      .then((res) => setPendingCount(res.meta.total))
      .catch(() => setPendingCount(null));
  }, []);

  return (
    <nav className="flex w-56 shrink-0 flex-col gap-1 border-r border-stone-200 bg-white p-3">
      {NAV_ITEMS.map((item) => {
        const isActive = item.exact ? location.pathname === item.to : location.pathname.startsWith(item.to);
        const Icon = item.icon;
        return (
          <Link
            key={item.to}
            to={item.to}
            aria-current={isActive ? 'page' : undefined}
            className={`flex items-center justify-between rounded-md px-3 py-2 text-sm font-medium transition ${
              isActive ? 'bg-stone-900 text-white' : 'text-stone-600 hover:bg-stone-100 hover:text-stone-900'
            }`}
          >
            <span className="flex items-center gap-2.5">
              <Icon size={18} />
              {item.label}
            </span>
            {item.label === 'Orders' && pendingCount > 0 && (
              <span
                className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                  isActive ? 'bg-white text-stone-900' : 'bg-stone-900 text-white'
                }`}
              >
                {pendingCount}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
