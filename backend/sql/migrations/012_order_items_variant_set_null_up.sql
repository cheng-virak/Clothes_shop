-- 012_order_items_variant_set_null (UP)
-- Lets a product be hard-deleted even after it's been ordered. Every
-- order_items row already snapshots everything needed to display that
-- line item forever (product_title, sku, size_code, color_name,
-- unit_price, quantity, line_total) — variant_id is only a live
-- back-reference to product_variants, never joined against when
-- rendering an order (verified: admin/orders.controller.js's getOrder
-- and the storefront's getMyOrders both read the snapshot columns only).
-- So instead of RESTRICT (which blocked deleting a product with any
-- order history at all), a deleted variant now just sets variant_id to
-- NULL on the order_items rows that referenced it — the order keeps its
-- full displayed detail, it just loses the live link to a product row
-- that no longer exists. The only other place variant_id is read is the
-- cancel/stock-restore loop in admin/orders.controller.js, which already
-- handles a NULL there as "nothing to restore" (see that file's comment).
USE shope_clothes;

ALTER TABLE order_items
  DROP FOREIGN KEY order_items_ibfk_2;

ALTER TABLE order_items
  MODIFY COLUMN variant_id BIGINT UNSIGNED NULL;

ALTER TABLE order_items
  ADD CONSTRAINT order_items_ibfk_2
    FOREIGN KEY (variant_id) REFERENCES product_variants(id) ON DELETE SET NULL;
