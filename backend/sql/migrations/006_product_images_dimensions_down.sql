-- 006_product_images_dimensions (DOWN)
USE shope_clothes;

ALTER TABLE product_images
  DROP COLUMN width,
  DROP COLUMN height;
