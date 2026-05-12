// Tenant-level API connection: base URL + auth + acting-user header.
// GET — current config (secret not returned, only "has_secret" flag)
// PUT — upsert (works while not locked, or modifies non-locked fields after)
// POST /lock — lock the base_url + auth so it can't be changed silently
// DELETE /unlock — explicit unlock (audit-visible action)

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/session';
import { withTenant } from '@/lib/db';
import { encryptSecret } from '@/lib/secrets';

interface ConfigRow {
  base_url: string | null;
  base_url_locked: boolean;
  auth_type: string;
  has_auth_secret: boolean;
  auth_header_name: string | null;
  pass_acting_user_default: boolean;
  acting_user_header: string;
  health_check_path: string | null;
  last_healthcheck_at: string | null;
  last_healthcheck_ok: boolean | null;
  notes: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export async function GET() {
  const session = await getSession();
  if (!session.email || !session.current_tenant_id) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const tenantId = session.current_tenant_id;
  const row = await withTenant(tenantId, async (sql) => {
    const rows = await sql<ConfigRow[]>`
      SELECT base_url, base_url_locked, auth_type,
             (auth_secret_enc IS NOT NULL) AS has_auth_secret,
             auth_header_name, pass_acting_user_default, acting_user_header,
             health_check_path, last_healthcheck_at::text, last_healthcheck_ok,
             notes, created_at::text, updated_at::text
        FROM business.api_config
       WHERE tenant_id = ${tenantId}::uuid
       LIMIT 1
    `;
    return rows[0] ?? null;
  });
  return NextResponse.json({ config: row });
}

const PutBody = z.object({
  base_url: z.string().url().max(300).optional(),
  auth_type: z.enum(['none', 'bearer', 'api_key_header', 'basic']).optional(),
  auth_secret: z.string().min(4).max(2000).optional(),       // bearer token / api key
  auth_header_name: z.string().max(80).nullable().optional(),
  pass_acting_user_default: z.boolean().optional(),
  acting_user_header: z.string().max(80).optional(),
  health_check_path: z.string().max(200).nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
});

export async function PUT(req: Request) {
  const session = await getSession();
  if (!session.email || !session.current_tenant_id) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  let raw: unknown;
  try { raw = await req.json(); } catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }); }
  const parsed = PutBody.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: 'invalid_input', details: parsed.error.flatten() }, { status: 400 });
  const d = parsed.data;
  const tenantId = session.current_tenant_id;

  // If locked, only non-security fields can be updated; base_url + auth need explicit unlock first.
  const existing = await withTenant(tenantId, async (sql) => {
    const rows = await sql<{ base_url_locked: boolean }[]>`SELECT base_url_locked FROM business.api_config WHERE tenant_id = ${tenantId}::uuid LIMIT 1`;
    return rows[0] ?? null;
  });
  const locked = existing?.base_url_locked ?? false;

  if (locked) {
    if (d.base_url || d.auth_secret || d.auth_type || d.auth_header_name) {
      return NextResponse.json(
        { error: 'config_locked', detail: 'base_url + auth are locked. Unlock first (DELETE /api/api-config/lock) to change.' },
        { status: 409 },
      );
    }
  }

  const authSecretEnc = d.auth_secret ? encryptSecret(d.auth_secret) : null;

  await withTenant(tenantId, async (sql) => {
    if (existing) {
      // Update — only set provided fields
      if (d.base_url !== undefined) await sql`UPDATE business.api_config SET base_url = ${d.base_url} WHERE tenant_id = ${tenantId}::uuid`;
      if (d.auth_type !== undefined) await sql`UPDATE business.api_config SET auth_type = ${d.auth_type} WHERE tenant_id = ${tenantId}::uuid`;
      if (authSecretEnc !== null) await sql`UPDATE business.api_config SET auth_secret_enc = ${authSecretEnc} WHERE tenant_id = ${tenantId}::uuid`;
      if (d.auth_header_name !== undefined) await sql`UPDATE business.api_config SET auth_header_name = ${d.auth_header_name} WHERE tenant_id = ${tenantId}::uuid`;
      if (d.pass_acting_user_default !== undefined) await sql`UPDATE business.api_config SET pass_acting_user_default = ${d.pass_acting_user_default} WHERE tenant_id = ${tenantId}::uuid`;
      if (d.acting_user_header !== undefined) await sql`UPDATE business.api_config SET acting_user_header = ${d.acting_user_header} WHERE tenant_id = ${tenantId}::uuid`;
      if (d.health_check_path !== undefined) await sql`UPDATE business.api_config SET health_check_path = ${d.health_check_path} WHERE tenant_id = ${tenantId}::uuid`;
      if (d.notes !== undefined) await sql`UPDATE business.api_config SET notes = ${d.notes} WHERE tenant_id = ${tenantId}::uuid`;
    } else {
      if (!d.base_url) {
        throw new Error('base_url required to create config');
      }
      await sql`
        INSERT INTO business.api_config
          (tenant_id, base_url, auth_type, auth_secret_enc, auth_header_name,
           pass_acting_user_default, acting_user_header, health_check_path, notes)
        VALUES (
          ${tenantId}::uuid,
          ${d.base_url},
          ${d.auth_type ?? 'bearer'},
          ${authSecretEnc},
          ${d.auth_header_name ?? null},
          ${d.pass_acting_user_default ?? true},
          ${d.acting_user_header ?? 'X-Acting-User-Id'},
          ${d.health_check_path ?? null},
          ${d.notes ?? null}
        )
      `;
    }
  });

  // Note: orchestrator caches api_config for 5 min. Changes propagate within
  // that window. To force immediate propagation, hit POST /admin/cache/invalidate
  // on the orchestrator (TODO: build that endpoint when needed).
  return NextResponse.json({ ok: true });
}
