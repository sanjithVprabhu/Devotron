// AiSensy webhook receiver. One endpoint serves all tenants; the
// `X-AiSensy-Project-Id` header tells us which tenant the notification is for.
// The signature is validated against that tenant's webhook_shared_secret.

import { randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { KAFKA_TOPICS } from '@veda/shared-types/constants';
import type { MessagesInboundEvent } from '@veda/shared-types/events';
import { logger } from '../logger.js';
import { AiSensyAdapter } from '../channels/aisensy/adapter.js';
import '../types.js';
import type { VedaKafka } from '@veda/kafka-client';

export async function registerAiSensyWebhook(app: FastifyInstance, kafka: VedaKafka): Promise<void> {
  const adapter = new AiSensyAdapter();

  app.post('/webhooks/aisensy', { config: { rawBody: true } }, async (req: FastifyRequest, reply) => {
    // 200 fast — AiSensy retries within 5 minutes if we don't 2xx within 5 seconds.
    void reply.code(200).send('ok');

    const raw = req.rawBody ?? Buffer.alloc(0);
    const projectId = (req.headers['x-aisensy-project-id'] as string | undefined)?.trim();
    const sig = req.headers['x-aisensy-signature'] as string | undefined;
    const apiVersion = req.headers['x-aisensy-api-version'] as string | undefined;

    if (!projectId) {
      logger.warn('aisensy.webhook.missing_project_id_header');
      return;
    }

    if (!(await adapter.verifySignatureForProject(raw, sig, projectId))) {
      logger.warn({ projectId, apiVersion }, 'aisensy.webhook.bad_signature');
      return;
    }

    let canonical;
    try {
      canonical = await adapter.inbound(req.body);
    } catch (err) {
      logger.error({ err, projectId }, 'aisensy.webhook.translate_failed');
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
        logger.error({ err }, 'aisensy.webhook.publish_failed');
      }
    }
  });
}
