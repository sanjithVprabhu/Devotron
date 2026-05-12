import {
  jsonb,
  pgSchema,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { tenants } from './core.js';

export const templatesSchema = pgSchema('templates');

export const whatsappTemplates = templatesSchema.table(
  'whatsapp_templates',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    category: text('category').notNull(), // marketing|utility|authentication
    language: text('language').notNull().default('en'),
    status: text('status').notNull().default('pending'), // pending|approved|rejected|paused
    components: jsonb('components').notNull(),
    meta_template_id: text('meta_template_id'),
    rejection_reason: text('rejection_reason'),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantNameLanguageUnique: uniqueIndex('whatsapp_templates_tenant_name_language_unique').on(
      t.tenant_id,
      t.name,
      t.language,
    ),
  }),
);
