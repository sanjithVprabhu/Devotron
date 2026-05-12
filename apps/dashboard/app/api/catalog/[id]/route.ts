import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { callService } from '@/lib/services';

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session.email || !session.current_tenant_id) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const { id } = await params;
  await callService('catalog', `/items/${session.current_tenant_id}/${id}`, { method: 'DELETE' });
  return NextResponse.json({ ok: true });
}
