// Public per-tenant chat. No auth. The customer-facing "Talk to my agent" surface.
// Each business that finishes the Veda interview gets a slug; their share-link is /c/<slug>.

import { notFound } from 'next/navigation';
import { getSql } from '@/lib/db';
import { isEnabled } from '@/lib/features';
import { PublicChat } from './PublicChat';

interface Props {
  params: Promise<{ slug: string }>;
}

interface BusinessRow {
  id: string;
  name: string;
  vertical: string;
  status: string;
  description: string;
  locations: string[];
  languages: string[];
}

async function loadBusiness(slug: string): Promise<BusinessRow | null> {
  const sql = getSql();
  const rows = await sql<
    {
      id: string;
      name: string;
      vertical: string;
      status: string;
      blueprint: unknown;
    }[]
  >`
    SELECT t.id::text, t.name, t.vertical, t.status, v.content AS blueprint
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
    name: row.name,
    vertical: row.vertical,
    status: row.status,
    description: (identity.description as string) ?? '',
    locations: ((identity.locations as unknown[]) ?? []).filter((s): s is string => typeof s === 'string'),
    languages: normalizeLanguages(persona.languages),
  };
}

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

export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  const biz = await loadBusiness(slug);
  if (!biz) return { title: 'Not found' };
  return {
    title: `${biz.name} on VEDA`,
    description: biz.description || `Talk to ${biz.name} — ${biz.vertical}`,
    openGraph: {
      title: `${biz.name} on VEDA`,
      description: biz.description || `Talk to ${biz.name} on WhatsApp`,
      type: 'website',
    },
  };
}

export default async function PublicChatPage({ params }: Props) {
  if (!isEnabled('phase_1_storefront')) {
    notFound();
  }
  const { slug } = await params;
  const biz = await loadBusiness(slug);
  if (!biz) notFound();

  return (
    <main className="min-h-dvh bg-zinc-50 flex items-center justify-center">
      <div className="w-full max-w-2xl flex flex-col h-dvh sm:h-[90vh] sm:my-4 sm:rounded-2xl sm:shadow-lg bg-white sm:border sm:border-zinc-200 overflow-hidden">
        <header className="border-b border-zinc-100 px-4 py-3 flex items-center justify-between bg-white">
          <div>
            <div className="text-base font-semibold tracking-tight">{biz.name}</div>
            <div className="text-xs text-zinc-500">
              <span className="inline-block rounded-full bg-zinc-100 px-2 py-0.5 mr-2 uppercase tracking-wide">
                {biz.vertical}
              </span>
              {biz.locations[0] && <span>{biz.locations[0]}</span>}
            </div>
          </div>
          <a
            href={`/biz/${slug}`}
            className="text-xs text-zinc-500 hover:text-zinc-900"
            aria-label="Business profile"
          >
            About →
          </a>
        </header>
        <PublicChat slug={slug} businessName={biz.name} />
        <footer className="border-t border-zinc-100 px-4 py-2 text-xs text-zinc-400 text-center">
          Powered by VEDA · agents that run businesses
        </footer>
      </div>
    </main>
  );
}
