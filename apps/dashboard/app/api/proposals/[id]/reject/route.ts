import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { withTenant } from '@/lib/db';

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session.email || !session.current_tenant_id || !session.principal_id) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const { id } = await params;
  const principalId = session.principal_id;
  await withTenant(session.current_tenant_id, async (sql) => {
    await sql`
      UPDATE daemon.proposals
      SET status='rejected', reviewed_by=${principalId}::uuid, reviewed_at=NOW()
      WHERE id=${id}::uuid AND status='pending'
    `;
  });
  return NextResponse.json({ ok: true });
}
