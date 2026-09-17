-- 012_order_items_variant_set_null (DOWN)
-- Reverses the column/constraint change. NOTE: if any order_items rows
-- have variant_id = NULL by the time this runs (i.e. a product was
-- force-deleted after this migration went in), the MODIFY back to NOT
-- NULL will fail on those rows — that's intentional, not a bug in this
-- script. Decide what those orphaned rows should become (e.g. a
-- placeholder "deleted variant" row) before forcing this through.
USE shope_clothes;

ALTER TABLE order_items
  DROP FOREIGN KEY order_items_ibfk_2;

ALTER TABLE order_items
  MODIFY COLUMN variant_id BIGINT UNSIGNED NOT NULL;

ALTER TABLE order_items
  ADD CONSTRAINT order_items_ibfk_2
    FOREIGN KEY (variant_id) REFERENCES product_variants(id);
