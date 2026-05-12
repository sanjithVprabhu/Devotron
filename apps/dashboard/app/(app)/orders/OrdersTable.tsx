'use client';

import { useEffect, useState } from 'react';

interface Order {
  id: string;
  order_number: string;
  status: string;
  total_paise: number;
  payment_method: string | null;
  created_at: string;
}

const NEXT_STATUS: Record<string, string[]> = {
  created: ['confirmed', 'cancelled'],
  confirmed: ['paid', 'cancelled'],
  paid: ['fulfilled', 'refunded'],
  fulfilled: ['closed', 'refunded'],
};

export function OrdersTable() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch('/api/orders');
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as { orders: Order[] };
      setOrders(data.orders);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function transition(orderId: string, toStatus: string) {
    await fetch('/api/orders/transition', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order_id: orderId, to_status: toStatus }),
    });
    load();
  }

  if (loading) return <p className="text-sm text-zinc-500">Loading…</p>;
  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (orders.length === 0) {
    return (
      <div className="rounded-2xl border border-zinc-200 bg-white p-12 text-center text-zinc-500">
        No orders yet.
      </div>
    );
  }

  return (
    <table className="w-full rounded-2xl border border-zinc-200 bg-white text-sm">
      <thead className="text-left text-xs uppercase tracking-wide text-zinc-500">
        <tr>
          <th className="p-3">#</th>
          <th className="p-3">Status</th>
          <th className="p-3 text-right">Total</th>
          <th className="p-3">Payment</th>
          <th className="p-3">Created</th>
          <th className="p-3 text-right">Actions</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-zinc-100">
        {orders.map((o) => (
          <tr key={o.id}>
            <td className="p-3 font-mono text-xs">{o.order_number}</td>
            <td className="p-3">
              <span
                className={`text-[11px] rounded-full px-2 py-0.5 ${
                  o.status === 'paid' || o.status === 'fulfilled' || o.status === 'closed'
                    ? 'bg-emerald-100 text-emerald-900'
                    : o.status === 'cancelled' || o.status === 'refunded'
                      ? 'bg-zinc-100 text-zinc-700'
                      : 'bg-amber-100 text-amber-900'
                }`}
              >
                {o.status}
              </span>
            </td>
            <td className="p-3 text-right">₹{(o.total_paise / 100).toLocaleString('en-IN')}</td>
            <td className="p-3 text-zinc-500">{o.payment_method ?? '—'}</td>
            <td className="p-3 text-zinc-500">{new Date(o.created_at).toLocaleString()}</td>
            <td className="p-3 text-right space-x-1">
              {(NEXT_STATUS[o.status] ?? []).map((s) => (
                <button
                  key={s}
                  onClick={() => transition(o.id, s)}
                  className="text-xs text-zinc-700 hover:text-zinc-900 underline"
                >
                  → {s}
                </button>
              ))}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
