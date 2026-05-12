'use client';

import { useEffect, useState } from 'react';

interface CurrentCreds {
  display_name: string;
  phone_number: string;
  aisensy_project_id: string | null;
  aisensy_api_tier: 'campaign' | 'project';
  aisensy_campaign_template_name: string | null;
  has_project_api_pwd: boolean;
  has_campaign_api_key: boolean;
  has_webhook_secret: boolean;
  status: string;
  provider: string;
}

type Tier = 'campaign' | 'project';

export function AisensyForm() {
  const [current, setCurrent] = useState<CurrentCreds | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  // Form state
  const [phone, setPhone] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [projectId, setProjectId] = useState('');
  const [webhookSecret, setWebhookSecret] = useState('');
  const [tier, setTier] = useState<Tier>('campaign');
  const [campaignKey, setCampaignKey] = useState('');
  const [templateName, setTemplateName] = useState('');
  const [projectApiPwd, setProjectApiPwd] = useState('');

  async function load() {
    setLoading(true);
    const res = await fetch('/api/integrations/aisensy');
    if (res.ok) {
      const data = (await res.json()) as { aisensy: CurrentCreds | null };
      setCurrent(data.aisensy);
      if (data.aisensy) {
        setPhone(data.aisensy.phone_number ?? '');
        setDisplayName(data.aisensy.display_name ?? '');
        setProjectId(data.aisensy.aisensy_project_id ?? '');
        setTier(data.aisensy.aisensy_api_tier ?? 'campaign');
        setTemplateName(data.aisensy.aisensy_campaign_template_name ?? '');
      }
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setInfo(null);
    try {
      const body: Record<string, unknown> = {
        phone_number: phone,
        display_name: displayName,
        aisensy_project_id: projectId,
        aisensy_webhook_secret: webhookSecret,
        aisensy_api_tier: tier,
      };
      if (tier === 'campaign') {
        if (campaignKey) body.aisensy_campaign_api_key = campaignKey;
        body.aisensy_campaign_template_name = templateName;
      } else {
        if (projectApiPwd) body.aisensy_project_api_pwd = projectApiPwd;
      }
      const res = await fetch('/api/integrations/aisensy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        setError(b.error ?? 'save_failed');
      } else {
        setInfo('Saved.');
        setCampaignKey('');
        setProjectApiPwd('');
        setWebhookSecret('');
        load();
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <p className="text-sm text-zinc-500">Loading…</p>;

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-zinc-200 bg-white p-5">
        <h2 className="text-base font-semibold mb-2">Current AiSensy connection</h2>
        {current?.aisensy_project_id ? (
          <div className="text-sm space-y-1">
            <Row label="Status" value={current.status} />
            <Row label="Phone" value={current.phone_number} />
            <Row label="Display name" value={current.display_name} />
            <Row label="API tier" value={current.aisensy_api_tier} />
            <Row label="AiSensy project / app id" value={current.aisensy_project_id} />
            <Row
              label="Webhook secret"
              value={current.has_webhook_secret ? '✓ stored (encrypted)' : '— missing'}
            />
            {current.aisensy_api_tier === 'campaign' ? (
              <>
                <Row
                  label="Campaign API key (JWT)"
                  value={current.has_campaign_api_key ? '✓ stored (encrypted)' : '— missing'}
                />
                <Row
                  label="Campaign template name"
                  value={current.aisensy_campaign_template_name ?? '— not set'}
                />
              </>
            ) : (
              <Row
                label="Project API password"
                value={current.has_project_api_pwd ? '✓ stored (encrypted)' : '— missing'}
              />
            )}
          </div>
        ) : (
          <p className="text-sm text-zinc-500">Not configured yet.</p>
        )}
      </section>

      <form onSubmit={submit} className="rounded-2xl border border-zinc-200 bg-white p-5 space-y-3">
        <h2 className="text-base font-semibold">
          {current?.aisensy_project_id ? 'Update credentials' : 'Connect AiSensy'}
        </h2>

        <div className="flex gap-2 text-xs">
          <button
            type="button"
            onClick={() => setTier('campaign')}
            className={`rounded-full px-3 py-1 ${
              tier === 'campaign' ? 'bg-zinc-900 text-white' : 'bg-zinc-100 text-zinc-700'
            }`}
          >
            Campaign API (Free / most paid plans)
          </button>
          <button
            type="button"
            onClick={() => setTier('project')}
            className={`rounded-full px-3 py-1 ${
              tier === 'project' ? 'bg-zinc-900 text-white' : 'bg-zinc-100 text-zinc-700'
            }`}
          >
            Project API (paid)
          </button>
        </div>

        <Field label="WhatsApp phone (E.164)" value={phone} onChange={setPhone} placeholder="+919876543210" />
        <Field label="Display name" value={displayName} onChange={setDisplayName} placeholder="DevelUp" />
        <Field
          label="AiSensy project / app id"
          value={projectId}
          onChange={setProjectId}
          placeholder="69d79490b13f900deb907d8e"
          hint="Decoded from your Campaign API JWT — the `id` field. Used to route inbound webhooks."
        />
        <Field
          label="Webhook shared secret"
          value={webhookSecret}
          onChange={setWebhookSecret}
          type="password"
          placeholder={current?.has_webhook_secret ? '••• stored — paste again to replace' : ''}
          hint="Configured in AiSensy dashboard → Webhooks. Used to verify HMAC on incoming notifications."
        />

        {tier === 'campaign' ? (
          <>
            <Field
              label="Campaign API key (JWT)"
              value={campaignKey}
              onChange={setCampaignKey}
              type="password"
              placeholder={
                current?.has_campaign_api_key ? '••• stored — paste again to replace' : 'eyJhbGciOi...'
              }
              hint="From AiSensy dashboard → Manage → API Key."
            />
            <Field
              label="Campaign template name"
              value={templateName}
              onChange={setTemplateName}
              placeholder="veda_session_reply"
              hint="Name of the approved template you'll use to wrap agent replies. Must exist + be approved in the AiSensy dashboard. Body should contain a single {{1}} parameter where the agent text gets injected."
            />
          </>
        ) : (
          <Field
            label="Project API password"
            value={projectApiPwd}
            onChange={setProjectApiPwd}
            type="password"
            placeholder={
              current?.has_project_api_pwd ? '••• stored — paste again to replace' : ''
            }
          />
        )}

        <div className="text-xs text-zinc-500">
          All secrets are AES-256-GCM encrypted before storage. Plaintext never appears in logs.
        </div>
        <button
          type="submit"
          disabled={submitting || !phone || !displayName || !projectId || !webhookSecret}
          className="w-full rounded-md bg-zinc-900 text-white px-3 py-2 text-sm font-medium disabled:opacity-50"
        >
          {submitting ? 'Saving…' : 'Save'}
        </button>
        {error && <p className="text-sm text-red-600">{error}</p>}
        {info && <p className="text-sm text-emerald-700">{info}</p>}
      </form>

      <section className="rounded-2xl border border-zinc-200 bg-zinc-50 p-5 text-xs text-zinc-600 space-y-2">
        <h3 className="text-sm font-medium text-zinc-800 mb-1">Webhook URL to configure on AiSensy</h3>
        <p>
          Go to AiSensy dashboard → <strong>Manage</strong> → <strong>Webhooks</strong>. Set the URL and
          subscribe to the message topics:
        </p>
        <code className="block rounded bg-white border border-zinc-200 p-2 text-zinc-900 break-all">
          {`<your-public-url>/webhooks/aisensy`}
        </code>
        <p>
          For local dev: run{' '}
          <code className="rounded bg-white px-1 py-0.5 text-zinc-900">ngrok http 8080</code>, paste the
          ngrok HTTPS URL above. Subscribe to topics:{' '}
          <code>message.sender.user</code>, <code>message.created</code>, and{' '}
          <code>message.status.updated</code>. Set the same shared secret you saved above.
        </p>
      </section>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-zinc-500">{label}</span>
      <span className="font-mono text-zinc-900 text-right break-all">{value}</span>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  hint?: string;
}) {
  return (
    <label className="block text-sm">
      {label}
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm font-mono"
      />
      {hint && <p className="mt-1 text-xs text-zinc-500">{hint}</p>}
    </label>
  );
}
