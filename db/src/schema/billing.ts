import {
  bigint,
  date,
  index,
  integer,
  pgSchema,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { tenants } from './core.js';

export const billingSchema = pgSchema('billing');

export const subscriptions = billingSchema.table('subscriptions', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenant_id: uuid('tenant_id')
    .notNull()
    .unique()
    .references(() => tenants.id, { onDelete: 'cascade' }),
  tier: text('tier').notNull(),
  status: text('status').notNull().default('active'),
  current_period_start: timestamp('current_period_start', { withTimezone: true }).notNull(),
  current_period_end: timestamp('current_period_end', { withTimezone: true }).notNull(),
  razorpay_subscription_id: text('razorpay_subscription_id'),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const llmUsageDaily = billingSchema.table(
  'llm_usage_daily',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    date: date('date').notNull(),
    provider: text('provider').notNull(),
    model: text('model').notNull(),
    input_tokens: bigint('input_tokens', { mode: 'number' }).notNull().default(0),
    output_tokens: bigint('output_tokens', { mode: 'number' }).notNull().default(0),
    cached_tokens: bigint('cached_tokens', { mode: 'number' }).notNull().default(0),
    cost_paise: bigint('cost_paise', { mode: 'number' }).notNull().default(0),
    call_count: integer('call_count').notNull().default(0),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    rollupUnique: uniqueIndex('llm_usage_rollup_unique').on(t.tenant_id, t.date, t.provider, t.model),
    tenantDateLookup: index('llm_usage_tenant_date').on(t.tenant_id, t.date),
  }),
);

export const daemonBudgets = billingSchema.table(
  'daemon_budgets',
  {
    tenant_id: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    date: date('date').notNull(),
    budget_paise: bigint('budget_paise', { mode: 'number' }).notNull(),
    used_paise: bigint('used_paise', { mode: 'number' }).notNull().default(0),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.tenant_id, t.date] }),
  }),
);
