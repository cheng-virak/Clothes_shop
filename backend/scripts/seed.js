/**
 * Baseline data for a fresh database: the category tree, the settings
 * document, and a starter admin account.
 *
 *   npm run seed --workspace=backend
 *
 * Upserts only — it never deletes or overwrites existing documents, so
 * it's safe to run against a database that already holds real data
 * (running it twice changes nothing the second time).
 *
 * Starter admin: admin@shopeclothes.test / Admin123!
 * Change that password immediately in any real environment.
 */
import bcrypt from 'bcryptjs';
import { env } from '../src/config/env.js';
import { connectMongo, disconnectMongo } from '../src/config/mongo.js';
import { Category, User, getSettings } from '../src/models/index.js';

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

async function upsertCategory({ name, slug, sortOrder }, parent = null) {
  const result = await Category.updateOne(
    { slug },
    { $setOnInsert: { name, slug, sortOrder, parent } },
    { upsert: true }
  );
  return result.upsertedCount === 1;
}

async function main() {
  await connectMongo();
  console.log(`Seeding ${env.mongo.dbName}\n`);

  for (const category of TOP_LEVEL) {
    const created = await upsertCategory(category);
    console.log(`category  ${category.name.padEnd(12)} ${created ? 'created' : 'exists'}`);
  }
  for (const child of CHILDREN) {
    const parent = await Category.findOne({ slug: child.parentSlug }).select('_id').lean();
    const created = await upsertCategory(child, parent?._id ?? null);
    console.log(`category  ${child.name.padEnd(12)} ${created ? 'created' : 'exists'}`);
  }

  await getSettings(); // creates the singleton with defaults if missing
  console.log('settings  singleton    ready');

  const existingAdmin = await User.exists({ email: ADMIN.email });
  if (existingAdmin) {
    console.log(`admin     ${ADMIN.email}  exists (password left unchanged)`);
  } else {
    await User.create({
      fullName: ADMIN.fullName,
      email: ADMIN.email,
      passwordHash: await bcrypt.hash(ADMIN.password, env.bcryptSaltRounds),
      role: 'admin',
    });
    console.log(`admin     ${ADMIN.email} / ${ADMIN.password}  created`);
  }

  await disconnectMongo();
}

main().catch((err) => {
  console.error('Seed failed:', err.message);
  process.exit(1);
});
