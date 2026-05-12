import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/session';
import { callService } from '@/lib/services';

const Schema = z.object({
  phone_number: z.string().optional(),
  email: z.string().email().optional(),
  role: z.enum(['admin', 'operator', 'viewer']),
});

export async function POST(req: Request) {
  const session = await getSession();
  if (!session.email || !session.current_tenant_id || !session.principal_id) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }
  const parsed = Schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'invalid_input' }, { status: 400 });

  const out = await callService('team', '/invites', {
    method: 'POST',
    body: JSON.stringify({
      tenant_id: session.current_tenant_id,
      invited_by: session.principal_id,
      ...parsed.data,
    }),
  });
  return NextResponse.json(out);
}
