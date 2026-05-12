// Fetch + cache per-tenant AiSensy credentials.
//
// Two API tiers are supported, distinguished by `aisensy_api_tier`:
//
//   "campaign" (FREE_FOREVER and most paid plans) — JWT in body.apiKey.
//                Sends only via approved campaign templates.
//   "project"  (paid Project API access) — X-AiSensy-Project-API-Pwd header.
//                Sends arbitrary content including free-form session messages.
//
// Inbound webhooks have the same shape on both tiers; we route by
// `aisensy_project_id` (which equals JWT.id for the campaign tier).

import { getSql } from '../../pg.js';
import { decryptSecret } from './secrets.js';

type Tier = 'campaign' | 'project';

interface Row {
  tenant_id: string;
  display_name: string;
  phone_number: string;
  aisensy_project_id: string | null;
  aisensy_project_api_pwd_enc: string | null;
  aisensy_webhook_secret_enc: string | null;
  aisensy_api_tier: string;
  aisensy_campaign_api_key_enc: string | null;
  aisensy_campaign_template_name: string | null;
  provider: string;
}

export interface TenantAiSensyCreds {
  tenant_id: string;
  display_name: string;
  phone_number: string;
  project_id: string;
  webhook_secret: string;
  tier: Tier;
  /** Project API password — present only when tier === 'project'. */
  api_pwd?: string;
  /** Campaign API JWT — present only when tier === 'campaign'. */
  campaign_api_key?: string;
  /** Approved AiSensy campaign template — required to actually send replies on free tier. */
  campaign_template_name?: string;
}

const cacheByTenant = new Map<string, TenantAiSensyCreds>();
const cacheByProject = new Map<string, TenantAiSensyCreds>();

export async function findByProjectId(projectId: string): Promise<TenantAiSensyCreds | null> {
  const cached = cacheByProject.get(projectId);
  if (cached) return cached;

  const sql = getSql();
  const rows = await sql<Row[]>`
    SELECT tenant_id::text AS tenant_id, display_name, phone_number,
           aisensy_project_id, aisensy_project_api_pwd_enc, aisensy_webhook_secret_enc,
           aisensy_api_tier, aisensy_campaign_api_key_enc, aisensy_campaign_template_name,
           provider
    FROM business.whatsapp_numbers
    WHERE provider = 'aisensy' AND aisensy_project_id = ${projectId}
    LIMIT 1
  `;
  if (rows.length === 0 || !rows[0]) return null;
  return tryDecrypt(rows[0]);
}

export async function findByTenantId(tenantId: string): Promise<TenantAiSensyCreds | null> {
  const cached = cacheByTenant.get(tenantId);
  if (cached) return cached;

  const sql = getSql();
  const rows = await sql<Row[]>`
    SELECT tenant_id::text AS tenant_id, display_name, phone_number,
           aisensy_project_id, aisensy_project_api_pwd_enc, aisensy_webhook_secret_enc,
           aisensy_api_tier, aisensy_campaign_api_key_enc, aisensy_campaign_template_name,
           provider
    FROM business.whatsapp_numbers
    WHERE tenant_id = ${tenantId}::uuid AND provider = 'aisensy'
    ORDER BY is_primary DESC LIMIT 1
  `;
  if (rows.length === 0 || !rows[0]) return null;
  return tryDecrypt(rows[0]);
}

function tryDecrypt(r: Row): TenantAiSensyCreds | null {
  if (!r.aisensy_project_id || !r.aisensy_webhook_secret_enc) return null;
  const tier: Tier = r.aisensy_api_tier === 'project' ? 'project' : 'campaign';

  let webhook_secret: string;
  let api_pwd: string | undefined;
  let campaign_api_key: string | undefined;
  try {
    webhook_secret = decryptSecret(r.aisensy_webhook_secret_enc);
    if (tier === 'project') {
      if (!r.aisensy_project_api_pwd_enc) return null;
      api_pwd = decryptSecret(r.aisensy_project_api_pwd_enc);
    } else {
      if (!r.aisensy_campaign_api_key_enc) return null;
      campaign_api_key = decryptSecret(r.aisensy_campaign_api_key_enc);
    }
  } catch {
    return null;
  }

  const creds: TenantAiSensyCreds = {
    tenant_id: r.tenant_id,
    display_name: r.display_name,
    phone_number: r.phone_number,
    project_id: r.aisensy_project_id,
    webhook_secret,
    tier,
    api_pwd,
    campaign_api_key,
    campaign_template_name: r.aisensy_campaign_template_name ?? undefined,
  };
  cacheByTenant.set(r.tenant_id, creds);
  cacheByProject.set(r.aisensy_project_id, creds);
  return creds;
}

export function clearCache(): void {
  cacheByTenant.clear();
  cacheByProject.clear();
}
