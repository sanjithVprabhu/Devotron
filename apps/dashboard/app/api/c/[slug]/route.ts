// Public storefront chat endpoint. No auth.
// Resolves business slug → tenant_id and proxies the message to the orchestrator.
// The customer's browser identifier (cookie or supplied) becomes their sender_identifier;
// the orchestrator auto-creates a principal so cross-turn memory works.

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSql } from '@/lib/db';
import { isEnabled } from '@/lib/features';

const ORCH_URL = process.env.ORCH_URL ?? 'http://127.0.0.1:8181';

const Body = z.object({
  text: z.string().min(1).max(4096),
  // Customer identifier — phone (preferred) or anon browser id (e.g. anon-<uuid>).
  // Same identifier across turns = same conversation thread.
  sender_identifier: z.string().min(3).max(64),
});

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  if (!isEnabled('phase_1_storefront')) {
    return NextResponse.json({ error: 'storefront_disabled' }, { status: 404 });
  }

  const { slug } = await params;
  if (!slug || slug.length < 2 || slug.length > 80) {
    return NextResponse.json({ error: 'invalid_slug' }, { status: 400 });
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }
  const parsed = Body.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_input', details: parsed.error.flatten() }, { status: 400 });
  }

  // Resolve slug → tenant_id. Public lookup (no RLS — tenants are addressable by slug for the public storefront).
  const sql = getSql();
  const rows = await sql<{ id: string; status: string; name: string }[]>`
    SELECT id::text, status, name
      FROM core.tenants
     WHERE slug = ${slug}
     LIMIT 1
  `;
  if (rows.length === 0 || !rows[0]) {
    return NextResponse.json({ error: 'business_not_found' }, { status: 404 });
  }
  if (rows[0].status !== 'active') {
    return NextResponse.json({ error: 'business_inactive' }, { status: 410 });
  }
  const tenant_id = rows[0].id;

  // Determine the channel for this identifier. If it looks like an E.164 phone, use whatsapp;
  // otherwise mark as 'internal' (anonymous web chat) so we don't pollute the whatsapp identifier space.
  const ident = parsed.data.sender_identifier;
  const channel = /^\+[1-9]\d{7,14}$/.test(ident) ? 'whatsapp' : 'internal';

  try {
    const res = await fetch(`${ORCH_URL}/test/agent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tenant_id,
        text: parsed.data.text,
        sender_identifier: ident,
        channel,
      }),
    });
    if (!res.ok) {
      const detail = await res.text();
      return NextResponse.json(
        { error: 'orchestrator_error', status: res.status, detail },
        { status: 502 },
      );
    }
    const data = await res.json();
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json(
      { error: 'orchestrator_unreachable', detail: String(e) },
      { status: 502 },
    );
  }
}
