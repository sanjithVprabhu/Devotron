// Identity resolution: maps a channel-specific identifier (phone, twitter handle)
// to a Principal ID. Cache hit hot path; cache miss queries Postgres and creates a
// new Principal as EndUser if none exists.
//
// In production this can also call identity-service over HTTP — for v1 we read/write
// Postgres directly to avoid a hop. Service boundary is clean (uses normalize_identifier).

import type { Channel } from '@veda/shared-types/identity';
import { normalizeIdentifier } from '@veda/shared-types/identity';
import { getRedis, globalKey } from '../redis.js';
import { getSql } from '../pg.js';
import { logger } from '../logger.js';

export interface ResolveResult {
  principal_id: string;
  created: boolean;
}

export async function resolvePrincipal(channel: Channel, raw: string): Promise<ResolveResult> {
  const id = normalizeIdentifier(channel, raw);
  const r = getRedis();
  const cacheKey = globalKey('principal', channel, id);
  const cached = await r.get(cacheKey);
  if (cached) return { principal_id: cached, created: false };

  const sql = getSql();
  const existing = await sql<
    { principal_id: string }[]
  >`SELECT principal_id FROM core.identifiers WHERE channel = ${channel} AND identifier = ${id} LIMIT 1`;
  if (existing.length > 0 && existing[0]) {
    await r.set(cacheKey, existing[0].principal_id, 'EX', 3600);
    return { principal_id: existing[0].principal_id, created: false };
  }

  // Create principal + identifier in a single tx.
  const created = await sql.begin(async (tx) => {
    const [p] = await tx<{ id: string }[]>`
      INSERT INTO core.principals (display_name, metadata)
      VALUES (NULL, '{}'::jsonb) RETURNING id
    `;
    if (!p) throw new Error('failed to create principal');
    await tx`
      INSERT INTO core.identifiers (principal_id, channel, identifier, verified)
      VALUES (${p.id}::uuid, ${channel}, ${id}, ${channel === 'whatsapp' || channel === 'twitter'})
    `;
    return p.id;
  });

  await r.set(cacheKey, created, 'EX', 3600);
  logger.info({ channel, principal_id: created }, 'principal.created');
  return { principal_id: created, created: true };
}

export async function resolveTenantByPhoneNumberId(phoneNumberId: string): Promise<{
  tenant_id: string;
  display_name: string;
} | null> {
  const sql = getSql();
  const rows = await sql<
    { tenant_id: string; display_name: string }[]
  >`SELECT tenant_id, display_name FROM business.whatsapp_numbers WHERE phone_number_id = ${phoneNumberId} LIMIT 1`;
  if (rows.length === 0 || !rows[0]) return null;
  return rows[0];
}
