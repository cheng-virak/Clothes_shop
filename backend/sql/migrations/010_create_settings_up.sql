-- 010_create_settings (UP)
-- Single-row table (CHECK id = 1), not EAV — the app always reads/writes
-- this one row, never has to handle "no settings exist yet". Seeded with
-- the values you specified: USD, Asia/Phnom_Penh, flat tax rate, the
-- existing $5 flat shipping fee (previously hardcoded as SHIPPING_FEE in
-- order.controller.js — this migration doesn't change that code yet,
-- just makes the value settings-driven so a later step can read from here).
USE shope_clothes;

CREATE TABLE settings (
    id                    TINYINT UNSIGNED NOT NULL PRIMARY KEY DEFAULT 1,
    store_name            VARCHAR(120)  NOT NULL DEFAULT 'Shope Clothes',
    contact_email         VARCHAR(190)  NOT NULL DEFAULT 'hello@shopeclothes.test',
    currency              CHAR(3)       NOT NULL DEFAULT 'USD',
    tax_rate              DECIMAL(6,4)  NOT NULL DEFAULT 0.0000,  -- e.g. 0.0800 = 8%
    flat_shipping_fee     DECIMAL(10,2) NOT NULL DEFAULT 5.00,
    low_stock_threshold   INT UNSIGNED  NOT NULL DEFAULT 5,
    timezone              VARCHAR(64)   NOT NULL DEFAULT 'Asia/Phnom_Penh',
    updated_at            TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP
                                        ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT chk_settings_singleton CHECK (id = 1)
) ENGINE=InnoDB;

INSERT INTO settings (id) VALUES (1);
