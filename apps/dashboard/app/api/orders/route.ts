import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { withTenant } from '@/lib/db';

interface OrderRow {
  id: string;
  order_number: string;
  status: string;
  total_paise: number;
  payment_method: string | null;
  principal_id: string;
  created_at: string;
}

export async function GET(req: Request) {
  const session = await getSession();
  if (!session.email || !session.current_tenant_id) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const url = new URL(req.url);
  const status = url.searchParams.get('status');

  const rows = await withTenant(session.current_tenant_id, async (sql) => {
    if (status) {
      return sql<OrderRow[]>`
        SELECT id::text, order_number, status, total_paise, payment_method,
               principal_id::text, created_at
        FROM commerce.orders WHERE status = ${status}
        ORDER BY created_at DESC LIMIT 200
      `;
    }
    return sql<OrderRow[]>`
      SELECT id::text, order_number, status, total_paise, payment_method,
             principal_id::text, created_at
      FROM commerce.orders ORDER BY created_at DESC LIMIT 200
    `;
  });
  return NextResponse.json({ orders: rows });
}
