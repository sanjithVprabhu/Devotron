'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? 'request_failed');
        return;
      }
      router.push(`/login/verify?email=${encodeURIComponent(email)}`);
    } catch (err) {
      setError(String(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="mx-auto max-w-md px-6 py-24">
      <h1 className="text-3xl font-semibold tracking-tight">Sign in to VEDA</h1>
      <p className="mt-2 text-sm text-zinc-500">
        We&apos;ll send a one-time code to your email. The code is valid for 10 minutes.
      </p>
      <form onSubmit={onSubmit} className="mt-8 space-y-4">
        <label className="block text-sm">
          Email
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
          />
        </label>
        <button
          type="submit"
          disabled={submitting || !email}
          className="w-full rounded-md bg-zinc-900 text-white px-3 py-2 text-sm font-medium disabled:opacity-50"
        >
          {submitting ? 'Sending…' : 'Send code'}
        </button>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </form>
      <p className="mt-6 text-xs text-zinc-500">
        Local dev: the code is printed to the dashboard server console (no email
        is sent). Set <code>AUTH_EMAIL_PROVIDER</code> in production.
      </p>
    </main>
  );
}
