// Per-tenant agent registry settings — what other agents can find / call us.
// Phase 3 primitives only; the actual cross-agent wire format is not yet shipped.

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/session';
import { getSql } from '@/lib/db';
import { isEnabled } from '@/lib/features';

interface RegistryRow {
  is_listed_publicly: boolean;
  exposed_capabilities: string[];
  display_name: string | null;
  registry_url: string | null;
  signing_pubkey: string | null;
  pending_inbound: number;
}

export async function GET() {
  if (!isEnabled('phase_3_a2a')) {
    return NextResponse.json({ error: 'a2a_disabled' }, { status: 404 });
  }
  const session = await getSession();
  if (!session.email || !session.current_tenant_id) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const sql = getSql();
  const tid = session.current_tenant_id;

  const rows = await sql<{
    is_listed_publicly: boolean;
    exposed_capabilities: string[];
    display_name: string | null;
    registry_url: string | null;
    signing_pubkey: string | null;
  }[]>`
    SELECT is_listed_publicly, exposed_capabilities, display_name, registry_url, signing_pubkey
      FROM a2a.agent_registry
     WHERE tenant_id = ${tid}::uuid
     LIMIT 1
  `;
  const reg = rows[0] ?? {
    is_listed_publicly: false,
    exposed_capabilities: [],
    display_name: null,
    registry_url: null,
    signing_pubkey: null,
  };

  // Count any inbound a2a messages still awaiting our approval (we are the counterparty).
  const pending = await sql<{ n: number }[]>`
    SELECT COUNT(*)::int AS n
      FROM a2a.messages
     WHERE to_tenant_id = ${tid}::uuid
       AND requires_human_approval = TRUE
       AND approved_at IS NULL
  `;

  const result: RegistryRow = {
    ...reg,
    pending_inbound: pending[0]?.n ?? 0,
  };
  return NextResponse.json(result);
}

const PutBody = z.object({
  is_listed_publicly: z.boolean().optional(),
  exposed_capabilities: z.array(z.string().max(80)).max(20).optional(),
  display_name: z.string().max(120).nullable().optional(),
  registry_url: z.string().url().max(300).nullable().optional(),
});

export async function PUT(req: Request) {
  if (!isEnabled('phase_3_a2a')) {
    return NextResponse.json({ error: 'a2a_disabled' }, { status: 404 });
  }
  const session = await getSession();
  if (!session.email || !session.current_tenant_id) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let raw: unknown;
  try { raw = await req.json(); } catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }); }
  const parsed = PutBody.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: 'invalid_input', details: parsed.error.flatten() }, { status: 400 });

  const sql = getSql();
  const tid = session.current_tenant_id;
  const d = parsed.data;

  // Upsert: ensure a row exists, then patch only the fields supplied.
  await sql`
    INSERT INTO a2a.agent_registry (tenant_id) VALUES (${tid}::uuid)
    ON CONFLICT (tenant_id) DO NOTHING
  `;
  if (d.is_listed_publicly !== undefined) {
    await sql`UPDATE a2a.agent_registry SET is_listed_publicly = ${d.is_listed_publicly}, updated_at = NOW() WHERE tenant_id = ${tid}::uuid`;
  }
  if (d.exposed_capabilities !== undefined) {
    await sql`UPDATE a2a.agent_registry SET exposed_capabilities = ${d.exposed_capabilities}::text[], updated_at = NOW() WHERE tenant_id = ${tid}::uuid`;
  }
  if (d.display_name !== undefined) {
    await sql`UPDATE a2a.agent_registry SET display_name = ${d.display_name}, updated_at = NOW() WHERE tenant_id = ${tid}::uuid`;
  }
  if (d.registry_url !== undefined) {
    await sql`UPDATE a2a.agent_registry SET registry_url = ${d.registry_url}, updated_at = NOW() WHERE tenant_id = ${tid}::uuid`;
  }
  return NextResponse.json({ ok: true });
}
