import Link from 'next/link';
import { getSession } from '@/lib/session';
import { withTenant } from '@/lib/db';

export const dynamic = 'force-dynamic';

interface Thread {
  id: string;
  channel: string;
  status: string;
  message_count: number;
  last_message_at: string | null;
  principal_id: string;
  display_name: string | null;
}

async function fetchThreads(tenantId: string): Promise<Thread[]> {
  return withTenant(tenantId, async (sql) => {
    return sql<Thread[]>`
      SELECT t.id::text AS id, t.channel, t.status, t.message_count,
             t.last_message_at, t.principal_id::text AS principal_id, p.display_name
      FROM conversations.threads t
      JOIN core.principals p ON p.id = t.principal_id
      ORDER BY COALESCE(t.last_message_at, t.created_at) DESC
      LIMIT 100
    `;
  });
}

export default async function ConversationsPage() {
  const session = await getSession();
  if (!session.current_tenant_id) {
    return <p className="text-zinc-500">Pick a business first.</p>;
  }
  const threads = await fetchThreads(session.current_tenant_id).catch(() => []);
  const counts = {
    active: threads.filter((t) => t.status === 'active').length,
    escalated: threads.filter((t) => t.status === 'escalated').length,
    resolved: threads.filter((t) => t.status === 'resolved').length,
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Conversations</h1>
        <div className="flex gap-2 text-xs">
          <span className="rounded-full bg-zinc-100 px-3 py-1">All {threads.length}</span>
          <span className="rounded-full bg-emerald-100 text-emerald-900 px-3 py-1">Active {counts.active}</span>
          <span className="rounded-full bg-amber-100 text-amber-900 px-3 py-1">Escalated {counts.escalated}</span>
          <span className="rounded-full bg-zinc-100 px-3 py-1">Resolved {counts.resolved}</span>
        </div>
      </div>
      {threads.length === 0 ? (
        <div className="rounded-2xl border border-zinc-200 bg-white p-12 text-center text-zinc-500">
          No conversations yet. When customers message your WhatsApp number they appear here.
        </div>
      ) : (
        <ul className="divide-y divide-zinc-100 rounded-2xl border border-zinc-200 bg-white">
          {threads.map((t) => (
            <li key={t.id}>
              <Link
                href={`/conversations/${t.id}`}
                className="flex items-center justify-between p-4 hover:bg-zinc-50"
              >
                <div>
                  <div className="text-sm font-medium">
                    {t.display_name ?? t.principal_id.slice(0, 8)} · {t.channel}
                  </div>
                  <div className="text-xs text-zinc-500">
                    {t.last_message_at ? new Date(t.last_message_at).toLocaleString() : '—'}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`text-[10px] rounded-full px-2 py-0.5 ${
                      t.status === 'escalated'
                        ? 'bg-amber-100 text-amber-900'
                        : t.status === 'resolved'
                          ? 'bg-zinc-100 text-zinc-700'
                          : 'bg-emerald-100 text-emerald-900'
                    }`}
                  >
                    {t.status}
                  </span>
                  <span className="text-xs text-zinc-400">{t.message_count} msgs</span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
