import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { withTenant } from '@/lib/db';

interface ThreadRow {
  id: string;
  channel: string;
  status: string;
  message_count: number;
  last_message_at: string | null;
  principal_id: string;
  display_name: string | null;
}

export async function GET(req: Request) {
  const session = await getSession();
  if (!session.email) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const tenantId = session.current_tenant_id;
  if (!tenantId) return NextResponse.json({ threads: [] });

  const url = new URL(req.url);
  const status = url.searchParams.get('status');

  const rows = await withTenant(tenantId, async (sql) => {
    if (status) {
      return sql<ThreadRow[]>`
        SELECT t.id::text AS id, t.channel, t.status, t.message_count,
               t.last_message_at, t.principal_id::text AS principal_id,
               p.display_name
        FROM conversations.threads t
        JOIN core.principals p ON p.id = t.principal_id
        WHERE t.status = ${status}
        ORDER BY COALESCE(t.last_message_at, t.created_at) DESC
        LIMIT 100
      `;
    }
    return sql<ThreadRow[]>`
      SELECT t.id::text AS id, t.channel, t.status, t.message_count,
             t.last_message_at, t.principal_id::text AS principal_id,
             p.display_name
      FROM conversations.threads t
      JOIN core.principals p ON p.id = t.principal_id
      ORDER BY COALESCE(t.last_message_at, t.created_at) DESC
      LIMIT 100
    `;
  });
  return NextResponse.json({ threads: rows });
}
