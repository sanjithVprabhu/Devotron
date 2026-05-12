import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { withTenant } from '@/lib/db';

interface ProposalRow {
  id: string;
  proposal_type: string;
  title: string;
  description: string;
  action: unknown;
  estimated_impact: string | null;
  status: string;
  created_at: string;
  expires_at: string;
}

export async function GET(req: Request) {
  const session = await getSession();
  if (!session.email || !session.current_tenant_id) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const url = new URL(req.url);
  const status = url.searchParams.get('status') ?? 'pending';

  const rows = await withTenant(session.current_tenant_id, async (sql) => {
    return sql<ProposalRow[]>`
      SELECT id::text, proposal_type, title, description, action,
             estimated_impact, status, created_at, expires_at
      FROM daemon.proposals WHERE status = ${status}
      ORDER BY created_at DESC LIMIT 100
    `;
  });
  return NextResponse.json({ proposals: rows });
}
