import IORedis from 'ioredis';
import { config } from './config.js';

let _client: IORedis | null = null;

export function getRedis(): IORedis {
  if (_client) return _client;
  _client = new IORedis(config.REDIS_URL, {
    lazyConnect: false,
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
  });
  return _client;
}

export async function isIdempotentlyNew(key: string, ttlSeconds = 86_400): Promise<boolean> {
  const r = getRedis();
  const set = await r.set(key, '1', 'EX', ttlSeconds, 'NX');
  return set === 'OK';
}

export function tenantKey(tenantId: string, ...parts: string[]): string {
  return ['tenant', tenantId, ...parts].join(':');
}

export function globalKey(...parts: string[]): string {
  return ['global', ...parts].join(':');
}
