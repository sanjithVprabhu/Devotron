import {
  index,
  integer,
  pgSchema,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { principals, tenants } from './core.js';

export const conversationsSchema = pgSchema('conversations');

export const conversationThreads = conversationsSchema.table(
  'threads',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    principal_id: uuid('principal_id')
      .notNull()
      .references(() => principals.id, { onDelete: 'cascade' }),
    channel: text('channel').notNull(),
    channel_thread_id: text('channel_thread_id'),
    agent_type: text('agent_type').notNull(), // veda|business
    status: text('status').notNull().default('active'),
    escalated_to: uuid('escalated_to').references(() => principals.id),
    window_expires_at: timestamp('window_expires_at', { withTimezone: true }),
    message_count: integer('message_count').notNull().default(0),
    last_message_at: timestamp('last_message_at', { withTimezone: true }),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantStatusRecent: index('threads_tenant_status_recent').on(
      t.tenant_id,
      t.status,
      t.last_message_at,
    ),
    principalLookup: index('threads_principal_lookup').on(t.principal_id, t.tenant_id),
  }),
);

export const escalations = conversationsSchema.table('escalations', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenant_id: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'cascade' }),
  thread_id: uuid('thread_id')
    .notNull()
    .references(() => conversationThreads.id, { onDelete: 'cascade' }),
  reason: text('reason').notNull(),
  assigned_to: uuid('assigned_to').references(() => principals.id),
  resolved_at: timestamp('resolved_at', { withTimezone: true }),
  resolution_note: text('resolution_note'),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
