'use client';

import { useEffect, useState } from 'react';

interface ToolRow {
  id: string;
  name: string;
  display_name: string;
  description: string;
  http_method: string;
  path: string;
  side_effect: boolean;
  status: 'draft' | 'active' | 'disabled';
  last_tested_at: string | null;
  last_test_status: string | null;
  created_at: string;
}

const METHOD_COLOR: Record<string, string> = {
  GET: 'bg-blue-100 text-blue-800',
  POST: 'bg-emerald-100 text-emerald-800',
  PUT: 'bg-amber-100 text-amber-800',
  PATCH: 'bg-amber-100 text-amber-800',
  DELETE: 'bg-red-100 text-red-800',
};

const STATUS_COLOR: Record<string, string> = {
  active: 'bg-emerald-100 text-emerald-800',
  draft: 'bg-zinc-200 text-zinc-700',
  disabled: 'bg-zinc-100 text-zinc-400',
};

export function ApiToolsManager() {
  const [tools, setTools] = useState<ToolRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/api-tools');
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as { tools: ToolRow[] };
      setTools(data.tools);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function setStatus(id: string, status: ToolRow['status']) {
    await fetch(`/api/api-tools/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    load();
  }

  async function remove(id: string, name: string) {
    if (!confirm(`Delete tool "${name}"? This cannot be undone.`)) return;
    await fetch(`/api/api-tools/${id}`, { method: 'DELETE' });
    load();
  }

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-5">
      <header className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-base font-semibold">2. Endpoints</h2>
          <p className="text-xs text-zinc-500">
            Each endpoint becomes a tool the agent can call. Test before activating.
          </p>
        </div>
        <button
          onClick={() => { setEditingId(null); setShowForm((s) => !s); }}
          className="rounded-md bg-zinc-900 text-white px-3 py-1.5 text-sm"
        >
          {showForm ? 'Cancel' : '+ Add endpoint'}
        </button>
      </header>

      {showForm && (
        <ToolForm
          editingId={editingId}
          onSaved={() => { setShowForm(false); setEditingId(null); load(); }}
          onCancel={() => { setShowForm(false); setEditingId(null); }}
        />
      )}

      {error && <p className="text-sm text-red-600 mb-2">{error}</p>}

      {loading ? (
        <p className="text-sm text-zinc-500">Loading…</p>
      ) : tools.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500">
          No endpoints yet. Click "+ Add endpoint" to register the first one.
        </div>
      ) : (
        <ul className="divide-y divide-zinc-100">
          {tools.map((t) => (
            <li key={t.id} className="py-3 flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${METHOD_COLOR[t.http_method] ?? 'bg-zinc-100'}`}>
                    {t.http_method}
                  </span>
                  <span className="font-mono text-xs text-zinc-700 truncate">{t.path}</span>
                </div>
                <div className="mt-1 flex items-center gap-2">
                  <code className="text-xs font-mono text-zinc-900">{t.name}</code>
                  <span className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded-full ${STATUS_COLOR[t.status] ?? ''}`}>
                    {t.status}
                  </span>
                  {t.side_effect && (
                    <span className="text-[10px] uppercase bg-red-50 text-red-700 px-1.5 py-0.5 rounded-full">
                      side-effect · approval gated
                    </span>
                  )}
                </div>
                <p className="text-xs text-zinc-600 mt-1 max-w-2xl">{t.description}</p>
                {t.last_tested_at && (
                  <p className="text-[10px] text-zinc-400 mt-1 font-mono">
                    last tested {t.last_test_status} at {t.last_tested_at}
                  </p>
                )}
              </div>
              <div className="flex flex-col items-end gap-1 shrink-0">
                {t.status !== 'active' && (
                  <button onClick={() => setStatus(t.id, 'active')} className="text-xs text-emerald-700 hover:underline">
                    Activate
                  </button>
                )}
                {t.status === 'active' && (
                  <button onClick={() => setStatus(t.id, 'disabled')} className="text-xs text-zinc-500 hover:underline">
                    Disable
                  </button>
                )}
                <button onClick={() => { setEditingId(t.id); setShowForm(true); }} className="text-xs text-zinc-500 hover:underline">
                  Edit
                </button>
                <button onClick={() => remove(t.id, t.name)} className="text-xs text-red-600 hover:underline">
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ────────────────────────────────────────────────────────────────────────────

interface SchemaProp {
  key: string;
  type: 'string' | 'number' | 'integer' | 'boolean';
  required: boolean;
  description: string;
}

interface SandboxResponse {
  ok: boolean;
  status: number;
  duration_ms: number;
  request?: { url: string; method: string; headers: Record<string, string | undefined>; body?: string };
  response?: { status: number; headers: Record<string, string>; body: unknown };
  error?: string;
}

function ToolForm({
  editingId,
  onSaved,
  onCancel,
}: {
  editingId: string | null;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [description, setDescription] = useState('');
  const [method, setMethod] = useState<'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'>('GET');
  const [path, setPath] = useState('/');
  const [bodyTemplate, setBodyTemplate] = useState('');
  const [outputShapeHint, setOutputShapeHint] = useState('');
  const [props, setProps] = useState<SchemaProp[]>([
    { key: '', type: 'string', required: false, description: '' },
  ]);
  const [sideEffect, setSideEffect] = useState(false);
  const [overrideActingUser, setOverrideActingUser] = useState<'inherit' | 'on' | 'off'>('inherit');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sandbox state
  const [sampleArgs, setSampleArgs] = useState<Record<string, string>>({});
  const [sampleActingUser, setSampleActingUser] = useState('');
  const [running, setRunning] = useState(false);
  const [sandboxResult, setSandboxResult] = useState<SandboxResponse | null>(null);

  function addProp() {
    setProps((p) => [...p, { key: '', type: 'string', required: false, description: '' }]);
  }
  function updateProp(i: number, patch: Partial<SchemaProp>) {
    setProps((p) => p.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));
  }
  function removeProp(i: number) {
    setProps((p) => p.filter((_, idx) => idx !== i));
  }

  function buildInputSchema() {
    const properties: Record<string, { type: string; description?: string }> = {};
    const required: string[] = [];
    for (const p of props) {
      const k = p.key.trim();
      if (!k) continue;
      properties[k] = { type: p.type, ...(p.description ? { description: p.description } : {}) };
      if (p.required) required.push(k);
    }
    return { type: 'object' as const, properties, required };
  }

  function buildPassActingUserOverride(): boolean | null {
    if (overrideActingUser === 'on') return true;
    if (overrideActingUser === 'off') return false;
    return null;
  }

  async function runSandbox() {
    setRunning(true);
    setSandboxResult(null);
    setError(null);
    try {
      const args: Record<string, string | number | boolean> = {};
      for (const p of props) {
        if (!p.key.trim()) continue;
        const raw = sampleArgs[p.key.trim()];
        if (raw === undefined || raw === '') continue;
        if (p.type === 'number' || p.type === 'integer') args[p.key.trim()] = Number(raw);
        else if (p.type === 'boolean') args[p.key.trim()] = raw === 'true';
        else args[p.key.trim()] = raw;
      }
      const res = await fetch('/api/api-tools/sandbox-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          http_method: method,
          path,
          body_template: bodyTemplate || null,
          pass_acting_user_override: buildPassActingUserOverride(),
          sample_args: args,
          acting_user_id: sampleActingUser || null,
        }),
      });
      const data = (await res.json()) as SandboxResponse;
      setSandboxResult(data);
      if (!res.ok && !data.error) {
        setError(`HTTP ${res.status}`);
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setRunning(false);
    }
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const payload = {
        name: name.trim(),
        display_name: displayName.trim(),
        description: description.trim(),
        http_method: method,
        path,
        body_template: bodyTemplate || null,
        pass_acting_user_override: buildPassActingUserOverride(),
        input_schema: buildInputSchema(),
        output_shape_hint: outputShapeHint || null,
        side_effect: sideEffect,
        status: 'draft' as const,
      };
      const url = editingId ? `/api/api-tools/${editingId}` : '/api/api-tools';
      const httpMethod = editingId ? 'PATCH' : 'POST';
      const res = await fetch(url, {
        method: httpMethod,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || body.error || `HTTP ${res.status}`);
      }
      onSaved();
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 mb-4 space-y-4">
      <h3 className="text-sm font-semibold">{editingId ? 'Edit endpoint' : 'Register a new endpoint'}</h3>

      <div className="grid grid-cols-3 gap-2">
        <Field label="Name (dotted, agent-callable)" value={name} onChange={setName} placeholder="develup.jobs.search" mono />
        <Field label="Display name" value={displayName} onChange={setDisplayName} placeholder="Search DevelUp jobs" />
        <div>
          <span className="text-xs text-zinc-600">Method</span>
          <select
            value={method}
            onChange={(e) => setMethod(e.target.value as 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE')}
            className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
          >
            {(['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const).map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </div>
      </div>

      <Field
        label="Path (relative to base URL — use {var} for placeholders)"
        value={path}
        onChange={setPath}
        placeholder="/jobs?q={query}&location={location}"
        mono
      />

      <TextArea
        label="Description (LLM-readable — when should the agent call this?)"
        value={description}
        onChange={setDescription}
        rows={2}
        placeholder="Search active DevelUp jobs by role keyword and city. Returns up to 20 matching jobs."
      />

      {method !== 'GET' && method !== 'DELETE' && (
        <TextArea
          label="Body template (use {{var}} for substitution — single braces are for path)"
          value={bodyTemplate}
          onChange={setBodyTemplate}
          rows={4}
          mono
          placeholder={`{"job_id": "{{job_id}}", "cover_letter": "{{cover_letter}}"}`}
        />
      )}

      <div>
        <span className="text-xs text-zinc-600">Input schema — args the agent should pass</span>
        <div className="mt-1 space-y-1">
          {props.map((p, i) => (
            <div key={i} className="grid grid-cols-[1.5fr_100px_80px_2fr_30px] gap-1 items-center">
              <input
                value={p.key}
                onChange={(e) => updateProp(i, { key: e.target.value })}
                placeholder="arg_name"
                className="rounded-md border border-zinc-300 px-2 py-1 text-xs font-mono"
              />
              <select
                value={p.type}
                onChange={(e) => updateProp(i, { type: e.target.value as SchemaProp['type'] })}
                className="rounded-md border border-zinc-300 px-2 py-1 text-xs"
              >
                <option>string</option>
                <option>number</option>
                <option>integer</option>
                <option>boolean</option>
              </select>
              <label className="flex items-center gap-1 text-xs">
                <input
                  type="checkbox"
                  checked={p.required}
                  onChange={(e) => updateProp(i, { required: e.target.checked })}
                />
                required
              </label>
              <input
                value={p.description}
                onChange={(e) => updateProp(i, { description: e.target.value })}
                placeholder="what is this arg for? (LLM hint)"
                className="rounded-md border border-zinc-300 px-2 py-1 text-xs"
              />
              <button
                onClick={() => removeProp(i)}
                className="text-red-500 text-xs hover:underline"
                aria-label="remove"
              >
                ✕
              </button>
            </div>
          ))}
          <button onClick={addProp} type="button" className="text-xs text-zinc-600 hover:text-zinc-900">
            + add arg
          </button>
        </div>
      </div>

      <TextArea
        label="Output shape hint (helps LLM use the response)"
        value={outputShapeHint}
        onChange={setOutputShapeHint}
        rows={2}
        placeholder="Array of { id, title, location, salary_min, salary_max, posted_at }"
      />

      <div className="grid grid-cols-2 gap-2">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={sideEffect} onChange={(e) => setSideEffect(e.target.checked)} />
          Side-effect (writes state) → requires owner approval each call
        </label>
        <div>
          <span className="text-xs text-zinc-600">Acting-user header</span>
          <select
            value={overrideActingUser}
            onChange={(e) => setOverrideActingUser(e.target.value as 'inherit' | 'on' | 'off')}
            className="mt-1 w-full rounded-md border border-zinc-300 px-2 py-1 text-xs"
          >
            <option value="inherit">Inherit from API config</option>
            <option value="on">Force ON for this endpoint</option>
            <option value="off">Force OFF (no acting-user header)</option>
          </select>
        </div>
      </div>

      {/* Sandbox */}
      <div className="rounded-md border border-zinc-200 bg-white p-3 space-y-2">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">🧪 Sandbox test</h4>
        <p className="text-xs text-zinc-500">
          Try the endpoint with sample values. Uses the saved base URL + auth.
        </p>
        <div className="space-y-1">
          {props.filter((p) => p.key.trim()).map((p) => (
            <div key={p.key} className="flex items-center gap-2 text-xs">
              <span className="w-32 font-mono text-zinc-600 truncate">{p.key}{p.required && '*'}</span>
              <input
                value={sampleArgs[p.key] ?? ''}
                onChange={(e) => setSampleArgs({ ...sampleArgs, [p.key]: e.target.value })}
                placeholder={p.description}
                className="flex-1 rounded-md border border-zinc-300 px-2 py-1 text-xs font-mono"
              />
            </div>
          ))}
          {overrideActingUser !== 'off' && (
            <div className="flex items-center gap-2 text-xs">
              <span className="w-32 font-mono text-zinc-600">X-Acting-User-Id</span>
              <input
                value={sampleActingUser}
                onChange={(e) => setSampleActingUser(e.target.value)}
                placeholder="usr_abc (a DevelUp user id for testing)"
                className="flex-1 rounded-md border border-zinc-300 px-2 py-1 text-xs font-mono"
              />
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={runSandbox}
          disabled={running || !path}
          className="rounded-md bg-zinc-900 text-white px-3 py-1.5 text-xs disabled:opacity-50"
        >
          {running ? 'Running…' : 'Run sandbox'}
        </button>
        {sandboxResult && (
          <div className="rounded-md bg-zinc-50 border border-zinc-200 p-3 text-xs space-y-2 max-h-96 overflow-y-auto">
            <div className="flex items-center gap-2">
              <span className={`px-2 py-0.5 rounded-full font-mono text-[10px] ${sandboxResult.ok ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'}`}>
                {sandboxResult.status || 'error'} {sandboxResult.ok ? 'OK' : 'FAIL'}
              </span>
              <span className="text-zinc-500">{sandboxResult.duration_ms} ms</span>
            </div>
            {sandboxResult.error && <p className="text-red-600 font-mono">{sandboxResult.error}</p>}
            {sandboxResult.request && (
              <details>
                <summary className="cursor-pointer text-zinc-600">Request</summary>
                <pre className="mt-1 text-[10px] font-mono whitespace-pre-wrap">
                  {sandboxResult.request.method} {sandboxResult.request.url}{'\n'}
                  {Object.entries(sandboxResult.request.headers).filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join('\n')}
                  {sandboxResult.request.body ? '\n\n' + sandboxResult.request.body : ''}
                </pre>
              </details>
            )}
            {sandboxResult.response && (
              <details open>
                <summary className="cursor-pointer text-zinc-600">Response</summary>
                <pre className="mt-1 text-[10px] font-mono whitespace-pre-wrap">
                  {typeof sandboxResult.response.body === 'object'
                    ? JSON.stringify(sandboxResult.response.body, null, 2)
                    : String(sandboxResult.response.body)}
                </pre>
              </details>
            )}
          </div>
        )}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex gap-2 pt-1">
        <button
          type="button"
          onClick={save}
          disabled={saving || !name || !displayName || !description || !path}
          className="rounded-md bg-emerald-600 text-white px-4 py-2 text-sm disabled:opacity-50"
        >
          {saving ? 'Saving…' : editingId ? 'Save changes' : 'Save as draft'}
        </button>
        <button type="button" onClick={onCancel} className="rounded-md border border-zinc-300 px-4 py-2 text-sm">
          Cancel
        </button>
      </div>
    </div>
  );
}

function Field({
  label, value, onChange, placeholder, required, mono,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
  mono?: boolean;
}) {
  return (
    <label className="block text-sm">
      <span className="text-xs text-zinc-600">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        className={`mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm ${mono ? 'font-mono text-xs' : ''}`}
      />
    </label>
  );
}

function TextArea({
  label, value, onChange, rows = 3, placeholder, mono,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  rows?: number;
  placeholder?: string;
  mono?: boolean;
}) {
  return (
    <label className="block text-sm">
      <span className="text-xs text-zinc-600">{label}</span>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        className={`mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm ${mono ? 'font-mono text-xs' : ''}`}
      />
    </label>
  );
}
