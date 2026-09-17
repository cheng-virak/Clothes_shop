-- Shope Clothes — MySQL schema
-- Run this against an empty database (see .env DB_NAME) before starting the server.

CREATE DATABASE IF NOT EXISTS shope_clothes CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE shope_clothes;

-- ========== USERS ==========
CREATE TABLE users (
    id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    full_name     VARCHAR(120)    NOT NULL,
    email         VARCHAR(190)    NOT NULL UNIQUE,
    password_hash VARCHAR(255)    NOT NULL,
    phone         VARCHAR(20),
    role          ENUM('customer','admin') NOT NULL DEFAULT 'customer',
    is_active     BOOLEAN         NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at    TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP
                                  ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- ========== ADDRESSES ==========
CREATE TABLE addresses (
    id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id       BIGINT UNSIGNED NOT NULL,
    label         VARCHAR(50)     DEFAULT 'Home',
    recipient_name VARCHAR(120)   NOT NULL,
    phone         VARCHAR(20)     NOT NULL,
    line1         VARCHAR(255)    NOT NULL,
    line2         VARCHAR(255),
    city          VARCHAR(100)    NOT NULL,
    state         VARCHAR(100),
    postal_code   VARCHAR(20)     NOT NULL,
    country       VARCHAR(100)    NOT NULL,
    is_default    BOOLEAN         NOT NULL DEFAULT FALSE,
    created_at    TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ========== CATEGORIES ==========
CREATE TABLE categories (
    id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name        VARCHAR(100)  NOT NULL UNIQUE,
    slug        VARCHAR(120)  NOT NULL UNIQUE,
    parent_id   INT UNSIGNED  NULL,
    FOREIGN KEY (parent_id) REFERENCES categories(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- ========== PRODUCTS ==========
CREATE TABLE products (
    id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    category_id   INT UNSIGNED    NOT NULL,
    title         VARCHAR(200)    NOT NULL,
    slug          VARCHAR(220)    NOT NULL UNIQUE,
    description   TEXT,
    base_price    DECIMAL(10,2)   NOT NULL,
    is_active     BOOLEAN         NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at    TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP
                                  ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (category_id) REFERENCES categories(id),
    INDEX idx_products_category (category_id),
    FULLTEXT INDEX ft_products_title_desc (title, description)
) ENGINE=InnoDB;

-- ========== PRODUCT IMAGES ==========
CREATE TABLE product_images (
    id          BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    product_id  BIGINT UNSIGNED NOT NULL,
    image_url   VARCHAR(500)    NOT NULL,
    is_primary  BOOLEAN         NOT NULL DEFAULT FALSE,
    sort_order  SMALLINT        NOT NULL DEFAULT 0,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ========== SIZES & COLORS ==========
CREATE TABLE sizes (
    id    TINYINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    code  VARCHAR(10) NOT NULL UNIQUE
);

CREATE TABLE colors (
    id        SMALLINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name      VARCHAR(50) NOT NULL UNIQUE,
    hex_code  CHAR(7)
);

-- ========== PRODUCT VARIANTS ==========
CREATE TABLE product_variants (
    id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    product_id      BIGINT UNSIGNED NOT NULL,
    size_id         TINYINT UNSIGNED NOT NULL,
    color_id        SMALLINT UNSIGNED NOT NULL,
    sku             VARCHAR(60)     NOT NULL UNIQUE,
    price_override  DECIMAL(10,2)   NULL,
    stock_quantity  INT UNSIGNED    NOT NULL DEFAULT 0,
    created_at      TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
    FOREIGN KEY (size_id)    REFERENCES sizes(id),
    FOREIGN KEY (color_id)   REFERENCES colors(id),
    UNIQUE KEY uq_variant (product_id, size_id, color_id),
    INDEX idx_variant_product (product_id)
) ENGINE=InnoDB;

-- ========== CART ITEMS ==========
CREATE TABLE cart_items (
    id          BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id     BIGINT UNSIGNED NOT NULL,
    variant_id  BIGINT UNSIGNED NOT NULL,
    quantity    INT UNSIGNED    NOT NULL DEFAULT 1,
    created_at  TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP
                                ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id)    REFERENCES users(id)            ON DELETE CASCADE,
    FOREIGN KEY (variant_id) REFERENCES product_variants(id) ON DELETE CASCADE,
    UNIQUE KEY uq_cart_user_variant (user_id, variant_id)
) ENGINE=InnoDB;

-- ========== ORDERS ==========
CREATE TABLE orders (
    id                BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    order_number      VARCHAR(30)     NOT NULL UNIQUE,
    user_id           BIGINT UNSIGNED NOT NULL,

    shipping_name     VARCHAR(120)    NOT NULL,
    shipping_phone    VARCHAR(20)     NOT NULL,
    shipping_line1    VARCHAR(255)    NOT NULL,
    shipping_line2    VARCHAR(255),
    shipping_city     VARCHAR(100)    NOT NULL,
    shipping_state    VARCHAR(100),
    shipping_postal   VARCHAR(20)     NOT NULL,
    shipping_country  VARCHAR(100)    NOT NULL,

    subtotal          DECIMAL(10,2)   NOT NULL,
    shipping_fee      DECIMAL(10,2)   NOT NULL DEFAULT 0,
    discount_total    DECIMAL(10,2)   NOT NULL DEFAULT 0,
    tax_total         DECIMAL(10,2)   NOT NULL DEFAULT 0,
    grand_total       DECIMAL(10,2)   NOT NULL,

    payment_method    ENUM('cod','stripe','paypal') NOT NULL DEFAULT 'cod',
    payment_status    ENUM('pending','paid','failed','refunded') NOT NULL DEFAULT 'pending',
    payment_ref       VARCHAR(120),

    order_status      ENUM('pending','confirmed','processing','shipped','delivered','cancelled')
                                      NOT NULL DEFAULT 'pending',
    tracking_number   VARCHAR(100),
    tracking_carrier  VARCHAR(100),

    placed_at         TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at        TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP
                                      ON UPDATE CURRENT_TIMESTAMP,

    FOREIGN KEY (user_id) REFERENCES users(id),
    INDEX idx_orders_user (user_id),
    INDEX idx_orders_status (order_status)
) ENGINE=InnoDB;

-- ========== ORDER ITEMS ==========
CREATE TABLE order_items (
    id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    order_id        BIGINT UNSIGNED NOT NULL,
    variant_id      BIGINT UNSIGNED NOT NULL,

    product_title   VARCHAR(200)    NOT NULL,
    sku             VARCHAR(60)     NOT NULL,
    size_code       VARCHAR(10)     NOT NULL,
    color_name      VARCHAR(50)     NOT NULL,
    unit_price      DECIMAL(10,2)   NOT NULL,
    quantity        INT UNSIGNED    NOT NULL,
    line_total      DECIMAL(10,2)   NOT NULL,

    FOREIGN KEY (order_id)   REFERENCES orders(id)           ON DELETE CASCADE,
    FOREIGN KEY (variant_id) REFERENCES product_variants(id),
    INDEX idx_order_items_order (order_id)
) ENGINE=InnoDB;

-- ========== ORDER STATUS HISTORY ==========
CREATE TABLE order_status_history (
    id          BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    order_id    BIGINT UNSIGNED NOT NULL,
    status      VARCHAR(30)     NOT NULL,
    note        VARCHAR(255),
    changed_at  TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
) ENGINE=InnoDB;
