# Shope Clothes

One Express + MongoDB API, two independent React/Vite clients: the customer
storefront and the admin dashboard. Each client is its own app on its own
port — not a shared bundle with a route prefix.

## Ports

| App | Port | Folder | What it is |
|---|---|---|---|
| API | **5000** | `backend/` | Express + MongoDB (Mongoose). `PORT` in `backend/.env` — this is the real value, change it there if you ever need to. |
| Storefront | **5173** | `frontend/` | Customer-facing shop. |
| Admin | **5174** | `admin/` | Back-office. No `/admin` prefix in its routes — the whole app *is* the admin, so its routes read `/`, `/login`, `/products`, etc. |

## Running it

This is an npm workspace (`frontend`, `admin`, `backend`, `shared`) — install once from the root:

```powershell
npm install
```

The API needs a MongoDB database. Copy `backend/.env.example` to
`backend/.env` and set `MONGODB_URI` to your MongoDB Atlas connection string
(Atlas → Database → Connect → Drivers). In Atlas, **Network Access** must
allow the IP the backend runs from, or the connection times out. MongoDB
must be a replica set (every Atlas cluster is) — checkout and order status
changes run in transactions, which a standalone local `mongod` can't do.

Then create the baseline data — categories, store settings, and the admin
account:

```powershell
npm run seed --workspace=backend
```

It only ever inserts what's missing, so it's safe to run against a database
that already has real data.

Run everything together:

```powershell
npm run dev
```

Starts all three with colored, prefixed log output (`[api]`, `[shop]`, `[admin]`).

Run one app alone:

```powershell
npm run dev:api      # backend only, :5000
npm run dev:shop     # storefront only, :5173
npm run dev:admin    # admin only, :5174
```

Build both clients for production:

```powershell
npm run build
```

## Logging into the admin app

The seed script creates one admin account (`backend/scripts/seed.js` — the
credentials are also printed to the terminal when it creates the account):

- **Email:** `admin@shopeclothes.test`
- **Password:** `Admin123!`

Open **http://localhost:5174**, you'll land on `/login` (unauthenticated
visitors are always sent there, with `?returnTo=<path>` so you land back on
the page you wanted afterward — not dumped on the home page). Log in with
the credentials above.

A customer account (`role: 'customer'`) can authenticate fine — the
password check has no reason to fail — but the admin app refuses to store
that session and shows an error, and every admin-gated API route rejects
that role's token with `403` regardless of which app called it.

## Session isolation

Auth stays **JWT Bearer in `localStorage`**, deliberately — this is what
makes two ports give two real, independent sessions: `localStorage` is
partitioned by origin, and the port is part of the origin, so
`localhost:5173` and `localhost:5174` can never see each other's storage.
The two apps also use different storage keys as a second, belt-and-braces
layer (`shope-auth` for the storefront, `shope-admin-token` for admin) —
verified: logging into the admin app does not log you into the storefront,
and vice versa, and each app's `localStorage` only ever contains its own key.

> **If anyone ever proposes moving auth to an httpOnly cookie: stop.**
> Cookies are **not** isolated by port — `localhost:5173` and
> `localhost:5174` share the same cookie jar (cookies are scoped by
> hostname, not full origin), so the session isolation this whole
> restructure buys would silently disappear. That change would need
> separate hostnames instead (e.g. `shop.` / `admin.` subdomains), not
> just separate ports.

## CORS

`backend/.env` → `CORS_ORIGINS` — a comma-separated **allowlist**, never a
wildcard (a wildcard is invalid anyway once `credentials: true` is set,
which this API uses):

```
CORS_ORIGINS=http://localhost:5173,http://localhost:5174
```

A request from any other `Origin` is rejected with a real `403` (not a
generic 500 — the rejection is a proper `ApiError`, see `backend/src/app.js`).
Requests with no `Origin` header at all (curl, server-to-server, same-origin)
are allowed through, since there's no origin to check.

## Role guard — enforced server-side, not just hidden in the UI

Running the admin app on a different port is **packaging, not security**.
Every admin-gated endpoint checks the JWT's role server-side
(`isAdmin` middleware) regardless of which client — or `curl` — called it.
Today that's the product-management endpoints
(`POST /api/products`, the `/api/products/:id/images*` routes); a
customer-role token gets `403 {"message":"Admin access required"}` from
all of them even when called directly, bypassing both UIs entirely.

A dedicated `/api/admin/*` route namespace, an `isStaffOrAdmin` middleware
tier, and the orders/inventory/dashboard screens themselves are **not
built yet** — that's a separate, not-yet-started admin-dashboard build.
This restructuring only moved and re-homed what already existed.

## Route table (today)

**Storefront** (`:5173`): `/`, `/products`, `/products/:slug`, `/checkout`,
`/orders`, `/account`, `/login`, `/signup`, `/forgot-password`, `/about`,
`/contact`, `/size-guide`, `/shipping-returns`, `*` → 404.

**Admin** (`:5174`): `/login`, `/` (redirects to `/products` — no dashboard
page exists yet), `/products`, `/products/:id/images`.

## `/shared`

The one package both clients import from, for things that must never
drift apart between the two apps:

- `@shope/shared/format` — `formatCurrency`, `formatDate`, `formatRelativeTime`.
- `@shope/shared/orderStatus` — the current `orders.order_status` values (mirrors the DB enum exactly).
- `@shope/shared/authSchemas` — the zod register/login schemas. `backend/src/validators/auth.validator.js` imports these directly rather than redefining them, so the shape can't silently diverge between what the server accepts and what a client form validates.
- `shared/tailwind-preset.js` — shared design **tokens** (color palette) via a Tailwind preset, not shared components. The two apps have different densities/layouts (editorial retail vs. back-office tables) — sharing markup this early would fight both of them.

No UI components live here on purpose.

## Environment badge

The admin header always shows a badge (`VITE_ENV_LABEL` in `admin/.env` —
`LOCAL` / `STAGING` / `PRODUCTION`) so nobody edits real data while
thinking they're on a local sandbox. It's an explicit env var, never
inferred from the URL — a staging domain can look production-ish enough to
fool that heuristic.

## Production notes (not implemented yet — written here for when it matters)

- **The admin app deploys separately**, to its own subdomain (e.g.
  `admin.shopeclothes.com`), built independently (`npm run build --workspace=admin`)
  from the storefront (`admin.shopeclothes.com` ≠ `shopeclothes.com` — once
  real hostnames exist, put each client's build behind its own hostname,
  not just its own port).
- **Put the admin app behind an extra layer at the reverse proxy** — an IP
  allowlist or HTTP basic auth in front of the whole app — on top of, not
  instead of, the JWT role guard. Two independent layers; neither should be
  the only thing standing between the public internet and this app.
- `admin/index.html` already ships `<meta name="robots" content="noindex, nofollow">`
  and `admin/public/robots.txt` already has `Disallow: /` — both are live
  today, not deferred, since they cost nothing to ship early.
