-- 005_order_status_history_actor (DOWN)
USE shope_clothes;

ALTER TABLE order_status_history
  DROP FOREIGN KEY fk_status_history_user,
  DROP COLUMN changed_by_user_id;
