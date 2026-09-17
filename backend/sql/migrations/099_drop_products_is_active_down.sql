-- 099_drop_products_is_active (DOWN)
-- Re-adds is_active and backfills it FROM status (the reverse of 001's
-- backfill direction) — 'active' -> TRUE, everything else -> FALSE.
USE shope_clothes;

ALTER TABLE products
  ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT TRUE AFTER base_price;

UPDATE products SET is_active = (status = 'active');
