import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { withTenant } from '@/lib/db';

interface MemberRow {
  principal_id: string;
  display_name: string | null;
  role: string;
  joined_at: string | null;
  created_at: string;
}

interface InviteRow {
  id: string;
  phone_number: string | null;
  email: string | null;
  role: string;
  status: string;
  expires_at: string;
}

export async function GET() {
  const session = await getSession();
  if (!session.email || !session.current_tenant_id) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const { members, invites } = await withTenant(session.current_tenant_id, async (sql) => {
    const members = await sql<MemberRow[]>`
      SELECT m.principal_id::text, p.display_name, m.role, m.joined_at, m.created_at
      FROM core.tenant_memberships m
      JOIN core.principals p ON p.id = m.principal_id
      ORDER BY m.created_at ASC
    `;
    const invites = await sql<InviteRow[]>`
      SELECT id::text, phone_number, email, role, status, expires_at
      FROM core.team_invites
      WHERE status = 'pending'
      ORDER BY created_at DESC LIMIT 50
    `;
    return { members, invites };
  });
  return NextResponse.json({ members, invites });
}
