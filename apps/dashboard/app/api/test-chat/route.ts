import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/session';
import { getSql } from '@/lib/db';

const ORCH_URL = process.env.ORCH_URL ?? 'http://127.0.0.1:8181';

const Body = z.object({
  text: z.string().min(1).max(4096),
  sender_identifier: z.string().min(3).max(64),
  agent: z.enum(['business', 'veda']).default('business'),
  // When 'admin', we send the message AS the signed-in user's principal
  // (which is a tenant member, so the orchestrator detects admin role).
  // When 'customer', we use the supplied sender_identifier (a customer phone /
  // anonymous browser id).
  mode: z.enum(['customer', 'admin']).default('customer'),
});

export async function POST(req: Request) {
  const session = await getSession();
  if (!session.email || !session.current_tenant_id) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
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

  // In admin mode, send the message AS the signed-in principal so the
  // orchestrator detects them as a member of the tenant and unlocks admin
  // capabilities (catalog.add/update/delete, broadcast.*, etc.).
  let principal_id_override: string | undefined;
  let sender_identifier = parsed.data.sender_identifier;
  if (parsed.data.mode === 'admin' && parsed.data.agent === 'business' && session.principal_id) {
    principal_id_override = session.principal_id;
    // Use the owner's email as the sender_identifier so the conversation thread
    // is consistent for the owner's admin chats.
    sender_identifier = session.email!;
  }

  try {
    const res = await fetch(`${ORCH_URL}/test/agent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tenant_id: parsed.data.agent === 'veda' ? null : session.current_tenant_id,
        text: parsed.data.text,
        sender_identifier,
        principal_id: principal_id_override,
        channel: principal_id_override ? 'internal' : 'whatsapp',
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
