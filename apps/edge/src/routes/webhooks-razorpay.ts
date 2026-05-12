// Razorpay webhook: payment.captured / payment.failed / refund.processed.
// Verifies signature, normalises to integration event, publishes to integrations topic.

import { createHmac, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { KAFKA_TOPICS } from '@veda/shared-types/constants';
import type { IntegrationEvent } from '@veda/shared-types/events';
import { config } from '../config.js';
import { logger } from '../logger.js';
import '../types.js';
import type { VedaKafka } from '@veda/kafka-client';

export async function registerRazorpayWebhook(app: FastifyInstance, kafka: VedaKafka): Promise<void> {
  app.post('/webhooks/razorpay', { config: { rawBody: true } }, async (req, reply) => {
    const raw = req.rawBody ?? Buffer.alloc(0);
    const sig = req.headers['x-razorpay-signature'] as string | undefined;
    if (!config.RAZORPAY_WEBHOOK_SECRET) {
      logger.warn('razorpay.webhook.no_secret_configured');
      return reply.code(503).send('not configured');
    }
    if (!sig) return reply.code(401).send('missing signature');
    const expected = createHmac('sha256', config.RAZORPAY_WEBHOOK_SECRET).update(raw).digest('hex');
    if (sig.length !== expected.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
      return reply.code(401).send('bad signature');
    }
    void reply.code(200).send('ok');

    const body = req.body as { event: string; payload?: Record<string, unknown> };
    // Tenant id should be in notes (we set it when creating payment links).
    const notes = (body.payload?.payment as { entity?: { notes?: { tenant_id?: string } } } | undefined)?.entity?.notes;
    const tenantId = notes?.tenant_id;
    if (!tenantId) {
      logger.warn({ event: body.event }, 'razorpay.webhook.no_tenant_in_notes');
      return;
    }

    const event: IntegrationEvent = {
      event_id: randomUUID(),
      occurred_at: new Date().toISOString(),
      tenant_id: tenantId,
      integration: 'razorpay',
      event_type: body.event,
      payload: body.payload ?? {},
    };
    try {
      await kafka.publish(KAFKA_TOPICS.INTEGRATIONS_EVENTS, event);
    } catch (err) {
      logger.error({ err }, 'razorpay.webhook.publish_failed');
    }
  });
}
