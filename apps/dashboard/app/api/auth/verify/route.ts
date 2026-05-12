import { NextResponse } from 'next/server';
import { z } from 'zod';
import { verify } from '@/lib/otp';
import { getSession } from '@/lib/session';
import { getSql } from '@/lib/db';

const Schema = z.object({ email: z.string().email(), code: z.string().min(4).max(8) });

interface MembershipRow {
  tenant_id: string;
  tenant_name: string;
  role: 'owner' | 'admin' | 'operator' | 'viewer';
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_input' }, { status: 400 });
  }
  if (!verify(parsed.data.email, parsed.data.code)) {
    return NextResponse.json({ error: 'invalid_or_expired_code' }, { status: 401 });
  }

  // Resolve email → principal directly via Postgres. Creates a principal +
  // identifier row if none exists, mirroring the edge identity resolver.
  const resolved = await resolveEmailPrincipal(parsed.data.email);

  // Look up the principal's tenant memberships. If they belong to exactly one
  // tenant, auto-select it; otherwise the tenant picker page handles it.
  const memberships = await fetchMemberships(resolved.principal_id);

  const session = await getSession();
  session.email = parsed.data.email;
  session.principal_id = resolved.principal_id;
  if (memberships.length === 1) {
    session.current_tenant_id = memberships[0].tenant_id;
    session.current_tenant_name = memberships[0].tenant_name;
    session.current_role = memberships[0].role;
  }
  await session.save();

  return NextResponse.json({
    ok: true,
    has_tenants: memberships.length > 0,
    tenant_count: memberships.length,
  });
}

async function fetchMemberships(principalId: string): Promise<MembershipRow[]> {
  const sql = getSql();
  return sql<MembershipRow[]>`
    SELECT m.tenant_id::text, t.name AS tenant_name, m.role
    FROM core.tenant_memberships m
    JOIN core.tenants t ON t.id = m.tenant_id
    WHERE m.principal_id = ${principalId}::uuid
    ORDER BY m.created_at ASC
  `;
}

async function resolveEmailPrincipal(email: string): Promise<{ principal_id: string; created: boolean }> {
  const norm = email.trim().toLowerCase();
  const sql = getSql();
  const existing = await sql<{ principal_id: string }[]>`
    SELECT principal_id::text FROM core.identifiers
    WHERE channel = 'email' AND identifier = ${norm}
    LIMIT 1
  `;
  if (existing.length > 0 && existing[0]) {
    return { principal_id: existing[0].principal_id, created: false };
  }
  const created = await sql.begin(async (tx) => {
    const [p] = await tx<{ id: string }[]>`
      INSERT INTO core.principals (display_name, metadata)
      VALUES (NULL, '{}'::jsonb) RETURNING id::text
    `;
    if (!p) throw new Error('failed to create principal');
    await tx`
      INSERT INTO core.identifiers (principal_id, channel, identifier, verified)
      VALUES (${p.id}::uuid, 'email', ${norm}, TRUE)
    `;
    return p.id;
  });
  return { principal_id: created, created: true };
}
