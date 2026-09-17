-- 004_orders_coupon_and_notes (DOWN)
USE shope_clothes;

ALTER TABLE orders
  DROP FOREIGN KEY fk_orders_coupon,
  DROP COLUMN coupon_id,
  DROP COLUMN coupon_code,
  DROP COLUMN internal_notes;
