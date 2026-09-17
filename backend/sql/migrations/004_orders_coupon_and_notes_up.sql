-- 004_orders_coupon_and_notes (UP)
-- discount_total (already existed) is only ever an amount. coupon_id is
-- the live FK (ON DELETE SET NULL — deleting a coupon must never corrupt
-- past orders); coupon_code is a point-in-time snapshot so a renamed or
-- deleted coupon still shows what the customer actually typed.
-- Requires 003 (coupons table) to already exist.
USE shope_clothes;

ALTER TABLE orders
  ADD COLUMN internal_notes TEXT NULL,
  ADD COLUMN coupon_id BIGINT UNSIGNED NULL,
  ADD COLUMN coupon_code VARCHAR(64) NULL,
  ADD CONSTRAINT fk_orders_coupon FOREIGN KEY (coupon_id) REFERENCES coupons(id) ON DELETE SET NULL;
