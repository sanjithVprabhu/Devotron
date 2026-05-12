// Public business profile page. No auth.
// Used as the share-friendly Linktree-style profile that also surfaces
// the "Talk to me" CTA → /c/<slug>.

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getSql } from '@/lib/db';
import { isEnabled } from '@/lib/features';
import { ReviewWidget } from './ReviewWidget';

interface Props {
  params: Promise<{ slug: string }>;
}

interface Profile {
  id: string;
  slug: string;
  name: string;
  vertical: string;
  description: string;
  locations: string[];
  languages: string[];  // normalized to uppercase short codes (EN, KN, ...)
  tone: string;
}

// Languages in blueprints can be either ['en', 'kn'] or [{code:'en', name:'English', ...}].
// Normalize to a list of short uppercase codes for display.
function normalizeLanguages(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((l) => {
      if (typeof l === 'string') return l;
      if (l && typeof l === 'object' && 'code' in l && typeof (l as { code: unknown }).code === 'string') {
        return (l as { code: string }).code;
      }
      return null;
    })
    .filter((s): s is string => typeof s === 'string' && s.length > 0)
    .map((s) => s.toUpperCase());
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

async function loadProfile(slug: string): Promise<Profile | null> {
  const sql = getSql();
  const rows = await sql<
    { id: string; name: string; slug: string; vertical: string; status: string; blueprint: unknown }[]
  >`
    SELECT t.id::text, t.name, t.slug, t.vertical, t.status, v.content AS blueprint
      FROM core.tenants t
 LEFT JOIN blueprints.versions v ON v.tenant_id = t.id AND v.is_current = TRUE
     WHERE t.slug = ${slug}
       AND t.status = 'active'
     LIMIT 1
  `;
  if (!rows[0]) return null;
  const row = rows[0];
  const bp =
    typeof row.blueprint === 'string'
      ? (JSON.parse(row.blueprint) as Record<string, unknown>)
      : ((row.blueprint as Record<string, unknown>) ?? {});
  const identity = (bp.identity as Record<string, unknown>) ?? {};
  const persona = (bp.persona as Record<string, unknown>) ?? {};
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    vertical: row.vertical,
    description: (identity.description as string) ?? '',
    locations: (identity.locations as string[]) ?? [],
    languages: normalizeLanguages(persona.languages),
    tone: (persona.tone as string) ?? 'friendly',
  };
}

export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  const p = await loadProfile(slug);
  if (!p) return { title: 'Not found' };
  const desc = p.description || `Talk to ${p.name} on WhatsApp`;
  return {
    title: `${p.name} on VEDA`,
    description: desc,
    openGraph: {
      title: `${p.name} on VEDA`,
      description: desc,
      type: 'profile',
      url: `/biz/${p.slug}`,
    },
    twitter: {
      card: 'summary',
      title: `${p.name} on VEDA`,
      description: desc,
    },
  };
}

export default async function BusinessProfilePage({ params }: Props) {
  if (!isEnabled('phase_1_storefront')) notFound();
  const { slug } = await params;
  const p = await loadProfile(slug);
  if (!p) notFound();

  const verticalLabel = VERTICAL_LABELS[p.vertical] ?? p.vertical;

  return (
    <main className="min-h-dvh bg-zinc-50 flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-md rounded-3xl bg-white border border-zinc-200 shadow-sm overflow-hidden">
        <div className="bg-gradient-to-br from-emerald-50 via-white to-zinc-50 px-6 py-8 text-center">
          <div className="mx-auto h-16 w-16 rounded-full bg-emerald-600 text-white flex items-center justify-center text-2xl font-semibold mb-3">
            {p.name.charAt(0).toUpperCase()}
          </div>
          <h1 className="text-xl font-semibold tracking-tight text-zinc-900">{p.name}</h1>
          <div className="mt-1 text-xs uppercase tracking-wide text-emerald-700">
            {verticalLabel}
          </div>
          {p.locations[0] && (
            <div className="mt-1 text-sm text-zinc-500">{p.locations.join(' · ')}</div>
          )}
        </div>

        <div className="px-6 py-5 space-y-4">
          {p.description && <p className="text-sm text-zinc-700 leading-relaxed">{p.description}</p>}

          <Link
            href={`/c/${p.slug}`}
            className="block w-full text-center rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-3 font-medium"
          >
            Talk to {p.name.split(' ')[0]} →
          </Link>

          {p.languages.length > 0 && (
            <div className="text-center text-xs text-zinc-400 pt-2">
              Languages: {p.languages.join(' · ')}
            </div>
          )}

          <ReviewWidget slug={p.slug} businessName={p.name} />
        </div>

        <div className="border-t border-zinc-100 px-6 py-3 text-center text-xs text-zinc-400">
          Powered by <span className="font-medium text-zinc-600">VEDA</span> — agents that run businesses
        </div>
      </div>
    </main>
  );
}
