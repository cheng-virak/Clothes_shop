/**
 * Applies every .sql file in backend/migrations that hasn't run yet, in
 * filename order, and records it in `schema_migrations`.
 *
 *   npm run migrate --workspace=backend
 *
 * Safe to run repeatedly: an already-applied file is skipped, and each
 * file runs inside its own transaction, so a failure part-way through
 * leaves the database on the last good migration rather than half-built.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool, closePool } from '../src/config/db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.join(__dirname, '..', 'migrations');

async function main() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename   text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    const { rows } = await client.query('SELECT filename FROM schema_migrations');
    const applied = new Set(rows.map((r) => r.filename));

    const files = (await fs.readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith('.sql')).sort();

    if (files.length === 0) {
      console.log('No migration files found.');
      return;
    }

    for (const filename of files) {
      if (applied.has(filename)) {
        console.log(`${filename.padEnd(24)} already applied`);
        continue;
      }

      const sql = await fs.readFile(path.join(MIGRATIONS_DIR, filename), 'utf8');

      await client.query('BEGIN');
      try {
        // Sent as one statement string on purpose: the simple query
        // protocol runs the whole file, which keeps $$-quoted function
        // bodies intact (splitting on ';' would cut them in half).
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [filename]);
        await client.query('COMMIT');
        console.log(`${filename.padEnd(24)} applied`);
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        throw new Error(`${filename} failed: ${err.message}`);
      }
    }
  } finally {
    client.release();
    await closePool();
  }
}

main().catch((err) => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});
