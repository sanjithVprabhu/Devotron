import type { FastifyInstance, FastifyRequest } from 'fastify';
import { KAFKA_TOPICS } from '@veda/shared-types/constants';
import type { MessagesInboundEvent } from '@veda/shared-types/events';
import { randomUUID } from 'node:crypto';
import { config } from '../config.js';
import { logger } from '../logger.js';
import { getAdapter } from '../channels/registry.js';
import '../types.js';
import type { VedaKafka } from '@veda/kafka-client';

export async function registerWhatsAppWebhook(app: FastifyInstance, kafka: VedaKafka): Promise<void> {
  const wa = getAdapter('whatsapp');

  // GET — verification challenge from Meta during webhook setup.
  app.get('/webhooks/whatsapp', async (req, reply) => {
    const mode = (req.query as Record<string, string>)['hub.mode'];
    const verify = (req.query as Record<string, string>)['hub.verify_token'];
    const challenge = (req.query as Record<string, string>)['hub.challenge'];
    if (mode === 'subscribe' && verify === config.META_VERIFY_TOKEN) {
      return reply.code(200).send(challenge);
    }
    return reply.code(403).send('forbidden');
  });

  // POST — actual webhook delivery.
  app.post('/webhooks/whatsapp', { config: { rawBody: true } }, async (req, reply) => {
    // Always 200 fast (Meta retries within 20s if not).
    void reply.code(200).send('ok');

    const raw = (req.rawBody ?? Buffer.alloc(0)) as Buffer;
    const sig = req.headers['x-hub-signature-256'] as string | undefined;
    if (!wa.verifySignature(raw, sig)) {
      logger.warn('whatsapp.webhook.bad_signature');
      return;
    }

    let canonical;
    try {
      canonical = await wa.inbound(req.body);
    } catch (err) {
      logger.error({ err }, 'whatsapp.webhook.translate_failed');
      return;
    }

    for (const msg of canonical) {
      const event: MessagesInboundEvent = {
        event_id: randomUUID(),
        occurred_at: new Date().toISOString(),
        tenant_id: msg.tenant_id,
        thread_id: msg.thread_id,
        principal_id: msg.sender_principal_id ?? '',
        channel: 'whatsapp',
        channel_message_id: msg.message_id,
        sender_identifier: msg.sender_identifier,
        recipient_identifier: msg.recipient_identifier,
        content: msg.content,
        raw_payload: msg.raw_payload,
      };
      try {
        await kafka.publish(KAFKA_TOPICS.MESSAGES_INBOUND, event);
      } catch (err) {
        logger.error({ err }, 'whatsapp.webhook.publish_failed');
      }
    }
  });

  // Fastify plugin to attach rawBody buffer for signature verification.
  app.addContentTypeParser(
    'application/json',
    { parseAs: 'buffer' },
    async (req: FastifyRequest, body: Buffer | string) => {
      const buf = Buffer.isBuffer(body) ? body : Buffer.from(body);
      req.rawBody = buf;
      try {
        return JSON.parse(buf.toString('utf-8'));
      } catch {
        throw new Error('invalid json');
      }
    },
  );
}
