// Single-tool ops: PATCH (toggle status, edit fields) + DELETE.

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/session';
import { withTenant } from '@/lib/db';

const PatchBody = z.object({
  display_name: z.string().min(1).max(120).optional(),
  description: z.string().min(10).max(600).optional(),
  http_method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']).optional(),
  path: z.string().regex(/^\//).min(1).max(400).optional(),
  static_headers: z.record(z.string()).optional(),
  body_template: z.string().max(4000).nullable().optional(),
  pass_acting_user_override: z.boolean().nullable().optional(),
  input_schema: z.record(z.unknown()).optional(),
  output_shape_hint: z.string().max(400).nullable().optional(),
  side_effect: z.boolean().optional(),
  risk_override: z.enum(['low', 'medium', 'high']).nullable().optional(),
  status: z.enum(['draft', 'active', 'disabled']).optional(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session.email || !session.current_tenant_id) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const { id } = await params;
  const tenantId = session.current_tenant_id;
  let raw: unknown;
  try { raw = await req.json(); } catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }); }
  const parsed = PatchBody.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: 'invalid_input', details: parsed.error.flatten() }, { status: 400 });
  const d = parsed.data;

  await withTenant(tenantId, async (sql) => {
    if (d.display_name !== undefined) await sql`UPDATE business.api_tools SET display_name = ${d.display_name} WHERE id = ${id}::uuid AND tenant_id = ${tenantId}::uuid`;
    if (d.description !== undefined) await sql`UPDATE business.api_tools SET description = ${d.description} WHERE id = ${id}::uuid AND tenant_id = ${tenantId}::uuid`;
    if (d.http_method !== undefined) await sql`UPDATE business.api_tools SET http_method = ${d.http_method} WHERE id = ${id}::uuid AND tenant_id = ${tenantId}::uuid`;
    if (d.path !== undefined) await sql`UPDATE business.api_tools SET path = ${d.path} WHERE id = ${id}::uuid AND tenant_id = ${tenantId}::uuid`;
    if (d.static_headers !== undefined) await sql`UPDATE business.api_tools SET static_headers = ${JSON.stringify(d.static_headers)}::jsonb WHERE id = ${id}::uuid AND tenant_id = ${tenantId}::uuid`;
    if (d.body_template !== undefined) await sql`UPDATE business.api_tools SET body_template = ${d.body_template} WHERE id = ${id}::uuid AND tenant_id = ${tenantId}::uuid`;
    if (d.pass_acting_user_override !== undefined) await sql`UPDATE business.api_tools SET pass_acting_user_override = ${d.pass_acting_user_override} WHERE id = ${id}::uuid AND tenant_id = ${tenantId}::uuid`;
    if (d.input_schema !== undefined) await sql`UPDATE business.api_tools SET input_schema = ${JSON.stringify(d.input_schema)}::jsonb WHERE id = ${id}::uuid AND tenant_id = ${tenantId}::uuid`;
    if (d.output_shape_hint !== undefined) await sql`UPDATE business.api_tools SET output_shape_hint = ${d.output_shape_hint} WHERE id = ${id}::uuid AND tenant_id = ${tenantId}::uuid`;
    if (d.side_effect !== undefined) await sql`UPDATE business.api_tools SET side_effect = ${d.side_effect} WHERE id = ${id}::uuid AND tenant_id = ${tenantId}::uuid`;
    if (d.risk_override !== undefined) await sql`UPDATE business.api_tools SET risk_override = ${d.risk_override} WHERE id = ${id}::uuid AND tenant_id = ${tenantId}::uuid`;
    if (d.status !== undefined) await sql`UPDATE business.api_tools SET status = ${d.status} WHERE id = ${id}::uuid AND tenant_id = ${tenantId}::uuid`;
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session.email || !session.current_tenant_id) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const { id } = await params;
  const tenantId = session.current_tenant_id;
  await withTenant(tenantId, async (sql) => {
    await sql`DELETE FROM business.api_tools WHERE id = ${id}::uuid AND tenant_id = ${tenantId}::uuid`;
  });
  return NextResponse.json({ ok: true });
}
