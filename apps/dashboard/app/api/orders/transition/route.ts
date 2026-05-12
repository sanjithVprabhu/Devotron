import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/session';
import { callService } from '@/lib/services';

const Schema = z.object({
  order_id: z.string().uuid(),
  to_status: z.enum(['confirmed', 'paid', 'fulfilled', 'closed', 'cancelled', 'refunded']),
  payment_method: z.string().optional(),
  payment_ref: z.string().optional(),
});

export async function POST(req: Request) {
  const session = await getSession();
  if (!session.email || !session.current_tenant_id) {
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

  const out = await callService('order', '/orders/transition', {
    method: 'POST',
    body: JSON.stringify({ tenant_id: session.current_tenant_id, ...parsed.data }),
  });
  return NextResponse.json(out);
}
