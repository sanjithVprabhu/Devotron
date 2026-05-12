// Public landing page at /.
// Logged-in users get redirected to /overview (the dashboard).
// Logged-out visitors see a hero + featured businesses + CTAs to sign in or browse.

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { getSql } from '@/lib/db';
import { isEnabled } from '@/lib/features';

interface FeaturedBiz {
  slug: string;
  name: string;
  vertical: string;
  description: string;
}

const VERTICAL_LABELS: Record<string, string> = {
  auto_parts: 'Auto parts',
  yoga: 'Yoga',
  salon: 'Salon',
  course: 'Online course',
  service: 'Service',
  booking: 'Bookings',
  digital: 'Digital content',
  jobs: 'Jobs',
  consulting: 'Consulting',
  restaurant: 'Restaurant',
  ecommerce: 'E-commerce',
  retail: 'Retail',
  fitness: 'Fitness',
  generic: 'Business',
};

async function getFeatured(): Promise<FeaturedBiz[]> {
  const sql = getSql();
  const rows = await sql<
    { slug: string; name: string; vertical: string; blueprint: unknown }[]
  >`
    SELECT t.slug, t.name, t.vertical, v.content AS blueprint
      FROM core.tenants t
 LEFT JOIN blueprints.versions v ON v.tenant_id = t.id AND v.is_current = TRUE
     WHERE t.status = 'active'
  ORDER BY t.created_at DESC
     LIMIT 8
  `;
  return rows.map((r) => {
    const bp =
      typeof r.blueprint === 'string'
        ? (JSON.parse(r.blueprint) as Record<string, unknown>)
        : ((r.blueprint as Record<string, unknown>) ?? {});
    const identity = (bp.identity as Record<string, unknown>) ?? {};
    return {
      slug: r.slug,
      name: r.name,
      vertical: r.vertical,
      description: ((identity.description as string) ?? '').slice(0, 140),
    };
  });
}

export default async function HomePage() {
  const session = await getSession();
  if (session.email && session.current_tenant_id) {
    redirect('/overview');
  }

  const showDirectory = isEnabled('phase_2_directory');
  const featured = showDirectory ? await getFeatured().catch(() => []) : [];

  return (
    <main className="min-h-dvh bg-gradient-to-br from-zinc-50 via-white to-emerald-50/40">
      <header className="px-6 py-5 flex items-center justify-between max-w-6xl mx-auto">
        <div className="text-lg font-semibold tracking-tight">VEDA</div>
        <nav className="flex items-center gap-3 text-sm">
          {showDirectory && (
            <Link href="/discover" className="text-zinc-600 hover:text-zinc-900">
              Discover
            </Link>
          )}
          <Link
            href="/login"
            className="rounded-md bg-zinc-900 text-white px-3 py-1.5 hover:bg-zinc-800"
          >
            Sign in
          </Link>
        </nav>
      </header>

      <section className="px-6 max-w-6xl mx-auto pt-12 pb-16 text-center sm:text-left sm:flex sm:items-end sm:gap-12">
        <div className="flex-1">
          <h1 className="text-4xl sm:text-5xl font-semibold tracking-tight text-zinc-900">
            AI agents that <span className="text-emerald-600">run</span> your business — on WhatsApp.
          </h1>
          <p className="mt-4 text-lg text-zinc-600 max-w-xl">
            Set up your agent in 5 minutes. It handles customer questions, takes
            orders, books appointments, and escalates to you when it matters.
          </p>
          <div className="mt-6 flex flex-wrap gap-3 justify-center sm:justify-start">
            <Link
              href="/login"
              className="inline-block rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-3 font-medium"
            >
              Get started
            </Link>
            {showDirectory && (
              <Link
                href="/discover"
                className="inline-block rounded-xl border border-zinc-300 hover:border-zinc-900 text-zinc-900 px-5 py-3 font-medium"
              >
                Find a business
              </Link>
            )}
          </div>
          <div className="mt-4 text-xs text-zinc-500">
            No code. No waiting. Real-time multi-language. India-ready.
          </div>
        </div>
      </section>

      {showDirectory && featured.length > 0 && (
        <section className="px-6 max-w-6xl mx-auto pb-16">
          <h2 className="text-sm uppercase tracking-wide text-zinc-500 mb-4">
            Live on VEDA
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {featured.map((b) => (
              <Link
                key={b.slug}
                href={`/biz/${b.slug}`}
                className="group rounded-2xl border border-zinc-200 bg-white p-4 hover:border-emerald-300 hover:shadow-sm transition"
              >
                <div className="flex items-center gap-3 mb-2">
                  <div className="h-10 w-10 rounded-full bg-emerald-600 text-white flex items-center justify-center font-semibold">
                    {b.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <div className="font-medium text-zinc-900 truncate">{b.name}</div>
                    <div className="text-xs uppercase tracking-wide text-emerald-700">
                      {VERTICAL_LABELS[b.vertical] ?? b.vertical}
                    </div>
                  </div>
                </div>
                {b.description && (
                  <p className="text-sm text-zinc-600 line-clamp-3">{b.description}</p>
                )}
                <div className="mt-3 text-xs text-emerald-700 group-hover:translate-x-0.5 transition">
                  Talk to agent →
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      <footer className="px-6 max-w-6xl mx-auto py-8 text-xs text-zinc-400 border-t border-zinc-100">
        Powered by VEDA · agents that run businesses · Made in India
      </footer>
    </main>
  );
}
