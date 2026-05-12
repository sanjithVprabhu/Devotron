'use client';

import { useEffect, useState } from 'react';

interface Member {
  principal_id: string;
  display_name: string | null;
  role: string;
  joined_at: string | null;
}

interface Invite {
  id: string;
  phone_number: string | null;
  email: string | null;
  role: string;
  status: string;
  expires_at: string;
}

export function TeamView() {
  const [members, setMembers] = useState<Member[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const res = await fetch('/api/team');
    if (res.ok) {
      const d = (await res.json()) as { members: Member[]; invites: Invite[] };
      setMembers(d.members);
      setInvites(d.invites);
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  if (loading) return <p className="text-sm text-zinc-500">Loading…</p>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="text-sm text-zinc-600">
          {members.length} member{members.length === 1 ? '' : 's'} · {invites.length} pending invite
          {invites.length === 1 ? '' : 's'}
        </div>
        <button
          onClick={() => setShowForm((s) => !s)}
          className="rounded-md bg-zinc-900 text-white px-3 py-1.5 text-sm"
        >
          {showForm ? 'Cancel' : 'Invite member'}
        </button>
      </div>

      {showForm && (
        <InviteForm
          onInvited={() => {
            setShowForm(false);
            load();
          }}
          onError={setError}
        />
      )}

      <section>
        <h2 className="text-sm font-semibold text-zinc-700 mb-2">Members</h2>
        <ul className="rounded-2xl border border-zinc-200 bg-white divide-y divide-zinc-100">
          {members.map((m) => (
            <li key={m.principal_id} className="flex items-center justify-between p-3 text-sm">
              <div>
                <div>{m.display_name ?? m.principal_id.slice(0, 8)}</div>
                <div className="text-xs text-zinc-500">
                  {m.joined_at ? `joined ${new Date(m.joined_at).toLocaleDateString()}` : 'pending'}
                </div>
              </div>
              <span className="text-xs uppercase tracking-wide text-zinc-500">{m.role}</span>
            </li>
          ))}
        </ul>
      </section>

      {invites.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-zinc-700 mb-2">Pending invites</h2>
          <ul className="rounded-2xl border border-zinc-200 bg-white divide-y divide-zinc-100">
            {invites.map((i) => (
              <li key={i.id} className="flex items-center justify-between p-3 text-sm">
                <div>
                  <div>{i.email ?? i.phone_number}</div>
                  <div className="text-xs text-zinc-500">
                    expires {new Date(i.expires_at).toLocaleString()}
                  </div>
                </div>
                <span className="text-xs uppercase tracking-wide text-zinc-500">{i.role}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}

function InviteForm({
  onInvited,
  onError,
}: {
  onInvited: () => void;
  onError: (msg: string | null) => void;
}) {
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<'admin' | 'operator' | 'viewer'>('operator');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    onError(null);
    try {
      const body: Record<string, unknown> = { role };
      if (email) body.email = email;
      if (phone) body.phone_number = phone;
      const res = await fetch('/api/team/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) onError(await res.text());
      else onInvited();
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="grid grid-cols-1 md:grid-cols-3 gap-2 rounded-2xl border border-zinc-200 bg-white p-3"
    >
      <input
        type="email"
        placeholder="Email (optional)"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="rounded-md border border-zinc-300 px-2 py-1 text-sm"
      />
      <input
        placeholder="Phone (E.164, optional)"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        className="rounded-md border border-zinc-300 px-2 py-1 text-sm"
      />
      <select
        value={role}
        onChange={(e) => setRole(e.target.value as 'admin' | 'operator' | 'viewer')}
        className="rounded-md border border-zinc-300 px-2 py-1 text-sm"
      >
        <option value="admin">admin</option>
        <option value="operator">operator</option>
        <option value="viewer">viewer</option>
      </select>
      <button
        disabled={busy || (!email && !phone)}
        className="md:col-span-3 rounded-md bg-zinc-900 text-white px-3 py-1.5 text-sm disabled:opacity-50"
      >
        {busy ? 'Sending…' : 'Send invite'}
      </button>
    </form>
  );
}
