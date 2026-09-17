-- 003_create_coupons (UP)
-- Created before 004 (orders.coupon_id) so that FK can reference it.
-- used_count is incremented inside the SAME transaction that creates an
-- order, via SELECT ... FOR UPDATE on this row before checking
-- usage_limit — see order.controller.js (Phase covering checkout).
USE shope_clothes;

CREATE TABLE coupons (
    id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    code          VARCHAR(64)     NOT NULL UNIQUE,
    type          ENUM('percent', 'fixed') NOT NULL,
    value         DECIMAL(10,2)   NOT NULL,
    min_subtotal  DECIMAL(10,2)   NOT NULL DEFAULT 0,
    usage_limit   INT UNSIGNED    NULL,          -- NULL = unlimited
    used_count    INT UNSIGNED    NOT NULL DEFAULT 0,
    expires_at    DATETIME        NULL,
    is_active     BOOLEAN         NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at    TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP
                                  ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;
