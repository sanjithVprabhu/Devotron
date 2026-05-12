'use client';

import { useEffect, useState } from 'react';

interface Proposal {
  id: string;
  proposal_type: string;
  title: string;
  description: string;
  estimated_impact: string | null;
  action: Record<string, unknown>;
  status: string;
  created_at: string;
  expires_at: string;
}

export function ProposalsList() {
  const [items, setItems] = useState<Proposal[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const res = await fetch('/api/proposals');
    if (res.ok) {
      const data = (await res.json()) as { proposals: Proposal[] };
      setItems(data.proposals);
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function decide(id: string, decision: 'approve' | 'reject') {
    await fetch(`/api/proposals/${id}/${decision}`, { method: 'POST' });
    load();
  }

  if (loading) return <p className="text-sm text-zinc-500">Loading…</p>;
  if (items.length === 0) {
    return (
      <div className="rounded-2xl border border-zinc-200 bg-white p-12 text-center text-zinc-500">
        No pending proposals.
      </div>
    );
  }

  return (
    <ul className="space-y-3">
      {items.map((p) => (
        <li key={p.id} className="rounded-2xl border border-zinc-200 bg-white p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-xs uppercase tracking-wide text-zinc-500">{p.proposal_type}</div>
              <h3 className="mt-0.5 font-medium">{p.title}</h3>
              <p className="mt-1 text-sm text-zinc-600">{p.description}</p>
              {p.estimated_impact && (
                <p className="mt-1 text-xs text-emerald-700">{p.estimated_impact}</p>
              )}
              <pre className="mt-3 max-h-48 overflow-auto rounded-md bg-zinc-50 p-2 text-[11px] text-zinc-700">
{JSON.stringify(p.action, null, 2)}
              </pre>
            </div>
            <div className="flex flex-col gap-2 shrink-0">
              <button
                onClick={() => decide(p.id, 'approve')}
                className="rounded-md bg-emerald-600 text-white px-3 py-1.5 text-sm hover:bg-emerald-700"
              >
                Approve
              </button>
              <button
                onClick={() => decide(p.id, 'reject')}
                className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-50"
              >
                Dismiss
              </button>
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
