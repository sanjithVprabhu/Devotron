import { headers } from 'next/headers';
import { getSession } from '@/lib/session';
import { withTenant } from '@/lib/db';

interface KpiRow {
  conversations_today: number;
  orders_today: number;
  revenue_today_paise: number;
  pending_proposals: number;
}

async function getKpis(tenantId: string): Promise<KpiRow> {
  return withTenant(tenantId, async (sql) => {
    const [convo] = await sql<Array<{ n: number }>>`
      SELECT COUNT(*)::int AS n FROM conversations.threads
      WHERE created_at >= NOW() - INTERVAL '24 hours'`;
    const [order] = await sql<Array<{ n: number; revenue: number }>>`
      SELECT COUNT(*)::int AS n,
             COALESCE(SUM(total_paise) FILTER (WHERE status IN ('paid','fulfilled','closed')), 0)::bigint AS revenue
      FROM commerce.orders
      WHERE created_at >= NOW() - INTERVAL '24 hours'`;
    const [props] = await sql<Array<{ n: number }>>`
      SELECT COUNT(*)::int AS n FROM daemon.proposals WHERE status = 'pending'`;
    return {
      conversations_today: convo?.n ?? 0,
      orders_today: order?.n ?? 0,
      revenue_today_paise: Number(order?.revenue ?? 0),
      pending_proposals: props?.n ?? 0,
    };
  });
}

export default async function OverviewPage() {
  await headers();
  const session = await getSession();
  const tenantId = session.current_tenant_id;
  const kpis = tenantId ? await getKpis(tenantId).catch(() => null) : null;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Overview</h1>
      {!tenantId && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          Pick a business to start. <a className="underline" href="/tenant">Choose business →</a>
        </div>
      )}
      {tenantId && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card title="Conversations (24h)" value={(kpis?.conversations_today ?? 0).toString()} />
          <Card title="Orders (24h)" value={(kpis?.orders_today ?? 0).toString()} />
          <Card
            title="Revenue (24h)"
            value={`₹${((kpis?.revenue_today_paise ?? 0) / 100).toLocaleString('en-IN')}`}
          />
          <Card title="Pending proposals" value={(kpis?.pending_proposals ?? 0).toString()} />
        </div>
      )}
    </div>
  );
}

function Card({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-5">
      <div className="text-xs uppercase tracking-wide text-zinc-500">{title}</div>
      <div className="mt-2 text-3xl font-semibold">{value}</div>
    </div>
  );
}
