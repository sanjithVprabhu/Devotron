import { sql } from 'drizzle-orm';
import {
  boolean,
  jsonb,
  pgSchema,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  index,
} from 'drizzle-orm/pg-core';

export const coreSchema = pgSchema('core');

export const tenants = coreSchema.table('tenants', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  status: text('status').notNull().default('pending'), // pending|active|suspended|churned
  tier: text('tier').notNull().default('free'), // free|starter|growth|pro|enterprise
  vertical: text('vertical').notNull().default('generic'),
  country_code: text('country_code').notNull().default('IN'),
  currency_code: text('currency_code').notNull().default('INR'),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  metadata: jsonb('metadata').notNull().default(sql`'{}'::jsonb`),
});

export const principals = coreSchema.table('principals', {
  id: uuid('id').primaryKey().defaultRandom(),
  display_name: text('display_name'),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  metadata: jsonb('metadata').notNull().default(sql`'{}'::jsonb`),
});

export const identifiers = coreSchema.table(
  'identifiers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    principal_id: uuid('principal_id').notNull().references(() => principals.id, { onDelete: 'cascade' }),
    channel: text('channel').notNull(), // whatsapp|twitter|telegram|instagram|email|internal
    identifier: text('identifier').notNull(),
    verified: boolean('verified').notNull().default(false),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    channelIdentifierUnique: uniqueIndex('identifiers_channel_identifier_unique').on(t.channel, t.identifier),
    lookup: index('identifiers_lookup').on(t.channel, t.identifier),
  }),
);

export const linkingCodes = coreSchema.table('linking_codes', {
  code: text('code').primaryKey(),
  principal_id: uuid('principal_id').notNull().references(() => principals.id, { onDelete: 'cascade' }),
  source_channel: text('source_channel').notNull(),
  expires_at: timestamp('expires_at', { withTimezone: true }).notNull(),
  used_at: timestamp('used_at', { withTimezone: true }),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const tenantMemberships = coreSchema.table(
  'tenant_memberships',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    principal_id: uuid('principal_id').notNull().references(() => principals.id, { onDelete: 'cascade' }),
    role: text('role').notNull(), // owner|admin|operator|viewer
    permissions: jsonb('permissions').notNull().default(sql`'[]'::jsonb`),
    invited_by: uuid('invited_by').references(() => principals.id),
    joined_at: timestamp('joined_at', { withTimezone: true }),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantPrincipalUnique: uniqueIndex('tenant_memberships_tenant_principal_unique').on(t.tenant_id, t.principal_id),
  }),
);

export const teamInvites = coreSchema.table('team_invites', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenant_id: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  invited_by: uuid('invited_by').notNull().references(() => principals.id),
  phone_number: text('phone_number'),
  email: text('email'),
  role: text('role').notNull(),
  status: text('status').notNull().default('pending'),
  expires_at: timestamp('expires_at', { withTimezone: true })
    .notNull()
    .default(sql`NOW() + INTERVAL '7 days'`),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
