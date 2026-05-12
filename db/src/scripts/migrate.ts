// Apply all SQL files in db/migrations in lexical order to the configured Postgres.
// Tracks applied migrations in a `_meta.migrations` table.

import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__dirname, '..', '..', 'migrations');

async function main() {
  const url = process.env.POSTGRES_URL;
  if (!url) {
    console.error('POSTGRES_URL is required');
    process.exit(1);
  }

  const sql = postgres(url, { max: 1 });

  await sql`CREATE SCHEMA IF NOT EXISTS _meta`;
  await sql`
    CREATE TABLE IF NOT EXISTS _meta.migrations (
      filename TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      checksum TEXT
    )
  `;

  const files = (await readdir(MIGRATIONS_DIR))
    .filter((f) => f.endsWith('.sql'))
    .sort();

  const applied = await sql<{ filename: string }[]>`SELECT filename FROM _meta.migrations`;
  const appliedSet = new Set(applied.map((r) => r.filename));

  for (const file of files) {
    if (appliedSet.has(file)) {
      console.log(`skip ${file} (already applied)`);
      continue;
    }
    const body = await readFile(join(MIGRATIONS_DIR, file), 'utf-8');
    console.log(`apply ${file}`);
    try {
      await sql.unsafe(body);
      await sql`INSERT INTO _meta.migrations (filename) VALUES (${file})`;
    } catch (err) {
      console.error(`FAILED ${file}:`, err);
      await sql.end();
      process.exit(1);
    }
  }

  await sql.end();
  console.log('migrations complete');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
