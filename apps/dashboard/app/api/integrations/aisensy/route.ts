import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/session';
import { withTenant } from '@/lib/db';
import { encryptSecret } from '@/lib/secrets';

interface CredsRow {
  display_name: string;
  phone_number: string;
  aisensy_project_id: string | null;
  aisensy_api_tier: string;
  aisensy_campaign_template_name: string | null;
  has_project_api_pwd: boolean;
  has_campaign_api_key: boolean;
  has_webhook_secret: boolean;
  status: string;
  provider: string;
}

export async function GET() {
  const session = await getSession();
  if (!session.email || !session.current_tenant_id) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const tenantId = session.current_tenant_id;
  const row = await withTenant(tenantId, async (sql) => {
    const rows = await sql<CredsRow[]>`
      SELECT display_name, phone_number, aisensy_project_id, aisensy_api_tier,
             aisensy_campaign_template_name,
             (aisensy_project_api_pwd_enc IS NOT NULL) AS has_project_api_pwd,
             (aisensy_campaign_api_key_enc IS NOT NULL) AS has_campaign_api_key,
             (aisensy_webhook_secret_enc IS NOT NULL) AS has_webhook_secret,
             status, provider
      FROM business.whatsapp_numbers
      WHERE is_primary = TRUE LIMIT 1
    `;
    return rows[0] ?? null;
  });
  return NextResponse.json({ aisensy: row });
}

const SaveSchema = z
  .object({
    phone_number: z.string().min(8),
    display_name: z.string().min(1),
    aisensy_project_id: z.string().min(1),
    aisensy_webhook_secret: z.string().min(8),
    aisensy_api_tier: z.enum(['campaign', 'project']).default('campaign'),
    // Campaign tier fields
    aisensy_campaign_api_key: z.string().min(20).optional(),
    aisensy_campaign_template_name: z.string().min(1).optional(),
    // Project tier fields
    aisensy_project_api_pwd: z.string().min(1).optional(),
  })
  .refine(
    (d) =>
      d.aisensy_api_tier === 'campaign'
        ? Boolean(d.aisensy_campaign_api_key && d.aisensy_campaign_template_name)
        : Boolean(d.aisensy_project_api_pwd),
    { message: 'tier-specific fields missing' },
  );

export async function POST(req: Request) {
  const session = await getSession();
  if (!session.email || !session.current_tenant_id) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const tenantId = session.current_tenant_id;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }
  const parsed = SaveSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_input', details: parsed.error.flatten() }, { status: 400 });
  }
  const d = parsed.data;

  let webhookEnc: string;
  let projectApiPwdEnc: string | null = null;
  let campaignApiKeyEnc: string | null = null;
  try {
    webhookEnc = encryptSecret(d.aisensy_webhook_secret);
    if (d.aisensy_api_tier === 'project' && d.aisensy_project_api_pwd) {
      projectApiPwdEnc = encryptSecret(d.aisensy_project_api_pwd);
    }
    if (d.aisensy_api_tier === 'campaign' && d.aisensy_campaign_api_key) {
      campaignApiKeyEnc = encryptSecret(d.aisensy_campaign_api_key);
    }
  } catch (e) {
    return NextResponse.json({ error: 'encryption_failed', details: String(e) }, { status: 500 });
  }

  await withTenant(tenantId, async (sql) => {
    await sql`
      INSERT INTO business.whatsapp_numbers
        (tenant_id, phone_number, display_name, status, is_primary, provider,
         aisensy_project_id, aisensy_webhook_secret_enc, aisensy_api_tier,
         aisensy_project_api_pwd_enc, aisensy_campaign_api_key_enc, aisensy_campaign_template_name)
      VALUES (
        ${tenantId}::uuid, ${d.phone_number}, ${d.display_name},
        'active', TRUE, 'aisensy',
        ${d.aisensy_project_id}, ${webhookEnc}, ${d.aisensy_api_tier},
        ${projectApiPwdEnc}, ${campaignApiKeyEnc},
        ${d.aisensy_campaign_template_name ?? null}
      )
      ON CONFLICT (phone_number) DO UPDATE SET
        display_name = EXCLUDED.display_name,
        provider = 'aisensy',
        aisensy_project_id = EXCLUDED.aisensy_project_id,
        aisensy_webhook_secret_enc = EXCLUDED.aisensy_webhook_secret_enc,
        aisensy_api_tier = EXCLUDED.aisensy_api_tier,
        aisensy_project_api_pwd_enc = COALESCE(EXCLUDED.aisensy_project_api_pwd_enc, business.whatsapp_numbers.aisensy_project_api_pwd_enc),
        aisensy_campaign_api_key_enc = COALESCE(EXCLUDED.aisensy_campaign_api_key_enc, business.whatsapp_numbers.aisensy_campaign_api_key_enc),
        aisensy_campaign_template_name = COALESCE(EXCLUDED.aisensy_campaign_template_name, business.whatsapp_numbers.aisensy_campaign_template_name),
        status = 'active',
        updated_at = NOW()
    `;
  });

  return NextResponse.json({ ok: true });
}
