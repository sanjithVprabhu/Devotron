import { boolean, pgSchema, smallint, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { conversationThreads } from './conversations.js';
import { orders } from './commerce.js';
import { principals, tenants } from './core.js';

export const reputationSchema = pgSchema('reputation');

// Collected silently in v1; display gated on V2 flag.
export const reviews = reputationSchema.table('reviews', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenant_id: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'cascade' }),
  reviewer_principal_id: uuid('reviewer_principal_id')
    .notNull()
    .references(() => principals.id),
  thread_id: uuid('thread_id').references(() => conversationThreads.id),
  order_id: uuid('order_id').references(() => orders.id),
  rating: smallint('rating'),
  tags: text('tags').array(),
  collected_at: timestamp('collected_at', { withTimezone: true }).notNull().defaultNow(),
  is_displayed: boolean('is_displayed').notNull().default(false),
});
