// Posts a signed AiSensy-shaped webhook to the local edge /webhooks/aisensy.
// Drives the full agent loop without provisioning a real WhatsApp number.
//
// Usage:
//   pnpm tsx scripts/simulate-aisensy.ts "Hi, I need brake pads for Swift Dzire"
//   FROM=+919999999999 pnpm tsx scripts/simulate-aisensy.ts "any text"
//
// Env it reads:
//   EDGE_URL                       default http://localhost:8080
//   AISENSY_PROJECT_ID             must match the project_id you saved in the dashboard
//   AISENSY_WEBHOOK_SECRET         must match the webhook shared secret you saved
//   FROM                           sender phone (E.164), default +919999999999
//
// The script signs the body with HMAC-SHA256 using AISENSY_WEBHOOK_SECRET, the
// SAME way AiSensy signs real webhooks (see whatsappintegration/webhooks.md).

import { createHmac } from 'node:crypto';

const EDGE_URL = process.env.EDGE_URL ?? 'http://localhost:8080';
const PROJECT_ID = process.env.AISENSY_PROJECT_ID;
const WEBHOOK_SECRET = process.env.AISENSY_WEBHOOK_SECRET;
const FROM = process.env.FROM ?? '+919999999999';

if (!PROJECT_ID || !WEBHOOK_SECRET) {
  console.error(
    'AISENSY_PROJECT_ID and AISENSY_WEBHOOK_SECRET must be set.\n' +
      'Either export them in your shell, or save them on the dashboard\n' +
      'Integrations page first and then `source .env` before running.',
  );
  process.exit(1);
}

const text = process.argv.slice(2).join(' ').trim() || 'Hi, I need brake pads for Swift Dzire';

const messageId = `aisensy_msg_${Date.now().toString(36)}`;
const contactId = `aisensy_ct_${Buffer.from(FROM).toString('hex')}`;

const notification = {
  id: `aisensy_notif_${Date.now().toString(36)}`,
  created_at: Date.now(),
  topic: 'message.sender.user',
  delivery_attempt: 1,
  app_id: 'simulator',
  webhook_id: 'simulator-webhook',
  project_id: PROJECT_ID,
  data: {
    message: {
      type: 'message',
      id: messageId,
      project_id: PROJECT_ID,
      phone_number: FROM,
      contact_id: contactId,
      sender: 'USER',
      message_type: 'TEXT',
      message_content: { text: { body: text } },
      status: 'received',
      is_HSM: false,
      sent_at: Date.now(),
      messageId,
    },
    contact: {
      type: 'contact',
      id: contactId,
      project_id: PROJECT_ID,
      phone_number: FROM,
      name: 'Sim Customer',
      is_closed: false,
      is_requesting: false,
      is_intervened: false,
      created_at: Date.now(),
      tags: [],
      attributes: {},
      last_active: Date.now(),
      last_message: Date.now(),
      source: 'simulator',
      country_code: '91',
    },
  },
};

// IMPORTANT: AiSensy signs the *raw bytes* of the payload, so we must hash the
// exact JSON we send, not a re-stringified version on the receiver side.
const body = JSON.stringify(notification);
const signature = createHmac('sha256', WEBHOOK_SECRET).update(body).digest('hex');

async function main() {
  const url = `${EDGE_URL}/webhooks/aisensy`;
  console.log(`POST ${url}`);
  console.log(`project: ${PROJECT_ID}`);
  console.log(`from:    ${FROM}`);
  console.log(`text:    ${text}`);
  console.log(`sig:     ${signature.slice(0, 16)}…`);

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-AiSensy-Signature': signature,
      'X-AiSensy-Project-Id': PROJECT_ID!,
      'X-AiSensy-API-Version': '1.0',
    },
    body,
  });
  console.log(`-> ${res.status} ${await res.text()}`);
  console.log(
    '\nThe edge replied 200 immediately; the agent loop runs asynchronously.\n' +
      'Open http://localhost:3001/conversations to watch the reply land\n' +
      '(refresh in 4-10 seconds if it does not appear immediately).',
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
