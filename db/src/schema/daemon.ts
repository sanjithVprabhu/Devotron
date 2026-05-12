import { sql } from 'drizzle-orm';
import {
  index,
  jsonb,
  pgSchema,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { principals, tenants } from './core.js';

export const daemonSchema = pgSchema('daemon');

export const proposals = daemonSchema.table(
  'proposals',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    proposal_type: text('proposal_type').notNull(),
    title: text('title').notNull(),
    description: text('description').notNull(),
    action: jsonb('action').notNull(),
    estimated_impact: text('estimated_impact'),
    status: text('status').notNull().default('pending'),
    reviewed_by: uuid('reviewed_by').references(() => principals.id),
    reviewed_at: timestamp('reviewed_at', { withTimezone: true }),
    executed_at: timestamp('executed_at', { withTimezone: true }),
    expires_at: timestamp('expires_at', { withTimezone: true })
      .notNull()
      .default(sql`NOW() + INTERVAL '7 days'`),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantStatusRecent: index('proposals_tenant_status_recent').on(
      t.tenant_id,
      t.status,
      t.created_at,
    ),
  }),
);
