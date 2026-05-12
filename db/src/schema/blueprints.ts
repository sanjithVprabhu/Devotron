import { sql } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  jsonb,
  pgSchema,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { principals, tenants } from './core.js';

export const blueprintsSchema = pgSchema('blueprints');

export const blueprintVersions = blueprintsSchema.table(
  'versions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    is_current: boolean('is_current').notNull().default(false),
    content: jsonb('content').notNull(),
    diff: jsonb('diff'),
    mutated_by: uuid('mutated_by').references(() => principals.id),
    mutation_source: text('mutation_source'),
    mutation_reason: text('mutation_reason'),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantVersionUnique: uniqueIndex('blueprints_tenant_version_unique').on(t.tenant_id, t.version),
    currentLookup: index('blueprints_current_lookup')
      .on(t.tenant_id, t.is_current)
      .where(sql`${t.is_current} = true`),
  }),
);

export const blueprintDrafts = blueprintsSchema.table('drafts', {
  tenant_id: uuid('tenant_id')
    .primaryKey()
    .references(() => tenants.id, { onDelete: 'cascade' }),
  content: jsonb('content').notNull().default(sql`'{}'::jsonb`),
  completion_pct: integer('completion_pct').notNull().default(0),
  last_step: text('last_step'),
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
