import type { FastifyInstance } from 'fastify';

export async function registerHealthRoutes(app: FastifyInstance): Promise<void> {
  app.get('/healthz', async () => ({ status: 'ok' }));

  app.get('/readyz', async (_, reply) => {
    // TODO: probe Postgres, Redis, Kafka. Keep cheap for AKS readiness checks.
    return reply.send({ status: 'ready' });
  });
}
