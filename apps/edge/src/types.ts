// Fastify request extension. Importing this file is enough to merge the
// declaration globally; no value imports are needed.

import 'fastify';

declare module 'fastify' {
  interface FastifyRequest {
    rawBody?: Buffer;
  }
}
