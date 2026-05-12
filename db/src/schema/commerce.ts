import { sql } from 'drizzle-orm';
import {
  bigint,
  index,
  jsonb,
  pgSchema,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { conversationThreads } from './conversations.js';
import { principals, tenants } from './core.js';

export const commerceSchema = pgSchema('commerce');

export const orders = commerceSchema.table(
  'orders',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    principal_id: uuid('principal_id')
      .notNull()
      .references(() => principals.id),
    thread_id: uuid('thread_id').references(() => conversationThreads.id),
    order_number: text('order_number').notNull(),
    status: text('status').notNull().default('created'),
    line_items: jsonb('line_items').notNull().default(sql`'[]'::jsonb`),
    subtotal_paise: bigint('subtotal_paise', { mode: 'number' }).notNull().default(0),
    tax_paise: bigint('tax_paise', { mode: 'number' }).notNull().default(0),
    delivery_paise: bigint('delivery_paise', { mode: 'number' }).notNull().default(0),
    discount_paise: bigint('discount_paise', { mode: 'number' }).notNull().default(0),
    total_paise: bigint('total_paise', { mode: 'number' }).notNull().default(0),
    currency: text('currency').notNull().default('INR'),
    payment_method: text('payment_method'),
    payment_ref: text('payment_ref'),
    delivery_address: jsonb('delivery_address'),
    notes: text('notes'),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantStatusRecent: index('orders_tenant_status_recent').on(t.tenant_id, t.status, t.created_at),
    principalLookup: index('orders_principal_lookup').on(t.tenant_id, t.principal_id),
  }),
);
