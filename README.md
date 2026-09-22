# Shope Clothes

One Express + PostgreSQL API, two independent React/Vite clients: the
customer storefront and the admin dashboard. Each client is its own app on
its own port — not a shared bundle with a route prefix.

## Ports

| App | Port | Folder | What it is |
|---|---|---|---|
| API | **5000** | `backend/` | Express + PostgreSQL (node-postgres). `PORT` in `backend/.env` — this is the real value, change it there if you ever need to. |
| Storefront | **5173** | `frontend/` | Customer-facing shop. |
| Admin | **5174** | `admin/` | Back-office. No `/admin` prefix in its routes — the whole app *is* the admin, so its routes read `/`, `/login`, `/products`, etc. |

## Running it

This is an npm workspace (`frontend`, `admin`, `backend`, `shared`) — install once from the root:

```powershell
npm install
```

The API needs a PostgreSQL database. Copy `backend/.env.example` to
`backend/.env` and set `DATABASE_URL` to your connection string. The
project runs on [Neon](https://neon.tech) (Dashboard → Connect); use the
**pooled** endpoint, whose host contains `-pooler`, not the direct one.

Neon's copy-paste string ends in `?sslmode=require&channel_binding=require`.
Both are fine to leave in — `backend/src/config/db.js` strips them and sets
TLS itself, so the server certificate is genuinely verified rather than
left to a driver default that is about to change. See the comment there.

Then create the tables, and the baseline data (categories, store settings,
the admin account):

```powershell
npm run migrate --workspace=backend
npm run seed --workspace=backend
```

Both are safe to re-run: `migrate` skips any migration already recorded in
`schema_migrations`, and `seed` only ever inserts what's missing, so
neither touches a database that already has real data.

### Schema changes

Every change to the schema is a new numbered file in `backend/migrations/`
(`002_...sql`, `003_...sql`, …), never an edit to one that has already
been applied. `npm run migrate` applies the ones that haven't run yet, in
filename order, each inside its own transaction.

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

## Checking the API still works

```powershell
npm run smoke --workspace=backend
```

Runs [backend/scripts/smoke.js](backend/scripts/smoke.js) — ~120 assertions
covering every route, in-process via supertest, so there's no server to
start first. It checks the things that only show up end to end: permission
tiers, stock decrementing on checkout and coming back on cancel, the order
state machine, unique-constraint conflicts, partial updates, and the
snapshot that keeps an order readable after its product is deleted.

It writes to whatever `DATABASE_URL` points at and deletes its own records
afterwards — every row it creates is tagged with a run timestamp so the
cleanup only removes its own. Still, point it at a development database,
not one holding real orders. It needs `migrate` and `seed` to have been run.

There is no unit-test suite; this is the whole automated check.

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
Every admin-gated endpoint checks the JWT's role server-side regardless of
which client — or `curl` — called it. There are two tiers:

| Middleware | Covers | Roles |
|---|---|---|
| `isStaffOrAdmin` | `/api/admin/orders/*`, `/api/admin/inventory/*` | `staff`, `admin` |
| `isAdmin` | `/api/admin/products/*`, `/api/admin/categories/*`, `POST /api/products`, `/api/products/:id/images*` | `admin` |

A customer-role token gets `403` from all of them even when called
directly, bypassing both UIs entirely. `verifyToken` also re-reads the
user's role and `is_active` from the database on every request, so
deactivating an account or demoting an admin takes effect immediately
rather than when their token expires.

## Route table (today)

**Storefront** (`:5173`): `/`, `/products`, `/products/:slug`, `/checkout`,
`/orders`, `/account`, `/login`, `/signup`, `/forgot-password`, `/about`,
`/contact`, `/size-guide`, `/shipping-returns`, `*` → 404.

**Admin** (`:5174`):

| Path | Page | Roles |
|---|---|---|
| `/login` | Login | public |
| `/` | Dashboard | staff, admin |
| `/orders`, `/orders/:id` | Order list / detail | staff, admin |
| `/inventory` | Stock by variant, CSV import | staff, admin |
| `/products`, `/products/:id` | Product list / editor | admin |
| `/categories` | Category tree | admin |
| `/customers`, `/reviews` | `NotBuiltYet` placeholder | staff, admin |
| `/coupons`, `/audit-log`, `/settings` | `NotBuiltYet` placeholder | admin |
| `*` | NotFound, with the sidebar still rendered | staff, admin |

Every path in `navItems.js` has a route here — a real page or an explicit
`NotBuiltYet` screen — so the sidebar never links anywhere dead. The
placeholder sections have working API endpoints in some cases but no UI;
`audit_logs` in particular is being written to on every admin mutation
already, it just has no screen to read it back yet.

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

## Deploying to Vercel

Three Vercel projects, all importing **this same repository**, each with a
different **Root Directory**. Create them with *Add New → Project*, import
the repo, then click *Edit* next to Root Directory before the first deploy.

| Project | Root Directory | Framework | Config |
|---|---|---|---|
| Storefront | `frontend` | Vite (auto) | [frontend/vercel.json](frontend/vercel.json) |
| Admin | `admin` | Vite (auto) | [admin/vercel.json](admin/vercel.json) |
| API | `backend` | Express (auto) | [backend/vercel.json](backend/vercel.json) |

The API needs no build config: Vercel detects an Express app by filename,
finds [backend/src/app.js](backend/src/app.js) exporting the app, and turns
it into a single Function. (That detection is also why the long-running
local entrypoint is called `src/start.js` and not `src/server.js` — see the
comment at the top of that file.) `backend/vercel.json` pins the Function
to `sin1` (Singapore) so it sits next to the Neon database in
`ap-southeast-1`; leaving it on the default US region would add a
round-trip of latency to *every* query.

### Environment variables to set in each project

**API** (`backend`) — Settings → Environment Variables:

| Variable | Value |
|---|---|
| `DATABASE_URL` | Your Neon **pooled** connection string |
| `JWT_SECRET` | A long random string — do not reuse the local one |
| `CORS_ORIGINS` | `https://<storefront>.vercel.app,https://<admin>.vercel.app` |
| `NODE_ENV` | `production` — this is what stops stack traces being returned to clients |

**Storefront** (`frontend`) and **Admin** (`admin`):

| Variable | Value |
|---|---|
| `VITE_API_BASE_URL` | `https://<api>.vercel.app/api` |
| `VITE_ENV_LABEL` | admin only — `PRODUCTION` |
| `VITE_STOREFRONT_URL` | admin only — the storefront's URL |

Because the three apps are on three domains, every API call is
cross-origin. `CORS_ORIGINS` is an exact-match allowlist, so a domain
missing from it fails in the browser with no server-side error to find.
Preview deployments get a fresh URL per commit and are **not** covered —
add one explicitly if you need to test against it.

### Product images

Connect a **Blob store** to the API project (Storage → Blob → Connect).
Vercel then injects `BLOB_READ_WRITE_TOKEN`, and
[src/storage/index.js](backend/src/storage/index.js) switches uploads from
local disk to Vercel Blob automatically.

This is not optional in production. A Function's filesystem is read-only,
so without a Blob store the admin's image upload returns a 500 — and
`express.static()`, which serves `/uploads` locally, does nothing on Vercel
either. With Blob connected, images are stored at absolute CDN URLs and
never pass through Express at all.

Locally, leave `BLOB_READ_WRITE_TOKEN` unset and uploads keep going to
`backend/uploads` with no setup.

### Database

Run the migrations against the production database once, from your machine,
with `DATABASE_URL` pointing at it — there is no build-step hook that does
this for you:

```powershell
npm run migrate --workspace=backend
npm run seed --workspace=backend
```

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
