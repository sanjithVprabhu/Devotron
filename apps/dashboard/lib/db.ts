// Direct Postgres reads — used for list views where calling FastAPI for every
// page load would be wasteful. Always tenant-scoped.

import postgres, { type Sql } from 'postgres';

let _sql: Sql | null = null;

export function getSql(): Sql {
  if (_sql) return _sql;
  const url = process.env.POSTGRES_URL;
  if (!url) throw new Error('POSTGRES_URL is required');
  _sql = postgres(url, { max: 5, prepare: false });
  return _sql;
}

/**
 * Wraps a callback in a transaction with `app.tenant_id` set so RLS policies
 * activate. Pass tenant-scoped reads through this.
 */
export async function withTenant<T>(tenantId: string, fn: (sql: Sql) => Promise<T>): Promise<T> {
  if (!/^[0-9a-fA-F-]{36}$/.test(tenantId)) {
    throw new Error('invalid tenant_id');
  }
  const sql = getSql();
  // postgres-js sql.begin returns UnwrapPromiseArray<T>; cast back to T.
  const out = await sql.begin(async (tx) => {
    await tx.unsafe(`SET LOCAL app.tenant_id = '${tenantId}'`);
    return fn(tx as unknown as Sql);
  });
  return out as T;
}
