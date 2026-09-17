-- 005_order_status_history_actor (UP)
-- Records WHO changed an order's status (NULL = system/automated, e.g.
-- the original "Order placed" row written by checkout itself) — backs
-- the order detail page's timeline ("who did it and when").
USE shope_clothes;

ALTER TABLE order_status_history
  ADD COLUMN changed_by_user_id BIGINT UNSIGNED NULL AFTER order_id,
  ADD CONSTRAINT fk_status_history_user FOREIGN KEY (changed_by_user_id) REFERENCES users(id) ON DELETE SET NULL;
