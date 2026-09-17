-- Adds what the admin Categories screen needs that the base schema never
-- had: a per-category image and an explicit reorder position. sort_order
-- defaults to id so existing rows get a stable, predictable initial order
-- (insertion order) without a separate backfill pass.
ALTER TABLE categories
  ADD COLUMN image_url  VARCHAR(500) NULL AFTER parent_id,
  ADD COLUMN sort_order INT NOT NULL DEFAULT 0 AFTER image_url;

UPDATE categories SET sort_order = id;
