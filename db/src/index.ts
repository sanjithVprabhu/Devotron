import { sql } from 'drizzle-orm';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema/index.js';

export type DbSchema = typeof schema;
export type Db = PostgresJsDatabase<DbSchema>;

let _client: ReturnType<typeof postgres> | null = null;
let _db: Db | null = null;

export interface DbClientOptions {
  /** Optional override; defaults to process.env.POSTGRES_URL */
  url?: string;
  /** Max connection pool size. */
  max?: number;
  /** When true, disables prepared statements (Neon serverless via pgbouncer). */
  serverless?: boolean;
}

export function getDbClient(opts: DbClientOptions = {}): Db {
  if (_db) return _db;
  const url = opts.url ?? process.env.POSTGRES_URL;
  if (!url) throw new Error('POSTGRES_URL is required');
  _client = postgres(url, {
    max: opts.max ?? 10,
    prepare: opts.serverless ? false : true,
  });
  _db = drizzle(_client, { schema, logger: process.env.LOG_LEVEL === 'debug' });
  return _db;
}

const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

/**
 * Run an operation with a tenant-scoped Postgres session. Sets `app.tenant_id`
 * on the connection so RLS policies activate. Always use this from any service
 * that touches tenant-scoped tables.
 *
 * `tenantId` is validated against a strict UUID regex before being interpolated
 * into the `SET LOCAL` statement, so the escape inside `sql.raw` is safe.
 */
export async function withTenant<T>(
  tenantId: string,
  fn: (db: Db) => Promise<T>,
): Promise<T> {
  if (!UUID_RE.test(tenantId)) {
    throw new Error('invalid tenant_id (not a UUID)');
  }
  const db = getDbClient();
  return db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.tenant_id = '${tenantId}'`));
    return fn(tx as unknown as Db);
  });
}

export { schema };
export * from './schema/index.js';
