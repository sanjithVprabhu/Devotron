// POST   /api/api-config/lock — lock the base_url (audit-visible)
// DELETE /api/api-config/lock — unlock (also audit-visible)

import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { withTenant } from '@/lib/db';

export async function POST() {
  const session = await getSession();
  if (!session.email || !session.current_tenant_id || !session.principal_id) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const tenantId = session.current_tenant_id;

  const result = await withTenant(tenantId, async (sql) => {
    const rows = await sql<{ base_url: string | null; auth_secret_enc: string | null }[]>`
      SELECT base_url, auth_secret_enc FROM business.api_config WHERE tenant_id = ${tenantId}::uuid LIMIT 1
    `;
    const cfg = rows[0];
    if (!cfg || !cfg.base_url) {
      return { ok: false, error: 'no_config' };
    }
    if (!cfg.auth_secret_enc) {
      return { ok: false, error: 'no_auth_secret' };
    }
    await sql`
      UPDATE business.api_config
         SET base_url_locked = TRUE,
             base_url_locked_at = NOW(),
             base_url_locked_by = ${session.principal_id}::uuid
       WHERE tenant_id = ${tenantId}::uuid
    `;
    return { ok: true };
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  const session = await getSession();
  if (!session.email || !session.current_tenant_id) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const tenantId = session.current_tenant_id;
  await withTenant(tenantId, async (sql) => {
    await sql`
      UPDATE business.api_config
         SET base_url_locked = FALSE,
             base_url_locked_at = NULL,
             base_url_locked_by = NULL
       WHERE tenant_id = ${tenantId}::uuid
    `;
  });
  return NextResponse.json({ ok: true });
}
