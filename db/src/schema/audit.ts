import { sql } from 'drizzle-orm';
import { index, jsonb, pgSchema, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const auditSchema = pgSchema('audit');

// NOTE: in production this is RANGE-partitioned by created_at (monthly).
// We declare it as a regular table here; the migration ALTERs it to PARTITION BY.
export const auditEvents = auditSchema.table(
  'events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id'),
    principal_id: uuid('principal_id'),
    event_type: text('event_type').notNull(),
    entity_type: text('entity_type'),
    entity_id: uuid('entity_id'),
    payload: jsonb('payload').notNull().default(sql`'{}'::jsonb`),
    ip_address: text('ip_address'),
    user_agent: text('user_agent'),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantRecent: index('audit_tenant_recent').on(t.tenant_id, t.created_at),
    eventTypeRecent: index('audit_event_type_recent').on(t.event_type, t.created_at),
  }),
);
