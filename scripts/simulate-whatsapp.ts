// Sends a Meta-shaped WhatsApp webhook payload to the local edge layer.
// Useful for driving the orchestrator without provisioning a real WhatsApp number.
//
// Usage:
//   pnpm tsx scripts/simulate-whatsapp.ts "Hi, I need brake pads for Swift Dzire"
//   FROM=+919999999999 pnpm tsx scripts/simulate-whatsapp.ts "any other text"
//
// Env it reads:
//   EDGE_URL                  default http://localhost:8080
//   META_APP_SECRET           if set, signs the payload (matches edge expectation)
//   META_VERIFY_TOKEN         not used here
//   ACME_PHONE_NUMBER_ID      defaults to seed value
//   FROM                      sender phone (E.164), default +919999999999

import { createHmac } from 'node:crypto';

const EDGE_URL = process.env.EDGE_URL ?? 'http://localhost:8080';
const APP_SECRET = process.env.META_APP_SECRET ?? '';
const PHONE_NUMBER_ID = process.env.ACME_PHONE_NUMBER_ID ?? 'placeholder_phone';
const FROM = process.env.FROM ?? '+919999999999';

const message = process.argv.slice(2).join(' ').trim() || 'Hi, I need brake pads for Swift Dzire';

const payload = {
  object: 'whatsapp_business_account',
  entry: [
    {
      id: 'placeholder_waba',
      changes: [
        {
          field: 'messages',
          value: {
            messaging_product: 'whatsapp',
            metadata: { display_phone_number: '+910000000000', phone_number_id: PHONE_NUMBER_ID },
            messages: [
              {
                id: `wamid.${Date.now().toString(36)}`,
                from: FROM,
                timestamp: String(Math.floor(Date.now() / 1000)),
                type: 'text',
                text: { body: message },
              },
            ],
          },
        },
      ],
    },
  ],
};

const body = JSON.stringify(payload);
const headers: Record<string, string> = { 'Content-Type': 'application/json' };
if (APP_SECRET) {
  const sig = createHmac('sha256', APP_SECRET).update(body).digest('hex');
  headers['X-Hub-Signature-256'] = `sha256=${sig}`;
}

async function main() {
  const url = `${EDGE_URL}/webhooks/whatsapp`;
  console.log(`POST ${url}`);
  console.log(`from: ${FROM}`);
  console.log(`text: ${message}`);
  const res = await fetch(url, { method: 'POST', headers, body });
  console.log(`-> ${res.status} ${await res.text()}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
