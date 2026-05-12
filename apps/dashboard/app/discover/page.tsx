// Public business directory. No auth.
// Feature-flagged via phase_2_directory; off by default until 5+ live merchants.

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { isEnabled } from '@/lib/features';
import { DiscoverClient } from './DiscoverClient';

export const metadata = {
  title: 'Discover businesses on VEDA',
  description: 'Find shops, services, classes, and more — all available to chat with on WhatsApp.',
};

export default async function DiscoverPage() {
  if (!isEnabled('phase_2_directory')) notFound();
  return (
    <main className="min-h-dvh bg-zinc-50">
      <header className="px-6 py-5 flex items-center justify-between max-w-6xl mx-auto">
        <Link href="/" className="text-lg font-semibold tracking-tight">
          VEDA
        </Link>
        <Link
          href="/login"
          className="text-sm rounded-md bg-zinc-900 text-white px-3 py-1.5 hover:bg-zinc-800"
        >
          Sign in
        </Link>
      </header>
      <section className="px-6 max-w-6xl mx-auto pb-16">
        <h1 className="text-3xl font-semibold tracking-tight mb-2">Discover businesses</h1>
        <p className="text-zinc-600 mb-6">
          Every business below has an AI agent you can chat with. Tap to start a conversation.
        </p>
        <DiscoverClient />
      </section>
    </main>
  );
}
