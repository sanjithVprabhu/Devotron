import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/session';
import { callService } from '@/lib/services';

export async function GET(req: Request) {
  const session = await getSession();
  if (!session.email || !session.current_tenant_id) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const url = new URL(req.url);
  const status = url.searchParams.get('status') ?? 'active';
  const data = await callService(
    'catalog',
    `/items/${session.current_tenant_id}?status=${encodeURIComponent(status)}&limit=200`,
  );
  return NextResponse.json(data);
}

const CreateItem = z.object({
  vertical: z.string().default('auto_parts'),
  data: z.record(z.unknown()),
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
  const parsed = CreateItem.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'invalid_input' }, { status: 400 });

  const out = await callService('catalog', '/items/upsert', {
    method: 'POST',
    body: JSON.stringify({ tenant_id: session.current_tenant_id, ...parsed.data }),
  });
  return NextResponse.json(out);
}
