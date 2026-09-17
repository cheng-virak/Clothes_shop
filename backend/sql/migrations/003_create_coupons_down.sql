-- 003_create_coupons (DOWN)
-- Run 004's down first — orders.coupon_id references this table.
USE shope_clothes;

DROP TABLE IF EXISTS coupons;
