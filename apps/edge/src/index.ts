// Edge service entrypoint. Runs the webhook receivers and the outbound sender
// in a single Fastify process. Splittable later (separate deployments) without changing
// the surface — the sender consumer can run as its own process by removing the call to
// startSender() here and starting it from a sibling app.

import Fastify from 'fastify';
import helmet from '@fastify/helmet';
import cors from '@fastify/cors';
import sensible from '@fastify/sensible';
import { VedaKafka, buildKafkaConfigFromEnv } from '@veda/kafka-client';
import { config } from './config.js';
import { logger } from './logger.js';
import { registerHealthRoutes } from './routes/health.js';
import { registerWhatsAppWebhook } from './routes/webhooks-whatsapp.js';
import { registerAiSensyWebhook } from './routes/webhooks-aisensy.js';
import { registerTwitterWebhook } from './routes/webhooks-twitter.js';
import { registerRazorpayWebhook } from './routes/webhooks-razorpay.js';
import { startSender } from './sender/sender.js';

async function main() {
  const app = Fastify({
    logger: false,
    bodyLimit: 5_242_880, // 5 MB
    trustProxy: true,
  });

  await app.register(helmet);
  await app.register(cors, { origin: false });
  await app.register(sensible);

  const kafka = new VedaKafka(buildKafkaConfigFromEnv(config.KAFKA_CLIENT_ID));

  await registerHealthRoutes(app);
  await registerWhatsAppWebhook(app, kafka);   // Meta direct webhook (post-pilot)
  await registerAiSensyWebhook(app, kafka);    // AiSensy webhook (pilot)
  await registerTwitterWebhook(app, kafka);
  await registerRazorpayWebhook(app, kafka);

  // Start the outbound sender in-process.
  if (process.env.EDGE_DISABLE_SENDER !== '1') {
    void startSender(kafka).catch((err) => {
      logger.error({ err }, 'sender.crashed');
      process.exit(1);
    });
  }

  const shutdown = async () => {
    logger.info('shutdown.start');
    try {
      await app.close();
      await kafka.disconnect();
    } finally {
      process.exit(0);
    }
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  await app.listen({ port: config.PORT, host: '0.0.0.0' });
  logger.info({ port: config.PORT }, 'edge.listening');
}

main().catch((err) => {
  logger.error({ err }, 'edge.bootstrap_failed');
  process.exit(1);
});
