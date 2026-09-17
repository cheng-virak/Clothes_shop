-- 002_add_staff_role (UP)
-- Widens users.role to add 'staff' (orders + inventory access only, see
-- isStaffOrAdmin middleware). Existing 'customer'/'admin' values are
-- untouched — MySQL ENUM widening is safe and doesn't require a backfill.
USE shope_clothes;

ALTER TABLE users
  MODIFY COLUMN role ENUM('customer', 'staff', 'admin') NOT NULL DEFAULT 'customer';
