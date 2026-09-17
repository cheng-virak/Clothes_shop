-- 002_add_staff_role (DOWN)
-- Fails with an ENUM truncation error if any user currently has
-- role = 'staff' — MySQL won't silently drop values that are in use.
-- Reassign those users to 'customer' or 'admin' first if you need to
-- reverse this after staff accounts exist.
USE shope_clothes;

ALTER TABLE users
  MODIFY COLUMN role ENUM('customer', 'admin') NOT NULL DEFAULT 'customer';
