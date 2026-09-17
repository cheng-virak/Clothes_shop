-- 006_product_images_dimensions (UP)
-- Nullable: existing rows (uploaded before this migration) simply have
-- unknown dimensions until re-uploaded; the upload endpoint is updated to
-- populate these going forward using the image library's read-back size,
-- not a client-supplied value.
USE shope_clothes;

ALTER TABLE product_images
  ADD COLUMN width SMALLINT UNSIGNED NULL,
  ADD COLUMN height SMALLINT UNSIGNED NULL;
