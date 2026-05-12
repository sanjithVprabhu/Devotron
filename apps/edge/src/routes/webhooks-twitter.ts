import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { KAFKA_TOPICS } from '@veda/shared-types/constants';
import type { MessagesInboundEvent } from '@veda/shared-types/events';
import { logger } from '../logger.js';
import { getAdapter } from '../channels/registry.js';
import type { VedaKafka } from '@veda/kafka-client';

export async function registerTwitterWebhook(app: FastifyInstance, kafka: VedaKafka): Promise<void> {
  const tw = getAdapter('twitter');

  // CRC challenge (Account Activity API)
  app.get('/webhooks/twitter', async (req, reply) => {
    const crc = (req.query as Record<string, string>)['crc_token'];
    // For full Account Activity API, sign crc with consumer secret. Skipped in v1 stub.
    return reply.send({ response_token: `sha256=${crc ?? ''}` });
  });

  app.post('/webhooks/twitter', async (req, reply) => {
    void reply.code(200).send('ok');

    let canonical;
    try {
      canonical = await tw.inbound(req.body);
    } catch (err) {
      logger.error({ err }, 'twitter.webhook.translate_failed');
      return;
    }

    for (const msg of canonical) {
      const event: MessagesInboundEvent = {
        event_id: randomUUID(),
        occurred_at: new Date().toISOString(),
        tenant_id: null,
        thread_id: null,
        principal_id: msg.sender_principal_id ?? '',
        channel: 'twitter',
        channel_message_id: msg.message_id,
        sender_identifier: msg.sender_identifier,
        recipient_identifier: msg.recipient_identifier,
        content: msg.content,
        raw_payload: msg.raw_payload,
      };
      try {
        await kafka.publish(KAFKA_TOPICS.MESSAGES_INBOUND, event);
      } catch (err) {
        logger.error({ err }, 'twitter.webhook.publish_failed');
      }
    }
  });
}
