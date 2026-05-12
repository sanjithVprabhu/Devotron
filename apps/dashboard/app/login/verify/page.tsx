'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

export default function VerifyPage() {
  const router = useRouter();
  const params = useSearchParams();
  const email = params.get('email') ?? '';
  const next = params.get('next') ?? '/';
  const [code, setCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? 'verification_failed');
        return;
      }
      const data = (await res.json()) as { has_tenants: boolean; tenant_count: number };
      if (!data.has_tenants) {
        router.push('/onboarding');
      } else if (data.tenant_count > 1) {
        router.push('/tenant');
      } else {
        router.push(next);
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="mx-auto max-w-md px-6 py-24">
      <h1 className="text-3xl font-semibold tracking-tight">Enter your code</h1>
      <p className="mt-2 text-sm text-zinc-500">
        Sent to <strong>{email}</strong>. Check the dashboard server console in dev.
      </p>
      <form onSubmit={onSubmit} className="mt-8 space-y-4">
        <label className="block text-sm">
          One-time code
          <input
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            placeholder="6 digits"
            className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-lg tracking-[0.4em] text-center"
          />
        </label>
        <button
          type="submit"
          disabled={submitting || code.length < 6}
          className="w-full rounded-md bg-zinc-900 text-white px-3 py-2 text-sm font-medium disabled:opacity-50"
        >
          {submitting ? 'Verifying…' : 'Verify and continue'}
        </button>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <a className="block text-xs text-center text-zinc-500 hover:underline" href="/login">
          Use a different email
        </a>
      </form>
    </main>
  );
}
