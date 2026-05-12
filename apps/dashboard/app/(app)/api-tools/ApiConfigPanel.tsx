'use client';

import { useEffect, useState } from 'react';

interface ApiConfig {
  base_url: string | null;
  base_url_locked: boolean;
  auth_type: 'none' | 'bearer' | 'api_key_header' | 'basic';
  has_auth_secret: boolean;
  auth_header_name: string | null;
  pass_acting_user_default: boolean;
  acting_user_header: string;
  health_check_path: string | null;
  last_healthcheck_at: string | null;
  last_healthcheck_ok: boolean | null;
  notes: string | null;
  updated_at: string | null;
}

export function ApiConfigPanel() {
  const [config, setConfig] = useState<ApiConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  // Form state
  const [baseUrl, setBaseUrl] = useState('');
  const [authType, setAuthType] = useState<ApiConfig['auth_type']>('bearer');
  const [authSecret, setAuthSecret] = useState('');
  const [authHeaderName, setAuthHeaderName] = useState('');
  const [actingUserHeader, setActingUserHeader] = useState('X-Acting-User-Id');
  const [passActingUser, setPassActingUser] = useState(true);
  const [notes, setNotes] = useState('');

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/api-config');
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as { config: ApiConfig | null };
      setConfig(data.config);
      if (data.config) {
        setBaseUrl(data.config.base_url ?? '');
        setAuthType(data.config.auth_type);
        setAuthHeaderName(data.config.auth_header_name ?? '');
        setActingUserHeader(data.config.acting_user_header);
        setPassActingUser(data.config.pass_acting_user_default);
        setNotes(data.config.notes ?? '');
      } else {
        setEditing(true);
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setInfo(null);
    try {
      const payload: Record<string, unknown> = {
        base_url: baseUrl,
        auth_type: authType,
        pass_acting_user_default: passActingUser,
        acting_user_header: actingUserHeader,
        notes: notes || null,
      };
      if (authSecret) payload.auth_secret = authSecret;
      if (authHeaderName) payload.auth_header_name = authHeaderName;
      const res = await fetch('/api/api-config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || body.error || `HTTP ${res.status}`);
      }
      setInfo('Saved.');
      setAuthSecret('');
      setEditing(false);
      await load();
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }

  async function lock() {
    if (!confirm('Lock the base URL and auth? After locking, you must explicitly unlock to change them. This is recorded in the audit log.')) return;
    setError(null);
    try {
      const res = await fetch('/api/api-config/lock', { method: 'POST' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error === 'no_auth_secret' ? 'Save an auth secret first — locking requires one.' : (body.error || `HTTP ${res.status}`));
      }
      await load();
    } catch (e) {
      setError(String(e));
    }
  }

  async function unlock() {
    if (!confirm('Unlock the API connection? Anyone with dashboard access can change the base URL or token after this. The unlock is recorded.')) return;
    setError(null);
    try {
      const res = await fetch('/api/api-config/lock', { method: 'DELETE' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await load();
    } catch (e) {
      setError(String(e));
    }
  }

  if (loading) return <section className="rounded-2xl border border-zinc-200 bg-white p-5"><p className="text-sm text-zinc-500">Loading…</p></section>;

  const isConnected = config !== null && config.base_url !== null;
  const isLocked = !!config?.base_url_locked;

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-5">
      <header className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-base font-semibold">1. Connect your API</h2>
          <p className="text-xs text-zinc-500">
            Where your agent will call. One backend per tenant. Locks once set.
          </p>
        </div>
        {isConnected && (
          <span
            className={`text-xs px-2 py-0.5 rounded-full ${
              isLocked ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
            }`}
          >
            {isLocked ? '🔒 locked' : '✎ editable'}
          </span>
        )}
      </header>

      {/* Read view */}
      {isConnected && !editing && (
        <div className="text-sm space-y-2">
          <Row label="Base URL" value={config?.base_url ?? '—'} mono />
          <Row label="Auth type" value={config?.auth_type ?? '—'} />
          <Row label="Auth secret" value={config?.has_auth_secret ? '✓ stored (encrypted)' : '— missing'} />
          {config?.auth_type === 'api_key_header' && (
            <Row label="Auth header" value={config.auth_header_name ?? '—'} mono />
          )}
          <Row label="Acting-user header" value={config?.acting_user_header ?? '—'} mono />
          <Row
            label="Send acting user by default"
            value={config?.pass_acting_user_default ? '✓ yes' : '— no'}
          />
          {config?.notes && <Row label="Notes" value={config.notes} />}
          <Row label="Last saved" value={config?.updated_at ?? '—'} mono />
          <div className="flex gap-2 pt-2">
            {!isLocked && (
              <>
                <button
                  onClick={() => setEditing(true)}
                  className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs hover:bg-zinc-50"
                >
                  Edit
                </button>
                <button
                  onClick={lock}
                  disabled={!config?.has_auth_secret}
                  className="rounded-md bg-emerald-600 text-white px-3 py-1.5 text-xs disabled:opacity-50"
                  title={!config?.has_auth_secret ? 'Save an auth secret first' : undefined}
                >
                  🔒 Lock
                </button>
              </>
            )}
            {isLocked && (
              <button
                onClick={unlock}
                className="rounded-md border border-amber-300 text-amber-700 px-3 py-1.5 text-xs hover:bg-amber-50"
              >
                Unlock to change
              </button>
            )}
          </div>
        </div>
      )}

      {/* Edit form */}
      {editing && (
        <form onSubmit={save} className="space-y-3">
          <Field
            label="Base URL"
            value={baseUrl}
            onChange={setBaseUrl}
            placeholder="https://api.develup.com"
            required
            mono
          />
          <div className="grid grid-cols-2 gap-2">
            <div>
              <span className="text-xs text-zinc-600">Auth type</span>
              <select
                value={authType}
                onChange={(e) => setAuthType(e.target.value as ApiConfig['auth_type'])}
                className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
              >
                <option value="bearer">Bearer token</option>
                <option value="api_key_header">API key (custom header)</option>
                <option value="basic">Basic auth (user:pass base64)</option>
                <option value="none">No auth</option>
              </select>
            </div>
            {authType === 'api_key_header' && (
              <Field
                label="Header name"
                value={authHeaderName}
                onChange={setAuthHeaderName}
                placeholder="X-API-Key"
                mono
              />
            )}
          </div>
          {authType !== 'none' && (
            <Field
              label="Auth secret"
              value={authSecret}
              onChange={setAuthSecret}
              type="password"
              placeholder={config?.has_auth_secret ? '••• stored — paste again to replace' : 'paste your token here'}
              mono
            />
          )}
          <div className="grid grid-cols-2 gap-2">
            <Field
              label="Acting-user header name"
              value={actingUserHeader}
              onChange={setActingUserHeader}
              placeholder="X-Acting-User-Id"
              mono
              hint="The agent will inject the current user's id under this header. Default: X-Acting-User-Id"
            />
            <div>
              <span className="text-xs text-zinc-600">Send acting-user by default</span>
              <label className="mt-2 flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={passActingUser}
                  onChange={(e) => setPassActingUser(e.target.checked)}
                />
                Inject the header on every endpoint (override per-endpoint later)
              </label>
            </div>
          </div>
          <Field
            label="Notes (optional)"
            value={notes}
            onChange={setNotes}
            placeholder="DevelUp job portal REST API"
          />
          <div className="flex gap-2 pt-1">
            <button
              type="submit"
              disabled={saving || !baseUrl}
              className="rounded-md bg-zinc-900 text-white px-4 py-2 text-sm disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
            {isConnected && (
              <button
                type="button"
                onClick={() => { setEditing(false); load(); }}
                className="rounded-md border border-zinc-300 px-4 py-2 text-sm"
              >
                Cancel
              </button>
            )}
          </div>
        </form>
      )}

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      {info && <p className="mt-3 text-sm text-emerald-700">{info}</p>}
    </section>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-zinc-500">{label}</span>
      <span className={`text-zinc-900 text-right break-all ${mono ? 'font-mono text-xs' : ''}`}>{value}</span>
    </div>
  );
}

function Field({
  label, value, onChange, type = 'text', placeholder, required, mono, hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  required?: boolean;
  mono?: boolean;
  hint?: string;
}) {
  return (
    <label className="block text-sm">
      <span className="text-xs text-zinc-600">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        className={`mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm ${mono ? 'font-mono text-xs' : ''}`}
      />
      {hint && <p className="mt-1 text-xs text-zinc-500">{hint}</p>}
    </label>
  );
}
