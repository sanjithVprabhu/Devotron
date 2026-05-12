// Public business profile lookup — no auth, used by the profile page.
// Pulls from core.tenants + the current blueprint version (which Veda
// populates: identity.business_name, description, locations, persona, etc.).

import { NextResponse } from 'next/server';
import { getSql } from '@/lib/db';
import { isEnabled } from '@/lib/features';

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  if (!isEnabled('phase_1_storefront')) {
    return NextResponse.json({ error: 'storefront_disabled' }, { status: 404 });
  }
  const { slug } = await params;
  if (!slug) return NextResponse.json({ error: 'invalid_slug' }, { status: 400 });

  const sql = getSql();
  const rows = await sql<
    {
      id: string;
      name: string;
      slug: string;
      vertical: string;
      status: string;
      country_code: string;
      currency_code: string;
      blueprint: unknown;
    }[]
  >`
    SELECT t.id::text,
           t.name,
           t.slug,
           t.vertical,
           t.status,
           t.country_code,
           t.currency_code,
           v.content AS blueprint
      FROM core.tenants t
 LEFT JOIN blueprints.versions v
        ON v.tenant_id = t.id AND v.is_current = TRUE
     WHERE t.slug = ${slug}
       AND t.status = 'active'
     LIMIT 1
  `;

  if (rows.length === 0 || !rows[0]) {
    return NextResponse.json({ error: 'business_not_found' }, { status: 404 });
  }

  const row = rows[0];
  const bp =
    typeof row.blueprint === 'string'
      ? (JSON.parse(row.blueprint) as Record<string, unknown>)
      : ((row.blueprint as Record<string, unknown>) ?? {});

  const identity = (bp.identity as Record<string, unknown>) ?? {};
  const persona = (bp.persona as Record<string, unknown>) ?? {};

  return NextResponse.json({
    slug: row.slug,
    name: row.name,
    vertical: row.vertical,
    description: (identity.description as string) ?? '',
    locations: ((identity.locations as unknown[]) ?? []).filter((s): s is string => typeof s === 'string'),
    languages: normalizeLanguages(persona.languages),
    tone: (persona.tone as string) ?? 'friendly',
    country: row.country_code,
    currency: row.currency_code,
  });
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
