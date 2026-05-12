import { sql } from 'drizzle-orm';
import { boolean, pgSchema, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { tenants } from './core.js';

export const businessSchema = pgSchema('business');

export const businessProfiles = businessSchema.table('profiles', {
  tenant_id: uuid('tenant_id')
    .primaryKey()
    .references(() => tenants.id, { onDelete: 'cascade' }),
  legal_name: text('legal_name'),
  gstin: text('gstin'),
  pan: text('pan'),
  registered_address: text('registered_address'),
  operating_address: text('operating_address'),
  website_url: text('website_url'),
  logo_url: text('logo_url'),
  verification_status: text('verification_status').notNull().default('unverified'),
  meta_business_id: text('meta_business_id'),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const whatsappNumbers = businessSchema.table('whatsapp_numbers', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenant_id: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'cascade' }),
  phone_number: text('phone_number').notNull().unique(), // E.164
  display_name: text('display_name').notNull(),
  status: text('status').notNull().default('pending'),
  quality_rating: text('quality_rating').default('green'),
  waba_id: text('waba_id'),
  phone_number_id: text('phone_number_id'),
  is_primary: boolean('is_primary').notNull().default(true),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const twitterAccounts = businessSchema.table('twitter_accounts', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenant_id: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'cascade' }),
  twitter_handle: text('twitter_handle').notNull().unique(),
  access_token_ref: text('access_token_ref'), // pointer into Key Vault
  status: text('status').notNull().default('active'),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// Suppress unused warning so drizzle picks the schema declaration up.
export const _businessSql = sql;
