import postgres, { type Sql } from 'postgres';
import { config } from './config.js';

let _sql: Sql | null = null;

export function getSql(): Sql {
  if (_sql) return _sql;
  _sql = postgres(config.POSTGRES_URL, { max: 5, prepare: false });
  return _sql;
}

export async function close(): Promise<void> {
  if (_sql) await _sql.end({ timeout: 5 });
  _sql = null;
}
