/**
 * Baseline data for a fresh database: the category tree, the settings
 * row, and a starter admin account.
 *
 *   npm run migrate --workspace=backend   # tables first
 *   npm run seed    --workspace=backend
 *
 * Upserts only — it never deletes or overwrites existing rows, so it's
 * safe to run against a database that already holds real data (running it
 * twice changes nothing the second time).
 *
 * Starter admin: admin@shopeclothes.test / Admin123!
 * Change that password immediately in any real environment.
 */
import bcrypt from 'bcryptjs';
import { env } from '../src/config/env.js';
import { query, closePool } from '../src/config/db.js';
import { getSettings } from '../src/repositories/settings.repo.js';

const TOP_LEVEL = [
  { name: 'Men', slug: 'men', sortOrder: 1 },
  { name: 'Women', slug: 'women', sortOrder: 2 },
  { name: 'Accessories', slug: 'accessories', sortOrder: 3 },
];

const CHILDREN = [
  { name: 'T-Shirts', slug: 't-shirts', parentSlug: 'men', sortOrder: 1 },
  { name: 'Dresses', slug: 'dresses', parentSlug: 'women', sortOrder: 1 },
];

const ADMIN = { fullName: 'Store Admin', email: 'admin@shopeclothes.test', password: 'Admin123!' };

/** Returns true when this call created the row, false when it was there
 *  already — ON CONFLICT DO NOTHING returns no rows in the second case. */
async function upsertCategory({ name, slug, sortOrder }, parentId = null) {
  const { rows } = await query(
    `INSERT INTO categories (name, slug, parent_id, sort_order)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (slug) DO NOTHING
     RETURNING id`,
    [name, slug, parentId, sortOrder]
  );
  return rows.length === 1;
}

async function categoryIdBySlug(slug) {
  const { rows } = await query('SELECT id FROM categories WHERE slug = $1', [slug]);
  return rows[0]?.id ?? null;
}

async function main() {
  const { host } = new URL(env.database.url);
  console.log(`Seeding ${host}\n`);

  for (const category of TOP_LEVEL) {
    const created = await upsertCategory(category);
    console.log(`category  ${category.name.padEnd(12)} ${created ? 'created' : 'exists'}`);
  }
  for (const child of CHILDREN) {
    const parentId = await categoryIdBySlug(child.parentSlug);
    const created = await upsertCategory(child, parentId);
    console.log(`category  ${child.name.padEnd(12)} ${created ? 'created' : 'exists'}`);
  }

  await getSettings(); // creates the singleton with defaults if missing
  console.log('settings  singleton    ready');

  const { rows: existingAdmin } = await query('SELECT id FROM users WHERE email = $1', [
    ADMIN.email,
  ]);
  if (existingAdmin.length > 0) {
    console.log(`admin     ${ADMIN.email}  exists (password left unchanged)`);
  } else {
    await query(
      `INSERT INTO users (full_name, email, password_hash, role)
       VALUES ($1, $2, $3, 'admin')
       ON CONFLICT (email) DO NOTHING`,
      [ADMIN.fullName, ADMIN.email, await bcrypt.hash(ADMIN.password, env.bcryptSaltRounds)]
    );
    console.log(`admin     ${ADMIN.email} / ${ADMIN.password}  created`);
  }

  await closePool();
}

main().catch(async (err) => {
  console.error('Seed failed:', err.message);
  await closePool().catch(() => {});
  process.exit(1);
});
