// Sandbox test runner. Takes an ad-hoc tool definition (not yet saved) +
// sample input values, fires the request against the tenant's locked
// api_config.base_url with stored auth, returns the response.
//
// Used by the "Test it" button before saving a tool.

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/session';
import { withTenant } from '@/lib/db';
import { decryptSecret } from '@/lib/secrets';

const Body = z.object({
  http_method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']),
  path: z.string().regex(/^\//).min(1).max(400),
  static_headers: z.record(z.string()).optional().default({}),
  body_template: z.string().nullable().optional(),
  pass_acting_user_override: z.boolean().nullable().optional(),
  // Sample values for path/body template substitution
  sample_args: z.record(z.unknown()).optional().default({}),
  // Optional acting user id (for endpoints with acting-user enabled)
  acting_user_id: z.string().max(64).nullable().optional(),
});

function templatePath(path: string, args: Record<string, unknown>): string {
  return path.replace(/\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g, (_m, key: string) => {
    const v = args[key];
    return encodeURIComponent(v == null ? '' : String(v));
  });
}

function templateBody(template: string | null | undefined, args: Record<string, unknown>): string | undefined {
  if (!template) return undefined;
  return template.replace(/\{\{([a-zA-Z_][a-zA-Z0-9_]*)\}\}/g, (_m, key: string) => {
    const v = args[key];
    if (v == null) return '';
    if (typeof v === 'object' || typeof v === 'boolean' || typeof v === 'number') return JSON.stringify(v);
    return String(v);
  });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session.email || !session.current_tenant_id) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const tenantId = session.current_tenant_id;
  let raw: unknown;
  try { raw = await req.json(); } catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }); }
  const parsed = Body.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: 'invalid_input', details: parsed.error.flatten() }, { status: 400 });
  const d = parsed.data;

  // Load tenant's API config — base URL must exist; lock isn't required for sandbox
  const cfg = await withTenant(tenantId, async (sql) => {
    const rows = await sql<{
      base_url: string;
      auth_type: string;
      auth_secret_enc: string | null;
      auth_header_name: string | null;
      pass_acting_user_default: boolean;
      acting_user_header: string;
    }[]>`
      SELECT base_url, auth_type, auth_secret_enc, auth_header_name,
             pass_acting_user_default, acting_user_header
        FROM business.api_config
       WHERE tenant_id = ${tenantId}::uuid LIMIT 1
    `;
    return rows[0] ?? null;
  });
  if (!cfg) {
    return NextResponse.json({ error: 'api_config_missing', detail: 'Connect your API first.' }, { status: 412 });
  }

  const path = templatePath(d.path, d.sample_args ?? {});
  const baseUrl = cfg.base_url.replace(/\/$/, '');
  const url = baseUrl + (path.startsWith('/') ? path : '/' + path);

  // Build headers
  const headers: Record<string, string> = { 'User-Agent': 'VEDA-Dashboard-Sandbox/0.1' };
  for (const [k, v] of Object.entries(d.static_headers ?? {})) headers[k] = v;
  if (cfg.auth_secret_enc) {
    let secret = '';
    try { secret = decryptSecret(cfg.auth_secret_enc); }
    catch { return NextResponse.json({ error: 'auth_decrypt_failed' }, { status: 500 }); }
    if (cfg.auth_type === 'bearer') headers['Authorization'] = `Bearer ${secret}`;
    else if (cfg.auth_type === 'api_key_header' && cfg.auth_header_name) headers[cfg.auth_header_name] = secret;
    else if (cfg.auth_type === 'basic') headers['Authorization'] = `Basic ${secret}`;
  }
  const passUser = d.pass_acting_user_override === null || d.pass_acting_user_override === undefined
    ? cfg.pass_acting_user_default
    : d.pass_acting_user_override;
  if (passUser && d.acting_user_id) {
    headers[cfg.acting_user_header] = d.acting_user_id;
  }

  const body = templateBody(d.body_template ?? null, d.sample_args ?? {});
  if (body !== undefined && !Object.keys(headers).some((k) => k.toLowerCase() === 'content-type')) {
    headers['Content-Type'] = 'application/json';
  }

  const started = Date.now();
  let status = 0;
  let respText = '';
  let respHeaders: Record<string, string> = {};
  let timeoutMs = 15000;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const r = await fetch(url, {
      method: d.http_method,
      headers,
      body,
      redirect: 'manual',
      signal: controller.signal,
    });
    clearTimeout(timer);
    status = r.status;
    respText = (await r.text()).slice(0, 100_000);
    r.headers.forEach((v, k) => { respHeaders[k] = v; });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({
      ok: false,
      error: msg.includes('aborted') ? 'timeout' : `network_error: ${msg}`,
      duration_ms: Date.now() - started,
      request: { url, method: d.http_method, headers, body },
    });
  }

  const elapsed_ms = Date.now() - started;
  let parsedBody: unknown = respText;
  const ct = (respHeaders['content-type'] || '').toLowerCase();
  if (ct.includes('json')) {
    try { parsedBody = JSON.parse(respText); } catch { /* leave as text */ }
  }

  return NextResponse.json({
    ok: status >= 200 && status < 300,
    status,
    duration_ms: elapsed_ms,
    request: {
      url,
      method: d.http_method,
      headers: { ...headers, Authorization: headers.Authorization ? '<redacted>' : undefined },
      body,
    },
    response: {
      status,
      headers: respHeaders,
      body: parsedBody,
    },
  });
}
