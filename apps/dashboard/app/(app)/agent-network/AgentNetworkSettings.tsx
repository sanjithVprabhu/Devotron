'use client';

import { useEffect, useState } from 'react';

interface Registry {
  is_listed_publicly: boolean;
  exposed_capabilities: string[];
  display_name: string | null;
  registry_url: string | null;
  signing_pubkey: string | null;
  pending_inbound: number;
}

const SUGGESTED_CAPABILITIES = [
  'catalog.query',
  'order.place',
  'booking.create',
  'delivery.request',
  'inventory.check',
  'price.quote',
];

export function AgentNetworkSettings() {
  const [data, setData] = useState<Registry | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/agent-network');
      if (!res.ok) {
        if (res.status === 404) throw new Error('A2A feature flag is off — set FEATURE_PHASE_3_A2A=true');
        throw new Error(`HTTP ${res.status}`);
      }
      setData((await res.json()) as Registry);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function patch(payload: Partial<Registry>) {
    setSaving(true);
    setError(null);
    setInfo(null);
    try {
      const res = await fetch('/api/agent-network', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      setInfo('Saved.');
      load();
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="text-sm text-zinc-500">Loading…</p>;
  if (error && !data) return <p className="text-sm text-red-600">{error}</p>;
  if (!data) return null;

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-zinc-200 bg-white p-5">
        <h2 className="text-base font-semibold mb-2">Public listing</h2>
        <p className="text-xs text-zinc-500 mb-3">
          When listed, your agent shows up in the cross-agent registry so other
          businesses' agents can discover and reach out to yours. Every inbound
          request still requires your explicit approval.
        </p>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={data.is_listed_publicly}
            onChange={(e) => patch({ is_listed_publicly: e.target.checked })}
            disabled={saving}
          />
          List my agent in the public agent registry
        </label>
      </section>

      <section className="rounded-2xl border border-zinc-200 bg-white p-5">
        <h2 className="text-base font-semibold mb-2">Capabilities you expose</h2>
        <p className="text-xs text-zinc-500 mb-3">
          What can other agents ask yours to do? These are advisory hints today —
          actual approval per-call is still required.
        </p>
        <CapabilityEditor
          value={data.exposed_capabilities}
          suggestions={SUGGESTED_CAPABILITIES}
          onChange={(next) => patch({ exposed_capabilities: next })}
          disabled={saving}
        />
      </section>

      <section className="rounded-2xl border border-zinc-200 bg-white p-5">
        <h2 className="text-base font-semibold mb-2">Inbound queue</h2>
        {data.pending_inbound > 0 ? (
          <p className="text-sm text-amber-700">
            ⚠ {data.pending_inbound} inbound a2a message{data.pending_inbound === 1 ? '' : 's'} awaiting your approval.
          </p>
        ) : (
          <p className="text-sm text-zinc-500">No pending inbound requests.</p>
        )}
      </section>

      {info && <div className="rounded-md bg-emerald-50 border border-emerald-200 px-4 py-2 text-xs text-emerald-800">{info}</div>}
      {error && <div className="rounded-md bg-red-50 border border-red-200 px-4 py-2 text-xs text-red-700">{error}</div>}
    </div>
  );
}

function CapabilityEditor({
  value,
  suggestions,
  onChange,
  disabled,
}: {
  value: string[];
  suggestions: string[];
  onChange: (next: string[]) => void;
  disabled: boolean;
}) {
  const [input, setInput] = useState('');

  function add(cap: string) {
    const trimmed = cap.trim();
    if (!trimmed) return;
    if (value.includes(trimmed)) return;
    onChange([...value, trimmed]);
  }

  function remove(cap: string) {
    onChange(value.filter((c) => c !== cap));
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1">
        {value.map((c) => (
          <span key={c} className="inline-flex items-center gap-1 rounded-full bg-emerald-100 text-emerald-800 px-2 py-0.5 text-xs">
            {c}
            <button onClick={() => remove(c)} disabled={disabled} className="text-emerald-700 hover:text-emerald-900" aria-label={`remove ${c}`}>
              ×
            </button>
          </span>
        ))}
        {value.length === 0 && <span className="text-xs text-zinc-400">No capabilities exposed yet.</span>}
      </div>
      <div className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Add a capability (e.g. delivery.request)"
          className="flex-1 rounded-md border border-zinc-300 px-3 py-1.5 text-xs"
          disabled={disabled}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add(input);
              setInput('');
            }
          }}
        />
        <button
          type="button"
          onClick={() => { add(input); setInput(''); }}
          disabled={disabled || !input.trim()}
          className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs"
        >
          Add
        </button>
      </div>
      <div className="flex flex-wrap gap-1">
        <span className="text-xs text-zinc-400">Suggestions:</span>
        {suggestions.filter((s) => !value.includes(s)).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => add(s)}
            disabled={disabled}
            className="text-xs rounded-full border border-zinc-200 px-2 py-0.5 hover:border-emerald-300 hover:text-emerald-700"
          >
            + {s}
          </button>
        ))}
      </div>
    </div>
  );
}
