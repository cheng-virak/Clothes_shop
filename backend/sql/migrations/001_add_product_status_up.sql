-- 001_add_product_status (UP)
-- Adds products.status alongside the existing products.is_active — BOTH
-- columns are kept in sync for now. Column defaults ('active' / TRUE)
-- keep new INSERTs in sync automatically; this backfill syncs existing
-- rows. is_active is NOT dropped here — that's a separate, later migration
-- (099_drop_products_is_active) run only after the storefront is confirmed
-- to show the same product count under the new `status` filter.
USE shope_clothes;

ALTER TABLE products
  ADD COLUMN status ENUM('draft', 'active', 'archived') NOT NULL DEFAULT 'active' AFTER is_active;

UPDATE products SET status = IF(is_active = TRUE, 'active', 'archived');
