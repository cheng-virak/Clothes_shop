-- 099_drop_products_is_active (UP)
-- HOLD — do not run yet. This is migration 2 of the products.status
-- split: only run this after confirming the storefront lists the same
-- product count under `status = 'active'` as it did under the old
-- `is_active = TRUE` filter (see 001's comment).
USE shope_clothes;

ALTER TABLE products DROP COLUMN is_active;
