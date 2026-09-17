-- 008_create_reviews (UP)
-- order_id is set at write-time once the "verified purchaser" check
-- passes (an order_items row for this user+product on a paid/delivered
-- order) — persisting it lets the UI show a "Verified buyer" badge
-- without re-querying order_items on every page load. Nullable so a
-- review can't reference an order that gets deleted out from under it.
USE shope_clothes;

CREATE TABLE reviews (
    id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    product_id    BIGINT UNSIGNED NOT NULL,
    user_id       BIGINT UNSIGNED NOT NULL,
    order_id      BIGINT UNSIGNED NULL,
    rating        TINYINT UNSIGNED NOT NULL CHECK (rating BETWEEN 1 AND 5),
    title         VARCHAR(150)    NULL,
    body          TEXT            NULL,
    status        ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'pending',
    created_at    TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id)    REFERENCES users(id)    ON DELETE CASCADE,
    FOREIGN KEY (order_id)   REFERENCES orders(id)   ON DELETE SET NULL,
    INDEX idx_reviews_product_status (product_id, status)
) ENGINE=InnoDB;
