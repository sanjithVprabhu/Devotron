import { defineConfig } from 'drizzle-kit';

if (!process.env.POSTGRES_URL) {
  throw new Error('POSTGRES_URL is required for drizzle-kit');
}

export default defineConfig({
  schema: './src/schema/index.ts',
  out: './migrations',
  dialect: 'postgresql',
  dbCredentials: { url: process.env.POSTGRES_URL },
  verbose: true,
  strict: true,
  schemaFilter: ['core', 'business', 'blueprints', 'conversations', 'commerce', 'templates', 'billing', 'daemon', 'audit', 'reputation', 'a2a'],
});
