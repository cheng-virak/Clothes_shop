-- 007_create_audit_logs (UP)
-- before_json/after_json are real JSON columns. Redaction (stripping
-- password_hash, tokens, payment fields) happens in application code
-- BEFORE a row is ever written — this table trusts its input, it does
-- not attempt to redact after the fact.
USE shope_clothes;

CREATE TABLE audit_logs (
    id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id       BIGINT UNSIGNED NULL,          -- NULL = system action
    action        VARCHAR(100)    NOT NULL,      -- e.g. 'order.status_changed'
    entity_type   VARCHAR(50)     NOT NULL,      -- e.g. 'order', 'product'
    entity_id     BIGINT UNSIGNED NOT NULL,
    before_json   JSON            NULL,
    after_json    JSON            NULL,
    ip            VARCHAR(45)     NULL,          -- IPv4 or IPv6
    created_at    TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_audit_entity (entity_type, entity_id),
    INDEX idx_audit_created_at (created_at)
) ENGINE=InnoDB;
