// CRUD for registered API endpoints. List + create.

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/session';
import { withTenant } from '@/lib/db';

interface ToolRow {
  id: string;
  name: string;
  display_name: string;
  description: string;
  http_method: string;
  path: string;
  side_effect: boolean;
  status: string;
  last_tested_at: string | null;
  last_test_status: string | null;
  created_at: string;
}

export async function GET() {
  const session = await getSession();
  if (!session.email || !session.current_tenant_id) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const tenantId = session.current_tenant_id;
  const rows = await withTenant(tenantId, async (sql) => {
    return sql<ToolRow[]>`
      SELECT id::text, name, display_name, description,
             http_method, path, side_effect, status,
             last_tested_at::text, last_test_status,
             created_at::text
        FROM business.api_tools
       WHERE tenant_id = ${tenantId}::uuid
    ORDER BY created_at DESC
    `;
  });
  return NextResponse.json({ tools: rows });
}

const InputSchemaProp = z.object({
  type: z.enum(['string', 'number', 'integer', 'boolean', 'object', 'array']),
  description: z.string().max(300).optional(),
});

const CreateBody = z.object({
  name: z.string().min(3).max(80).regex(/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/, {
    message: 'name must be dotted lowercase (e.g. develup.jobs.search)',
  }),
  display_name: z.string().min(1).max(120),
  description: z.string().min(10).max(600),
  http_method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']),
  path: z.string().min(1).max(400).regex(/^\//, { message: 'path must start with /' }),
  static_headers: z.record(z.string()).optional().default({}),
  body_template: z.string().max(4000).nullable().optional(),
  pass_acting_user_override: z.boolean().nullable().optional(),
  input_schema: z.object({
    type: z.literal('object'),
    properties: z.record(InputSchemaProp),
    required: z.array(z.string()).optional(),
  }),
  output_shape_hint: z.string().max(400).nullable().optional(),
  side_effect: z.boolean().optional().default(false),
  risk_override: z.enum(['low', 'medium', 'high']).nullable().optional(),
  status: z.enum(['draft', 'active', 'disabled']).optional().default('draft'),
});

export async function POST(req: Request) {
  const session = await getSession();
  if (!session.email || !session.current_tenant_id || !session.principal_id) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const tenantId = session.current_tenant_id;
  let raw: unknown;
  try { raw = await req.json(); } catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }); }
  const parsed = CreateBody.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: 'invalid_input', details: parsed.error.flatten() }, { status: 400 });
  const d = parsed.data;

  // Require api_config to exist (otherwise tool can't run anyway).
  const cfgRow = await withTenant(tenantId, async (sql) => {
    const rows = await sql<{ base_url_locked: boolean }[]>`SELECT base_url_locked FROM business.api_config WHERE tenant_id = ${tenantId}::uuid LIMIT 1`;
    return rows[0] ?? null;
  });
  if (!cfgRow) {
    return NextResponse.json({ error: 'api_config_missing', detail: 'Connect your API first.' }, { status: 412 });
  }

  try {
    const result = await withTenant(tenantId, async (sql) => {
      return sql<{ id: string }[]>`
        INSERT INTO business.api_tools
          (tenant_id, name, display_name, description, http_method, path,
           static_headers, body_template, pass_acting_user_override,
           input_schema, output_shape_hint, side_effect, risk_override, status,
           created_by_principal_id)
        VALUES (
          ${tenantId}::uuid,
          ${d.name}, ${d.display_name}, ${d.description},
          ${d.http_method}, ${d.path},
          ${JSON.stringify(d.static_headers ?? {})}::jsonb,
          ${d.body_template ?? null},
          ${d.pass_acting_user_override ?? null},
          ${JSON.stringify(d.input_schema)}::jsonb,
          ${d.output_shape_hint ?? null},
          ${d.side_effect ?? false},
          ${d.risk_override ?? null},
          ${d.status ?? 'draft'},
          ${session.principal_id}::uuid
        )
        RETURNING id::text
      `;
    });
    return NextResponse.json({ ok: true, id: result[0]?.id });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes('duplicate key')) {
      return NextResponse.json({ error: 'name_conflict', detail: `tool '${d.name}' already exists` }, { status: 409 });
    }
    return NextResponse.json({ error: 'db_error', detail: msg }, { status: 500 });
  }
}
