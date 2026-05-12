import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/session';
import { getSql } from '@/lib/db';

interface MembershipRow {
  tenant_id: string;
  tenant_name: string;
  role: 'owner' | 'admin' | 'operator' | 'viewer';
}

export async function GET() {
  const session = await getSession();
  if (!session.email || !session.principal_id) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const sql = getSql();
  const rows = await sql<MembershipRow[]>`
    SELECT m.tenant_id::text, t.name AS tenant_name, m.role
    FROM core.tenant_memberships m
    JOIN core.tenants t ON t.id = m.tenant_id
    WHERE m.principal_id = ${session.principal_id}::uuid
    ORDER BY t.name ASC
  `;
  return NextResponse.json({
    current_tenant_id: session.current_tenant_id ?? null,
    memberships: rows,
  });
}

const SwitchSchema = z.object({ tenant_id: z.string().uuid() });

export async function POST(req: Request) {
  const session = await getSession();
  if (!session.email || !session.principal_id) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }
  const parsed = SwitchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'invalid_input' }, { status: 400 });

  // Verify membership exists before switching.
  const sql = getSql();
  const rows = await sql<MembershipRow[]>`
    SELECT m.tenant_id::text, t.name AS tenant_name, m.role
    FROM core.tenant_memberships m
    JOIN core.tenants t ON t.id = m.tenant_id
    WHERE m.principal_id = ${session.principal_id}::uuid
      AND m.tenant_id = ${parsed.data.tenant_id}::uuid
    LIMIT 1
  `;
  if (rows.length === 0) {
    return NextResponse.json({ error: 'not_a_member' }, { status: 403 });
  }
  const m = rows[0]!;
  session.current_tenant_id = m.tenant_id;
  session.current_tenant_name = m.tenant_name;
  session.current_role = m.role;
  await session.save();
  return NextResponse.json({ ok: true });
}
