-- Baseline schema for PostgreSQL (Neon).
--
-- Replaces the MongoDB collections. Two shape changes are worth calling
-- out, because they undo choices that only made sense in a document store:
--
--   * Product variants and images were EMBEDDED subdocuments. They are
--     real tables again (product_variants, product_images). Embedding
--     bought single-document atomic stock updates; in Postgres a plain
--     UPDATE ... WHERE stock_quantity >= $n gives the same guarantee
--     through row locking, so nothing is lost.
--   * Order line items and status history were embedded arrays. They are
--     order_items / order_status_history again, still SNAPSHOTS: product
--     title, sku, size, colour and price are copied in at checkout so an
--     order renders correctly after the product is edited or deleted.
--
-- Ids are uuid rather than bigserial. The API previously handed out
-- 24-char ObjectIds as opaque strings and both clients treat them as
-- opaque; uuid keeps that property (and keeps order/product ids
-- non-enumerable), where an auto-increment integer would not.

CREATE TABLE IF NOT EXISTS users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name     varchar(120) NOT NULL,
  -- Stored already-lowercased (the zod schema in shared/src/authSchemas.js
  -- applies .toLowerCase()), so a plain unique index is case-insensitive
  -- in practice without needing the citext extension.
  email         varchar(190) NOT NULL UNIQUE,
  password_hash text         NOT NULL,
  phone         varchar(20),
  role          text         NOT NULL DEFAULT 'customer'
                  CHECK (role IN ('customer', 'staff', 'admin')),
  is_active     boolean      NOT NULL DEFAULT true,
  created_at    timestamptz  NOT NULL DEFAULT now(),
  updated_at    timestamptz  NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS categories (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       varchar(100) NOT NULL UNIQUE,
  slug       varchar(120) NOT NULL UNIQUE,
  -- SET NULL, not CASCADE: deleting a parent promotes its children to
  -- top level rather than deleting them along with it.
  parent_id  uuid REFERENCES categories(id) ON DELETE SET NULL,
  image_url  text,
  sort_order integer     NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_categories_parent_sort ON categories (parent_id, sort_order);

CREATE TABLE IF NOT EXISTS products (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title       varchar(200) NOT NULL,
  -- Immutable after creation: changing it breaks any existing link.
  slug        varchar(220) NOT NULL UNIQUE,
  description varchar(5000),
  base_price  numeric(10, 2) NOT NULL CHECK (base_price >= 0),
  status      text NOT NULL DEFAULT 'draft'
                CHECK (status IN ('draft', 'active', 'archived')),
  -- RESTRICT reproduces the rule the category delete endpoint enforces:
  -- a category still used by a product cannot be removed.
  category_id uuid NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Storefront reads are always "active products, optionally in a category".
CREATE INDEX IF NOT EXISTS idx_products_status_category ON products (status, category_id);
CREATE INDEX IF NOT EXISTS idx_products_created_at ON products (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_products_updated_at ON products (updated_at DESC);

CREATE TABLE IF NOT EXISTS product_variants (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id     uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  size           varchar(20) NOT NULL,
  color          varchar(50) NOT NULL,
  color_hex      varchar(7),
  -- Unique across every product, not just within one: the CSV inventory
  -- import looks a variant up by SKU alone.
  sku            varchar(60) NOT NULL UNIQUE,
  -- NULL means "inherit the base_price of the owning product".
  price_override numeric(10, 2) CHECK (price_override IS NULL OR price_override >= 0),
  stock_quantity integer NOT NULL DEFAULT 0 CHECK (stock_quantity >= 0)
);

CREATE INDEX IF NOT EXISTS idx_variants_product ON product_variants (product_id);
CREATE INDEX IF NOT EXISTS idx_variants_stock ON product_variants (stock_quantity);

CREATE TABLE IF NOT EXISTS product_images (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  image_url  text NOT NULL,
  is_primary boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  width      integer,
  height     integer
);

CREATE INDEX IF NOT EXISTS idx_images_product ON product_images (product_id, sort_order);
-- At most one primary image per product, enforced by the database rather
-- than only by the endpoint that sets it.
CREATE UNIQUE INDEX IF NOT EXISTS uq_images_one_primary
  ON product_images (product_id) WHERE is_primary;

CREATE TABLE IF NOT EXISTS carts (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cart_items (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cart_id    uuid NOT NULL REFERENCES carts(id) ON DELETE CASCADE,
  variant_id uuid NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
  quantity   integer NOT NULL CHECK (quantity > 0),
  added_at   timestamptz NOT NULL DEFAULT now(),
  -- One row per cart+variant: adding a variant already in the cart
  -- increments the existing line instead of creating a second one.
  CONSTRAINT uq_cart_variant UNIQUE (cart_id, variant_id)
);

CREATE INDEX IF NOT EXISTS idx_cart_items_cart ON cart_items (cart_id);

CREATE TABLE IF NOT EXISTS orders (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number     varchar(40) NOT NULL UNIQUE,
  user_id          uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,

  -- State/postal/country are no longer collected at checkout; they stay
  -- nullable so older orders keep the values they were placed with.
  shipping_name    varchar(120) NOT NULL,
  shipping_phone   varchar(20)  NOT NULL,
  shipping_line1   varchar(255) NOT NULL,
  shipping_line2   varchar(255),
  shipping_city    varchar(100) NOT NULL,
  shipping_state   varchar(100),
  shipping_postal  varchar(20),
  shipping_country varchar(100),

  subtotal         numeric(10, 2) NOT NULL CHECK (subtotal >= 0),
  shipping_fee     numeric(10, 2) NOT NULL DEFAULT 0 CHECK (shipping_fee >= 0),
  discount_total   numeric(10, 2) NOT NULL DEFAULT 0 CHECK (discount_total >= 0),
  tax_total        numeric(10, 2) NOT NULL DEFAULT 0 CHECK (tax_total >= 0),
  grand_total      numeric(10, 2) NOT NULL CHECK (grand_total >= 0),

  payment_method   text NOT NULL DEFAULT 'cod'
                     CHECK (payment_method IN ('cod', 'stripe', 'paypal')),
  payment_status   text NOT NULL DEFAULT 'pending'
                     CHECK (payment_status IN ('pending', 'paid', 'failed', 'refunded')),
  order_status     text NOT NULL DEFAULT 'pending'
                     CHECK (order_status IN ('pending', 'confirmed', 'processing',
                                             'shipped', 'delivered', 'cancelled')),

  tracking_number  varchar(100),
  tracking_carrier varchar(100),
  internal_notes   text,
  coupon_code      varchar(50),

  placed_at        timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_orders_user_placed ON orders (user_id, placed_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_status_placed ON orders (order_status, placed_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_placed ON orders (placed_at DESC);

CREATE TABLE IF NOT EXISTS order_items (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id      uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  -- SET NULL, not RESTRICT: deleting a product must neither be blocked by
  -- sales history nor destroy it. Every renderer reads the snapshot
  -- columns below, so a detached line still displays in full.
  product_id    uuid REFERENCES products(id) ON DELETE SET NULL,
  variant_id    uuid REFERENCES product_variants(id) ON DELETE SET NULL,

  product_title varchar(200) NOT NULL,
  sku           varchar(60)  NOT NULL,
  size_code     varchar(20)  NOT NULL,
  color_name    varchar(50)  NOT NULL,
  unit_price    numeric(10, 2) NOT NULL CHECK (unit_price >= 0),
  quantity      integer NOT NULL CHECK (quantity > 0),
  line_total    numeric(10, 2) NOT NULL CHECK (line_total >= 0)
);

CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items (order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_product ON order_items (product_id);

CREATE TABLE IF NOT EXISTS order_status_history (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id   uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  status     text NOT NULL
               CHECK (status IN ('pending', 'confirmed', 'processing',
                                 'shipped', 'delivered', 'cancelled')),
  note       text,
  -- NULL for the row written at checkout by the customer themselves.
  changed_by uuid REFERENCES users(id) ON DELETE SET NULL,
  changed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_status_history_order ON order_status_history (order_id, changed_at);

CREATE TABLE IF NOT EXISTS audit_logs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid REFERENCES users(id) ON DELETE SET NULL,
  action      varchar(100) NOT NULL,
  entity_type varchar(50)  NOT NULL,
  entity_id   text,
  -- Callers pass only the fields they intend to log, never a whole row --
  -- that is what keeps password hashes out of the trail by construction.
  before      jsonb,
  after       jsonb,
  ip          varchar(64),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_logs (entity_type, entity_id);

-- Single-row table; the CHECK is what makes "singleton" a database rule
-- rather than a convention the code has to remember.
CREATE TABLE IF NOT EXISTS settings (
  id                      integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  store_name              varchar(120)   NOT NULL DEFAULT 'Shope Clothes',
  contact_email           varchar(190)   NOT NULL DEFAULT 'hello@shopeclothes.test',
  currency                varchar(3)     NOT NULL DEFAULT 'USD',
  timezone                varchar(64)    NOT NULL DEFAULT 'Asia/Phnom_Penh',
  tax_rate                numeric(6, 4)  NOT NULL DEFAULT 0 CHECK (tax_rate >= 0),
  flat_shipping_fee       numeric(10, 2) NOT NULL DEFAULT 5 CHECK (flat_shipping_fee >= 0),
  free_shipping_threshold numeric(10, 2),
  low_stock_threshold     integer        NOT NULL DEFAULT 5 CHECK (low_stock_threshold >= 0),
  created_at              timestamptz    NOT NULL DEFAULT now(),
  updated_at              timestamptz    NOT NULL DEFAULT now()
);

-- Mongoose kept `updatedAt` current by itself. A trigger restores that
-- for free rather than leaving every UPDATE statement to remember a
-- `updated_at = now()` clause it can silently omit.
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['users', 'categories', 'products', 'carts', 'orders', 'settings']
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%1$s_updated_at ON %1$s', t);
    EXECUTE format(
      'CREATE TRIGGER trg_%1$s_updated_at BEFORE UPDATE ON %1$s
         FOR EACH ROW EXECUTE FUNCTION set_updated_at()', t);
  END LOOP;
END;
$$;
