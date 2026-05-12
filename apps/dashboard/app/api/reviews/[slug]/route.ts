// Public reviews endpoint.
//   GET  /api/reviews/<slug>  → list displayed reviews + aggregate
//   POST /api/reviews/<slug>  → leave a review (anonymous browser allowed; we
//                                resolve/auto-create a principal from sender_identifier
//                                so reviews are tied to a principal but don't require login)

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSql } from '@/lib/db';
import { isEnabled } from '@/lib/features';

interface AggregateRow {
  count: number;
  avg: number | null;
}

interface ReviewRow {
  id: string;
  rating: number;
  tags: string[] | null;
  collected_at: string;
}

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  if (!isEnabled('phase_2_reviews')) {
    return NextResponse.json({ error: 'reviews_disabled' }, { status: 404 });
  }
  const { slug } = await params;
  const sql = getSql();

  const tenantRows = await sql<{ id: string }[]>`
    SELECT id::text FROM core.tenants WHERE slug = ${slug} AND status = 'active' LIMIT 1
  `;
  if (!tenantRows[0]) return NextResponse.json({ error: 'business_not_found' }, { status: 404 });
  const tenant_id = tenantRows[0].id;

  // RLS-scoped read on reputation.reviews. The reviews table has a tenant_isolation
  // policy that requires app.tenant_id to be set.
  const result = await sql.begin(async (tx) => {
    await tx`SELECT set_config('app.tenant_id', ${tenant_id}, true)`;
    const aggregate = await tx<AggregateRow[]>`
      SELECT COUNT(*)::int AS count, AVG(rating)::float AS avg
        FROM reputation.reviews
       WHERE tenant_id = ${tenant_id}::uuid AND is_displayed = TRUE
    `;
    const reviews = await tx<ReviewRow[]>`
      SELECT id::text, rating, tags, collected_at
        FROM reputation.reviews
       WHERE tenant_id = ${tenant_id}::uuid AND is_displayed = TRUE
    ORDER BY collected_at DESC
       LIMIT 20
    `;
    return { aggregate: aggregate[0] ?? { count: 0, avg: null }, reviews };
  });

  return NextResponse.json({
    count: result.aggregate.count,
    average: result.aggregate.avg ? Math.round(result.aggregate.avg * 10) / 10 : null,
    reviews: result.reviews,
  });
}

const PostBody = z.object({
  rating: z.number().int().min(1).max(5),
  tags: z.array(z.string().max(40)).max(8).optional(),
  sender_identifier: z.string().min(3).max(64),
});

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  if (!isEnabled('phase_2_reviews')) {
    return NextResponse.json({ error: 'reviews_disabled' }, { status: 404 });
  }
  const { slug } = await params;
  let raw: unknown;
  try { raw = await req.json(); } catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }); }
  const parsed = PostBody.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: 'invalid_input', details: parsed.error.flatten() }, { status: 400 });

  const sql = getSql();
  const tenantRows = await sql<{ id: string }[]>`
    SELECT id::text FROM core.tenants WHERE slug = ${slug} AND status = 'active' LIMIT 1
  `;
  if (!tenantRows[0]) return NextResponse.json({ error: 'business_not_found' }, { status: 404 });
  const tenant_id = tenantRows[0].id;

  // Resolve sender_identifier → principal (reuses the same auto-create pattern).
  const ident = parsed.data.sender_identifier;
  const channel = /^\+[1-9]\d{7,14}$/.test(ident) ? 'whatsapp' : 'internal';

  const principal_id = await sql.begin(async (tx) => {
    const existing = await tx<{ pid: string }[]>`
      SELECT principal_id::text AS pid FROM core.identifiers
       WHERE channel = ${channel} AND identifier = ${ident} LIMIT 1
    `;
    if (existing[0]) return existing[0].pid;
    const created = await tx<{ id: string }[]>`
      INSERT INTO core.principals (display_name, metadata)
      VALUES (NULL, '{}'::jsonb) RETURNING id::text
    `;
    if (!created[0]) throw new Error('failed_to_create_principal');
    await tx`
      INSERT INTO core.identifiers (principal_id, channel, identifier, verified)
      VALUES (${created[0].id}::uuid, ${channel}, ${ident}, ${channel === 'whatsapp'})
    `;
    return created[0].id;
  });

  const tags = parsed.data.tags ?? [];

  await sql.begin(async (tx) => {
    await tx`SELECT set_config('app.tenant_id', ${tenant_id}, true)`;
    await tx`
      INSERT INTO reputation.reviews
        (tenant_id, reviewer_principal_id, rating, tags, is_displayed)
      VALUES (${tenant_id}::uuid, ${principal_id}::uuid, ${parsed.data.rating}, ${tags}::text[], TRUE)
    `;
  });

  return NextResponse.json({ ok: true });
}
