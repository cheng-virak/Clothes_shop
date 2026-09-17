# Migrations

Run manually via the `mysql` CLI, in numeric order — there's no migration
framework/runner in this project (matches the existing `schema.sql` /
`seed.sql` hand-run convention). Each migration is an `_up.sql` / `_down.sql`
pair; the down file reverses that migration only, run in reverse numeric
order if reversing more than one.

```powershell
$env:MYSQL_PWD = "<password>"
Get-Content -Raw sql\migrations\001_add_product_status_up.sql | & mysql -u root
$env:MYSQL_PWD = $null
```

## Applied (2026-09-16)
001 → 012, in order. `099_drop_products_is_active` is written but **held** —
do not run it without separately confirming the storefront's product count
first (see that file's comment).

## Reversed (2026-09-17)
009's down script was run — `blog_posts` was dropped (table was empty,
0 rows, and never wired to any app code) after the Blog feature was
removed from both apps entirely (not deferred — the storefront `/blog`
page, its Navbar/Footer links, and the admin sidebar's Blog placeholder
were all deleted). Backup: `backend/backups/shope_clothes_pre_drop_blog_2026-09-17_125108.sql`
(39.8 KB). If Blog is ever wanted again, re-run `009_create_blog_posts_up.sql`.

## Log
- Backup taken before any migration: `backend/backups/shope_clothes_pre_admin_migration_2026-09-16_135146.sql` (24.2 KB)
- Backup taken before migration 011: `backend/backups/shope_clothes_pre_categories_migration_2026-09-16_151825.sql` (36.6 KB)
- 001: added `products.status`, backfilled from `is_active` (11/11 rows → `active`). `is_active` column kept, not dropped.
- 002: widened `users.role` to include `'staff'`.
- 003: created `coupons`.
- 004: added `orders.internal_notes`, `orders.coupon_id` (FK → coupons, `ON DELETE SET NULL`), `orders.coupon_code` (snapshot).
- 005: added `order_status_history.changed_by_user_id` (FK → users, `ON DELETE SET NULL`).
- 006: added `product_images.width` / `.height` (nullable).
- 007: created `audit_logs`.
- 008: created `reviews` (with nullable `order_id` FK for the verified-buyer badge).
- 009: created `blog_posts` (status + published_at, no separate schedule column/cron).
- 010: created `settings` (single row, `id=1`, seeded with USD / Asia/Phnom_Penh / 8% tax=0 default / $5 flat shipping / low-stock threshold 5).
- 011: added `categories.image_url` (nullable) and `categories.sort_order` (backfilled from `id`, so existing rows kept their insertion order) — needed by the admin Categories screen (reorder + per-category image).
- 012: `order_items.variant_id` FK changed from blocking (`RESTRICT`) to `ON DELETE SET NULL`, and the column made nullable. Unblocks hard-deleting a product that's been ordered — every order_items row already snapshots what was bought (title/sku/size/color/price/qty) independent of the live variant, and nothing in the app joins back through `variant_id` when displaying an order, so a deleted product's past orders keep their full displayed detail and just lose the live back-reference. Backup: `backend/backups/shope_clothes_pre_force_delete_migration_2026-09-16_154535.sql` (39.7 KB).

Also updated (application code, not a migration): the 3 real `is_active`
query sites in `product.controller.js` now filter `status = 'active'`;
`GET /api/products/:identifier` gained a status filter it never had before
(previously returned draft/archived products with no check at all) — verified
live by temporarily drafting product id 2: list count dropped 11→10, direct
slug fetch returned a real 404, then reverted back to `active` (count
returned to 11).

**Not done in this pass** (explicitly out of scope for a migration-only
turn, flagged for later): cart-validation flagging a cart line whose product
became archived ("no longer available") — needs the cart-validation
endpoint that doesn't exist yet; an admin-scoped, status-agnostic product
fetch so staff can open a draft product to edit it — needs the
`/api/admin/products` namespace from Phase 3 of the build order.
