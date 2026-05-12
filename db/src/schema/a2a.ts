import { sql } from 'drizzle-orm';
import { boolean, jsonb, pgSchema, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { tenants } from './core.js';

// V2 hooks: tables exist so migrations are stable, but no producers in v1.
export const a2aSchema = pgSchema('a2a');

export const a2aThreads = a2aSchema.table('threads', {
  id: uuid('id').primaryKey().defaultRandom(),
  initiator_tenant_id: uuid('initiator_tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'cascade' }),
  counterparty_tenant_id: uuid('counterparty_tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'cascade' }),
  category: text('category').notNull(),
  status: text('status').notNull().default('open'),
  metadata: jsonb('metadata').notNull().default(sql`'{}'::jsonb`),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const a2aMessages = a2aSchema.table('messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  thread_id: uuid('thread_id')
    .notNull()
    .references(() => a2aThreads.id, { onDelete: 'cascade' }),
  from_tenant_id: uuid('from_tenant_id').notNull(),
  to_tenant_id: uuid('to_tenant_id').notNull(),
  message_type: text('message_type').notNull(),
  payload: jsonb('payload').notNull(),
  requires_human_approval: boolean('requires_human_approval').notNull().default(true),
  approved_by: uuid('approved_by'),
  approved_at: timestamp('approved_at', { withTimezone: true }),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
