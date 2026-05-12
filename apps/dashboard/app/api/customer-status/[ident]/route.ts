// Public read of a customer's cross-business status. No auth (caller proves
// possession of the identifier just by knowing it — same trust model as
// "anyone with this anon ID is considered that customer").
//
// Returns:
//   { exists: false }                                               — no principal yet
//   { exists: true, opt_in: false }                                 — principal exists, no continuity
//   { exists: true, opt_in: true, business_count: N, first_seen }   — opted into continuity

import { NextResponse } from 'next/server';
import { getSql } from '@/lib/db';
import { isEnabled } from '@/lib/features';

export async function GET(_req: Request, { params }: { params: Promise<{ ident: string }> }) {
  if (!isEnabled('phase_2_cross_business_identity')) {
    return NextResponse.json({ error: 'feature_disabled' }, { status: 404 });
  }
  const { ident: rawIdent } = await params;
  const ident = decodeURIComponent(rawIdent).slice(0, 64);
  if (!ident) return NextResponse.json({ error: 'invalid_identifier' }, { status: 400 });

  const channel = /^\+[1-9]\d{7,14}$/.test(ident) ? 'whatsapp' : 'internal';

  const sql = getSql();
  const rows = await sql<{ pid: string; opt_in: boolean; created_at: string }[]>`
    SELECT p.id::text AS pid, p.cross_business_continuity AS opt_in, p.created_at::text
      FROM core.principals p
      JOIN core.identifiers i ON i.principal_id = p.id
     WHERE i.channel = ${channel} AND i.identifier = ${ident}
     LIMIT 1
  `;
  if (rows.length === 0 || !rows[0]) {
    return NextResponse.json({ exists: false });
  }
  const { pid, opt_in, created_at } = rows[0];
  if (!opt_in) {
    return NextResponse.json({ exists: true, opt_in: false });
  }

  // Count distinct active tenants the principal has chatted with.
  const counts = await sql<{ n: number }[]>`
    SELECT COUNT(DISTINCT t.tenant_id)::int AS n
      FROM conversations.threads t
     WHERE t.principal_id = ${pid}::uuid
  `;

  return NextResponse.json({
    exists: true,
    opt_in: true,
    business_count: counts[0]?.n ?? 0,
    first_seen: created_at,
  });
}

// POST flips the customer's continuity opt-in.
export async function POST(req: Request, { params }: { params: Promise<{ ident: string }> }) {
  if (!isEnabled('phase_2_cross_business_identity')) {
    return NextResponse.json({ error: 'feature_disabled' }, { status: 404 });
  }
  const { ident: rawIdent } = await params;
  const ident = decodeURIComponent(rawIdent).slice(0, 64);

  let body: { opt_in?: boolean };
  try {
    body = (await req.json()) as { opt_in?: boolean };
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }
  const opt_in = body.opt_in === true;
  const channel = /^\+[1-9]\d{7,14}$/.test(ident) ? 'whatsapp' : 'internal';

  const sql = getSql();
  const result = await sql<{ pid: string }[]>`
    UPDATE core.principals
       SET cross_business_continuity = ${opt_in}
     WHERE id IN (
       SELECT principal_id FROM core.identifiers
        WHERE channel = ${channel} AND identifier = ${ident}
     )
     RETURNING id::text AS pid
  `;
  if (result.length === 0) {
    return NextResponse.json({ error: 'principal_not_found' }, { status: 404 });
  }
  return NextResponse.json({ ok: true, opt_in });
}
