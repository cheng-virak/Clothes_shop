-- Baseline lookup data. Run after schema.sql.
USE shope_clothes;

-- Apparel sizes, plus 'ONE_SIZE' (totes/beanies/sunglasses/etc. — no size
-- selector shown on the storefront for these) and belt waist sizes in
-- inches. All in one flat lookup table since `sizes.code` has no ENUM
-- constraint — a product only ever uses the subset that fits its type.
INSERT INTO sizes (code) VALUES
  ('S'), ('M'), ('L'), ('XL'), ('XXL'),
  ('ONE_SIZE'),
  ('30'), ('32'), ('34'), ('36');

INSERT INTO categories (name, slug) VALUES
  ('Men', 'men'),
  ('Women', 'women'),
  ('Accessories', 'accessories');

-- MySQL won't allow selecting from `categories` inside a subquery of an
-- INSERT into `categories` in the same statement (error 1093) — resolve
-- the parent ids into session variables first instead.
SET @men_id = (SELECT id FROM categories WHERE slug = 'men' LIMIT 1);
SET @women_id = (SELECT id FROM categories WHERE slug = 'women' LIMIT 1);

INSERT INTO categories (name, slug, parent_id) VALUES
  ('T-Shirts', 't-shirts', @men_id),
  ('Dresses', 'dresses', @women_id);

-- Optional: a starter admin account. Login: admin@shopeclothes.test / Admin123!
-- The hash below was generated with bcryptjs.hashSync('Admin123!', 10) — change this
-- password immediately after seeding a real environment.
-- Regenerate your own anytime with:
--   node -e "console.log(require('bcryptjs').hashSync('YourPassword', 10))"
INSERT INTO users (full_name, email, password_hash, role) VALUES
  ('Store Admin', 'admin@shopeclothes.test', '$2b$10$RQsHavD0UlCvq1FhkqxxS.UJWcayLelvn/AhPzKP4OtXUdLiLAPAC', 'admin');

-- Actually prints in the terminal when this file is run via the mysql
-- CLI (a SQL comment, above, does not) — so the credentials are visible
-- right in the seed output, not just discoverable by reading this file.
SELECT 'Seed complete.' AS status,
       'admin@shopeclothes.test' AS admin_email,
       'Admin123!' AS admin_password,
       'Log in at the admin app (http://localhost:5174) with these credentials.' AS note;
