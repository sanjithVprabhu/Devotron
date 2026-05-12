'use client';

import { useEffect, useState } from 'react';

interface CurrentCreds {
  razorpay_key_id: string | null;
  has_razorpay_secret: boolean;
  has_razorpay_webhook_secret: boolean;
  stripe_pubkey: string | null;
  has_stripe_secret: boolean;
  upi_handle: string | null;
  configured_at: string | null;
  updated_at: string | null;
}

export function PaymentForm() {
  const [current, setCurrent] = useState<CurrentCreds | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  // Razorpay
  const [rzpKeyId, setRzpKeyId] = useState('');
  const [rzpKeySecret, setRzpKeySecret] = useState('');
  const [rzpWebhookSecret, setRzpWebhookSecret] = useState('');
  // UPI fallback
  const [upiHandle, setUpiHandle] = useState('');
  // Stripe (placeholder)
  const [stripePub, setStripePub] = useState('');
  const [stripeSec, setStripeSec] = useState('');

  async function load() {
    setLoading(true);
    try {
      const res = await fetch('/api/integrations/payment');
      if (res.ok) {
        const data = (await res.json()) as { payment: CurrentCreds | null };
        setCurrent(data.payment);
        if (data.payment) {
          setRzpKeyId(data.payment.razorpay_key_id ?? '');
          setUpiHandle(data.payment.upi_handle ?? '');
          setStripePub(data.payment.stripe_pubkey ?? '');
        }
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setInfo(null);
    try {
      const body: Record<string, unknown> = {};
      if (rzpKeyId) body.razorpay_key_id = rzpKeyId;
      if (rzpKeySecret) body.razorpay_key_secret = rzpKeySecret;
      if (rzpWebhookSecret) body.razorpay_webhook_secret = rzpWebhookSecret;
      if (upiHandle) body.upi_handle = upiHandle;
      if (stripePub) body.stripe_pubkey = stripePub;
      if (stripeSec) body.stripe_secret = stripeSec;
      const res = await fetch('/api/integrations/payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        setError(b.error ?? 'save_failed');
      } else {
        setInfo('Saved.');
        setRzpKeySecret('');
        setRzpWebhookSecret('');
        setStripeSec('');
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
        <h2 className="text-base font-semibold mb-2">Current configuration</h2>
        {current ? (
          <div className="text-sm space-y-1">
            <Row label="Razorpay key ID" value={current.razorpay_key_id ?? '— not set'} />
            <Row label="Razorpay secret" value={current.has_razorpay_secret ? '✓ stored (encrypted)' : '— missing'} />
            <Row label="Razorpay webhook secret" value={current.has_razorpay_webhook_secret ? '✓ stored (encrypted)' : '— optional'} />
            <Row label="Stripe public key" value={current.stripe_pubkey ?? '— not set'} />
            <Row label="Stripe secret" value={current.has_stripe_secret ? '✓ stored (encrypted)' : '— optional'} />
            <Row label="UPI handle" value={current.upi_handle ?? '— not set'} />
            <Row label="Last updated" value={current.updated_at ?? '—'} />
          </div>
        ) : (
          <p className="text-sm text-zinc-500">No payment provider configured yet.</p>
        )}
      </section>

      <form onSubmit={submit} className="rounded-2xl border border-zinc-200 bg-white p-5 space-y-4">
        <h2 className="text-base font-semibold">Razorpay (recommended for India)</h2>
        <Field label="Key ID (looks like rzp_test_… or rzp_live_…)" value={rzpKeyId} onChange={setRzpKeyId} placeholder="rzp_test_xxxxxxxxxx" />
        <Field
          label="Key secret"
          value={rzpKeySecret}
          onChange={setRzpKeySecret}
          type="password"
          placeholder={current?.has_razorpay_secret ? '••• stored — paste again to replace' : ''}
        />
        <Field
          label="Webhook secret (optional, for payment.captured events)"
          value={rzpWebhookSecret}
          onChange={setRzpWebhookSecret}
          type="password"
          placeholder={current?.has_razorpay_webhook_secret ? '••• stored — paste again to replace' : ''}
        />

        <div className="border-t border-zinc-100 pt-4">
          <h3 className="text-sm font-medium mb-2">UPI (manual fallback)</h3>
          <Field
            label="UPI handle (e.g. yourbusiness@hdfc)"
            value={upiHandle}
            onChange={setUpiHandle}
            placeholder="merchant@hdfc"
            hint="Used if Razorpay isn't configured. Customer is told to pay manually to this UPI handle."
          />
        </div>

        <details className="border-t border-zinc-100 pt-4">
          <summary className="text-sm font-medium cursor-pointer">Stripe (coming soon)</summary>
          <div className="mt-3 space-y-3">
            <Field label="Publishable key" value={stripePub} onChange={setStripePub} placeholder="pk_test_…" />
            <Field
              label="Secret key"
              value={stripeSec}
              onChange={setStripeSec}
              type="password"
              placeholder={current?.has_stripe_secret ? '••• stored — paste again to replace' : 'sk_test_…'}
            />
            <p className="text-xs text-zinc-500">
              Stripe wiring isn't live yet — these credentials are stored for the future Stripe adapter.
            </p>
          </div>
        </details>

        <div className="text-xs text-zinc-500">
          All secrets are AES-256-GCM encrypted before storage. Plaintext never appears in logs.
        </div>
        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-md bg-zinc-900 text-white px-3 py-2 text-sm font-medium disabled:opacity-50"
        >
          {submitting ? 'Saving…' : 'Save'}
        </button>
        {error && <p className="text-sm text-red-600">{error}</p>}
        {info && <p className="text-sm text-emerald-700">{info}</p>}
      </form>
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
