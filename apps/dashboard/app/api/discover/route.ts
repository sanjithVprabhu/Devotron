// Public business directory search.
//
// Query params:
//   q          — free-text query (matches name, vertical, blueprint description)
//   vertical   — narrow to a vertical (auto_parts, salon, yoga, …)
//   city       — substring match against blueprint identity.locations OR business.profiles.city
//   lat,lng    — caller's coordinates; combined with radius_km for proximity search
//   radius_km  — default 10km if lat+lng provided; max 100
//   limit      — max results (default 20, max 50)
//
// Returns: { items: [{slug, name, vertical, description, locations, distance_km?}], total }

import { NextResponse } from 'next/server';
import { getSql } from '@/lib/db';
import { isEnabled } from '@/lib/features';

export async function GET(req: Request) {
  if (!isEnabled('phase_2_directory')) {
    return NextResponse.json({ error: 'discover_disabled' }, { status: 404 });
  }

  const url = new URL(req.url);
  const q = (url.searchParams.get('q') || '').trim().slice(0, 100);
  const vertical = (url.searchParams.get('vertical') || '').trim().slice(0, 40);
  const city = (url.searchParams.get('city') || '').trim().slice(0, 60);
  const latStr = url.searchParams.get('lat');
  const lngStr = url.searchParams.get('lng');
  const radiusKmStr = url.searchParams.get('radius_km');

  const lat = latStr ? parseFloat(latStr) : null;
  const lng = lngStr ? parseFloat(lngStr) : null;
  const radiusKm = Math.min(
    Math.max(radiusKmStr ? parseFloat(radiusKmStr) : 10, 0.5),
    100,
  );
  const useGeo = isEnabled('phase_2_geo') && lat !== null && lng !== null && Number.isFinite(lat) && Number.isFinite(lng);

  const limitRaw = parseInt(url.searchParams.get('limit') || '20', 10);
  const limit = Math.min(Math.max(Number.isFinite(limitRaw) ? limitRaw : 20, 1), 50);

  const qLike = q ? `%${q}%` : null;
  const cityLike = city ? `%${city}%` : null;

  const sql = getSql();
  // Haversine distance in km (no PostGIS dependency). NULL when no coords.
  // We compute distance always when geo-enabled so the client can sort.
  const rows = useGeo
    ? await sql<
        {
          slug: string;
          name: string;
          vertical: string;
          blueprint: unknown;
          city: string | null;
          distance_km: number | null;
        }[]
      >`
        SELECT t.slug, t.name, t.vertical, v.content AS blueprint, p.city,
               CASE
                 WHEN p.latitude IS NULL OR p.longitude IS NULL THEN NULL
                 ELSE 6371 * 2 * asin(sqrt(
                   pow(sin(radians((p.latitude - ${lat}) / 2)), 2) +
                   cos(radians(${lat})) * cos(radians(p.latitude)) *
                   pow(sin(radians((p.longitude - ${lng}) / 2)), 2)
                 ))
               END AS distance_km
          FROM core.tenants t
     LEFT JOIN blueprints.versions v ON v.tenant_id = t.id AND v.is_current = TRUE
     LEFT JOIN business.profiles p ON p.tenant_id = t.id
         WHERE t.status = 'active'
           AND (${qLike}::text IS NULL
                OR t.name ILIKE ${qLike}
                OR t.vertical ILIKE ${qLike}
                OR v.content::text ILIKE ${qLike})
           AND (${vertical || null}::text IS NULL OR t.vertical = ${vertical || null})
           AND (${cityLike}::text IS NULL OR p.city ILIKE ${cityLike} OR v.content::text ILIKE ${cityLike})
           AND (p.latitude IS NULL OR p.longitude IS NULL
                OR (6371 * 2 * asin(sqrt(
                     pow(sin(radians((p.latitude - ${lat}) / 2)), 2) +
                     cos(radians(${lat})) * cos(radians(p.latitude)) *
                     pow(sin(radians((p.longitude - ${lng}) / 2)), 2)
                   )) <= ${radiusKm}))
      ORDER BY (CASE WHEN p.latitude IS NULL THEN 1 ELSE 0 END) ASC, distance_km ASC NULLS LAST, t.created_at DESC
         LIMIT ${limit}
      `
    : await sql<
        {
          slug: string;
          name: string;
          vertical: string;
          blueprint: unknown;
          city: string | null;
          distance_km: null;
        }[]
      >`
        SELECT t.slug, t.name, t.vertical, v.content AS blueprint, p.city,
               NULL::double precision AS distance_km
          FROM core.tenants t
     LEFT JOIN blueprints.versions v ON v.tenant_id = t.id AND v.is_current = TRUE
     LEFT JOIN business.profiles p ON p.tenant_id = t.id
         WHERE t.status = 'active'
           AND (${qLike}::text IS NULL
                OR t.name ILIKE ${qLike}
                OR t.vertical ILIKE ${qLike}
                OR v.content::text ILIKE ${qLike})
           AND (${vertical || null}::text IS NULL OR t.vertical = ${vertical || null})
           AND (${cityLike}::text IS NULL OR p.city ILIKE ${cityLike} OR v.content::text ILIKE ${cityLike})
      ORDER BY t.created_at DESC
         LIMIT ${limit}
      `;

  const items = rows.map((r) => {
    const bp =
      typeof r.blueprint === 'string'
        ? (JSON.parse(r.blueprint) as Record<string, unknown>)
        : ((r.blueprint as Record<string, unknown>) ?? {});
    const identity = (bp.identity as Record<string, unknown>) ?? {};
    return {
      slug: r.slug,
      name: r.name,
      vertical: r.vertical,
      description: ((identity.description as string) ?? '').slice(0, 200),
      locations: ((identity.locations as unknown[]) ?? []).filter(
        (s): s is string => typeof s === 'string',
      ),
      city: r.city ?? null,
      distance_km: r.distance_km !== null ? Math.round(r.distance_km * 10) / 10 : null,
    };
  });

  return NextResponse.json({ items, total: items.length, near_me: useGeo });
}
