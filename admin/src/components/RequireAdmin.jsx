import { Navigate, useLocation } from 'react-router-dom';
import { useAdminAuthStore } from '../store/useAdminAuthStore.js';
import AccessDenied from '../pages/AccessDenied.jsx';

/**
 * Route guard. This is convenience only — every real enforcement happens
 * server-side (isAdmin / isStaffOrAdmin middleware on each endpoint); a
 * hostile client could skip this entirely and the API would still refuse
 * the request. What this DOES do: a logged-out visitor is sent to /login
 * with ?returnTo=<path> (a real query param, not router state, so it
 * survives a hard refresh) and lands back where they wanted after
 * logging in; a logged-in but wrong-role user sees a clear "no access"
 * page instead of a silent redirect.
 */
export default function RequireAdmin({ roles = ['admin'], children }) {
  const token = useAdminAuthStore((s) => s.token);
  const user = useAdminAuthStore((s) => s.user);
  const location = useLocation();

  if (!token) {
    const returnTo = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?returnTo=${returnTo}`} replace />;
  }

  if (!roles.includes(user?.role)) {
    return <AccessDenied />;
  }

  return children;
}
