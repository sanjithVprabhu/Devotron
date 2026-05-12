// Inserts dummy AiSensy credentials for the Acme tenant so you can fire the
// simulator end-to-end without having a real AiSensy project yet.
//
// The webhook secret matches what the simulator uses by default. These are
// dev-only — the moment you have a real AiSensy project, replace via the
// Integrations page in the dashboard.

import { createCipheriv, randomBytes } from 'node:crypto';
import postgres from 'postgres';

const TENANT_ID = '11111111-1111-1111-1111-111111111111';
const FAKE_PROJECT_ID = 'dev_acme_project_001';
const FAKE_API_PWD = 'dev-api-pwd-not-real';
const FAKE_WEBHOOK_SECRET = 'dev-webhook-secret-not-real';

function encryptSecret(plaintext: string): string {
  const raw = process.env.TENANT_SECRET_KEY_B64;
  if (!raw) throw new Error('TENANT_SECRET_KEY_B64 must be set');
  const key = Buffer.from(raw, 'base64');
  if (key.length !== 32) throw new Error('TENANT_SECRET_KEY_B64 must decode to 32 bytes');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ['v1', iv.toString('base64'), tag.toString('base64'), ct.toString('base64')].join(':');
}

async function main() {
  const url = process.env.POSTGRES_URL;
  if (!url) {
    console.error('POSTGRES_URL is required');
    process.exit(1);
  }
  const sql = postgres(url, { max: 1 });

  const apiPwdEnc = encryptSecret(FAKE_API_PWD);
  const webhookEnc = encryptSecret(FAKE_WEBHOOK_SECRET);

  await sql`
    UPDATE business.whatsapp_numbers
    SET provider = 'aisensy',
        aisensy_project_id = ${FAKE_PROJECT_ID},
        aisensy_project_api_pwd_enc = ${apiPwdEnc},
        aisensy_webhook_secret_enc = ${webhookEnc},
        status = 'active',
        updated_at = NOW()
    WHERE tenant_id = ${TENANT_ID}::uuid AND is_primary = TRUE
  `;

  console.log(`AiSensy dev creds set for Acme tenant ${TENANT_ID}`);
  console.log(`  project_id:     ${FAKE_PROJECT_ID}`);
  console.log(`  webhook_secret: ${FAKE_WEBHOOK_SECRET}`);
  console.log('');
  console.log('Now you can fire the simulator with these credentials:');
  console.log(`  AISENSY_PROJECT_ID=${FAKE_PROJECT_ID} \\`);
  console.log(`  AISENSY_WEBHOOK_SECRET=${FAKE_WEBHOOK_SECRET} \\`);
  console.log(`  pnpm sim:aisensy "brake pads for swift dzire"`);

  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
