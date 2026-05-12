-- VEDA — initial schema migration
-- Hand-authored to match spec/05_DATA_MODEL.md exactly. Future schema changes go through
-- drizzle-kit generate; this baseline is intentionally explicit.

-- ── EXTENSIONS ──────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── SCHEMAS ─────────────────────────────────────────────────────────────
CREATE SCHEMA IF NOT EXISTS core;
CREATE SCHEMA IF NOT EXISTS business;
CREATE SCHEMA IF NOT EXISTS blueprints;
CREATE SCHEMA IF NOT EXISTS conversations;
CREATE SCHEMA IF NOT EXISTS commerce;
CREATE SCHEMA IF NOT EXISTS templates;
CREATE SCHEMA IF NOT EXISTS billing;
CREATE SCHEMA IF NOT EXISTS daemon;
CREATE SCHEMA IF NOT EXISTS audit;
CREATE SCHEMA IF NOT EXISTS reputation;
CREATE SCHEMA IF NOT EXISTS a2a;

-- ── core ────────────────────────────────────────────────────────────────
CREATE TABLE core.tenants (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  slug            TEXT UNIQUE NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','active','suspended','churned')),
  tier            TEXT NOT NULL DEFAULT 'free'
    CHECK (tier IN ('free','starter','growth','pro','enterprise')),
  vertical        TEXT NOT NULL DEFAULT 'generic',
  country_code    TEXT NOT NULL DEFAULT 'IN',
  currency_code   TEXT NOT NULL DEFAULT 'INR',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata        JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE core.principals (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  display_name    TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata        JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE core.identifiers (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  principal_id    UUID NOT NULL REFERENCES core.principals(id) ON DELETE CASCADE,
  channel         TEXT NOT NULL CHECK (channel IN ('whatsapp','twitter','telegram','instagram','email','internal')),
  identifier      TEXT NOT NULL,
  verified        BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (channel, identifier)
);
CREATE INDEX idx_identifiers_lookup ON core.identifiers (channel, identifier);

CREATE TABLE core.linking_codes (
  code            TEXT PRIMARY KEY,
  principal_id    UUID NOT NULL REFERENCES core.principals(id) ON DELETE CASCADE,
  source_channel  TEXT NOT NULL,
  expires_at      TIMESTAMPTZ NOT NULL,
  used_at         TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE core.tenant_memberships (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES core.tenants(id) ON DELETE CASCADE,
  principal_id    UUID NOT NULL REFERENCES core.principals(id) ON DELETE CASCADE,
  role            TEXT NOT NULL CHECK (role IN ('owner','admin','operator','viewer')),
  permissions     JSONB NOT NULL DEFAULT '[]'::jsonb,
  invited_by      UUID REFERENCES core.principals(id),
  joined_at       TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, principal_id)
);
ALTER TABLE core.tenant_memberships ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON core.tenant_memberships
  USING (tenant_id::text = current_setting('app.tenant_id', TRUE));

CREATE TABLE core.team_invites (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES core.tenants(id) ON DELETE CASCADE,
  invited_by      UUID NOT NULL REFERENCES core.principals(id),
  phone_number    TEXT,
  email           TEXT,
  role            TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','accepted','expired','revoked')),
  expires_at      TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '7 days',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── business ────────────────────────────────────────────────────────────
CREATE TABLE business.profiles (
  tenant_id           UUID PRIMARY KEY REFERENCES core.tenants(id) ON DELETE CASCADE,
  legal_name          TEXT,
  gstin               TEXT,
  pan                 TEXT,
  registered_address  TEXT,
  operating_address   TEXT,
  website_url         TEXT,
  logo_url            TEXT,
  verification_status TEXT NOT NULL DEFAULT 'unverified'
    CHECK (verification_status IN ('unverified','pending','verified','rejected')),
  meta_business_id    TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE business.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON business.profiles
  USING (tenant_id::text = current_setting('app.tenant_id', TRUE));

CREATE TABLE business.whatsapp_numbers (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES core.tenants(id) ON DELETE CASCADE,
  phone_number        TEXT NOT NULL UNIQUE,
  display_name        TEXT NOT NULL,
  status              TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','active','restricted','banned')),
  quality_rating      TEXT DEFAULT 'green'
    CHECK (quality_rating IN ('green','yellow','red')),
  waba_id             TEXT,
  phone_number_id     TEXT,
  is_primary          BOOLEAN NOT NULL DEFAULT TRUE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE business.whatsapp_numbers ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON business.whatsapp_numbers
  USING (tenant_id::text = current_setting('app.tenant_id', TRUE));

CREATE TABLE business.twitter_accounts (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES core.tenants(id) ON DELETE CASCADE,
  twitter_handle      TEXT NOT NULL UNIQUE,
  access_token_ref    TEXT,
  status              TEXT NOT NULL DEFAULT 'active',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE business.twitter_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON business.twitter_accounts
  USING (tenant_id::text = current_setting('app.tenant_id', TRUE));

-- ── blueprints ──────────────────────────────────────────────────────────
CREATE TABLE blueprints.versions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES core.tenants(id) ON DELETE CASCADE,
  version         INTEGER NOT NULL,
  is_current      BOOLEAN NOT NULL DEFAULT FALSE,
  content         JSONB NOT NULL,
  diff            JSONB,
  mutated_by      UUID REFERENCES core.principals(id),
  mutation_source TEXT CHECK (mutation_source IN ('veda','dashboard','api','migration')),
  mutation_reason TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, version)
);
CREATE INDEX idx_blueprints_current ON blueprints.versions (tenant_id, is_current) WHERE is_current = TRUE;
ALTER TABLE blueprints.versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON blueprints.versions
  USING (tenant_id::text = current_setting('app.tenant_id', TRUE));

CREATE TABLE blueprints.drafts (
  tenant_id       UUID PRIMARY KEY REFERENCES core.tenants(id) ON DELETE CASCADE,
  content         JSONB NOT NULL DEFAULT '{}'::jsonb,
  completion_pct  INTEGER NOT NULL DEFAULT 0,
  last_step       TEXT,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE blueprints.drafts ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON blueprints.drafts
  USING (tenant_id::text = current_setting('app.tenant_id', TRUE));

-- ── conversations ───────────────────────────────────────────────────────
CREATE TABLE conversations.threads (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES core.tenants(id) ON DELETE CASCADE,
  principal_id        UUID NOT NULL REFERENCES core.principals(id) ON DELETE CASCADE,
  channel             TEXT NOT NULL,
  channel_thread_id   TEXT,
  agent_type          TEXT NOT NULL CHECK (agent_type IN ('veda','business')),
  status              TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','escalated','resolved','abandoned')),
  escalated_to        UUID REFERENCES core.principals(id),
  window_expires_at   TIMESTAMPTZ,
  message_count       INTEGER NOT NULL DEFAULT 0,
  last_message_at     TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_conversations_tenant ON conversations.threads (tenant_id, status, last_message_at DESC);
CREATE INDEX idx_conversations_principal ON conversations.threads (principal_id, tenant_id);
ALTER TABLE conversations.threads ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON conversations.threads
  USING (tenant_id::text = current_setting('app.tenant_id', TRUE));

CREATE TABLE conversations.escalations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES core.tenants(id) ON DELETE CASCADE,
  thread_id       UUID NOT NULL REFERENCES conversations.threads(id) ON DELETE CASCADE,
  reason          TEXT NOT NULL,
  assigned_to     UUID REFERENCES core.principals(id),
  resolved_at     TIMESTAMPTZ,
  resolution_note TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE conversations.escalations ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON conversations.escalations
  USING (tenant_id::text = current_setting('app.tenant_id', TRUE));

-- ── commerce ────────────────────────────────────────────────────────────
CREATE TABLE commerce.orders (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES core.tenants(id) ON DELETE CASCADE,
  principal_id      UUID NOT NULL REFERENCES core.principals(id),
  thread_id         UUID REFERENCES conversations.threads(id),
  order_number      TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'created'
    CHECK (status IN ('created','confirmed','paid','fulfilled','closed','cancelled','refunded')),
  line_items        JSONB NOT NULL DEFAULT '[]'::jsonb,
  subtotal_paise    BIGINT NOT NULL DEFAULT 0,
  tax_paise         BIGINT NOT NULL DEFAULT 0,
  delivery_paise    BIGINT NOT NULL DEFAULT 0,
  discount_paise    BIGINT NOT NULL DEFAULT 0,
  total_paise       BIGINT NOT NULL DEFAULT 0,
  currency          TEXT NOT NULL DEFAULT 'INR',
  payment_method    TEXT,
  payment_ref       TEXT,
  delivery_address  JSONB,
  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_orders_tenant ON commerce.orders (tenant_id, status, created_at DESC);
CREATE INDEX idx_orders_principal ON commerce.orders (tenant_id, principal_id);
ALTER TABLE commerce.orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON commerce.orders
  USING (tenant_id::text = current_setting('app.tenant_id', TRUE));

-- ── templates ───────────────────────────────────────────────────────────
CREATE TABLE templates.whatsapp_templates (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES core.tenants(id) ON DELETE CASCADE,
  name              TEXT NOT NULL,
  category          TEXT NOT NULL CHECK (category IN ('marketing','utility','authentication')),
  language          TEXT NOT NULL DEFAULT 'en',
  status            TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','approved','rejected','paused')),
  components        JSONB NOT NULL,
  meta_template_id  TEXT,
  rejection_reason  TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, name, language)
);
ALTER TABLE templates.whatsapp_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON templates.whatsapp_templates
  USING (tenant_id::text = current_setting('app.tenant_id', TRUE));

-- ── billing ─────────────────────────────────────────────────────────────
CREATE TABLE billing.subscriptions (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                 UUID NOT NULL UNIQUE REFERENCES core.tenants(id) ON DELETE CASCADE,
  tier                      TEXT NOT NULL,
  status                    TEXT NOT NULL DEFAULT 'active',
  current_period_start      TIMESTAMPTZ NOT NULL,
  current_period_end        TIMESTAMPTZ NOT NULL,
  razorpay_subscription_id  TEXT,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE billing.llm_usage_daily (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES core.tenants(id) ON DELETE CASCADE,
  date            DATE NOT NULL,
  provider        TEXT NOT NULL,
  model           TEXT NOT NULL,
  input_tokens    BIGINT NOT NULL DEFAULT 0,
  output_tokens   BIGINT NOT NULL DEFAULT 0,
  cached_tokens   BIGINT NOT NULL DEFAULT 0,
  cost_paise      BIGINT NOT NULL DEFAULT 0,
  call_count      INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, date, provider, model)
);
CREATE INDEX idx_llm_usage_tenant_date ON billing.llm_usage_daily (tenant_id, date DESC);

CREATE TABLE billing.daemon_budgets (
  tenant_id       UUID NOT NULL REFERENCES core.tenants(id) ON DELETE CASCADE,
  date            DATE NOT NULL,
  budget_paise    BIGINT NOT NULL,
  used_paise      BIGINT NOT NULL DEFAULT 0,
  PRIMARY KEY (tenant_id, date)
);

-- ── daemon ──────────────────────────────────────────────────────────────
CREATE TABLE daemon.proposals (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES core.tenants(id) ON DELETE CASCADE,
  proposal_type     TEXT NOT NULL
    CHECK (proposal_type IN ('reengagement','faq_update','catalog_gap','conversation_review','broadcast')),
  title             TEXT NOT NULL,
  description       TEXT NOT NULL,
  action            JSONB NOT NULL,
  estimated_impact  TEXT,
  status            TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','approved','rejected','executed','expired')),
  reviewed_by       UUID REFERENCES core.principals(id),
  reviewed_at       TIMESTAMPTZ,
  executed_at       TIMESTAMPTZ,
  expires_at        TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '7 days',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_proposals_tenant ON daemon.proposals (tenant_id, status, created_at DESC);
ALTER TABLE daemon.proposals ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON daemon.proposals
  USING (tenant_id::text = current_setting('app.tenant_id', TRUE));

-- ── audit ───────────────────────────────────────────────────────────────
-- Append-only, no RLS (compliance requirement). Range-partitioned monthly.
CREATE TABLE audit.events (
  id              UUID NOT NULL DEFAULT gen_random_uuid(),
  tenant_id       UUID,
  principal_id    UUID,
  event_type      TEXT NOT NULL,
  entity_type     TEXT,
  entity_id       UUID,
  payload         JSONB NOT NULL DEFAULT '{}'::jsonb,
  ip_address      INET,
  user_agent      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

-- Default partition for current + future months. Ops creates monthly partitions later.
CREATE TABLE audit.events_default PARTITION OF audit.events DEFAULT;
CREATE INDEX idx_audit_tenant ON audit.events (tenant_id, created_at DESC);
CREATE INDEX idx_audit_event_type ON audit.events (event_type, created_at DESC);

-- ── reputation (V2 hooks) ───────────────────────────────────────────────
CREATE TABLE reputation.reviews (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID NOT NULL REFERENCES core.tenants(id) ON DELETE CASCADE,
  reviewer_principal_id UUID NOT NULL REFERENCES core.principals(id),
  thread_id             UUID REFERENCES conversations.threads(id),
  order_id              UUID REFERENCES commerce.orders(id),
  rating                SMALLINT CHECK (rating BETWEEN 1 AND 5),
  tags                  TEXT[],
  collected_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_displayed          BOOLEAN NOT NULL DEFAULT FALSE
);
ALTER TABLE reputation.reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON reputation.reviews
  USING (tenant_id::text = current_setting('app.tenant_id', TRUE));

-- ── a2a (V2 hooks; no producers in v1) ──────────────────────────────────
CREATE TABLE a2a.threads (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  initiator_tenant_id     UUID NOT NULL REFERENCES core.tenants(id) ON DELETE CASCADE,
  counterparty_tenant_id  UUID NOT NULL REFERENCES core.tenants(id) ON DELETE CASCADE,
  category                TEXT NOT NULL,
  status                  TEXT NOT NULL DEFAULT 'open',
  metadata                JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE a2a.messages (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id                UUID NOT NULL REFERENCES a2a.threads(id) ON DELETE CASCADE,
  from_tenant_id           UUID NOT NULL,
  to_tenant_id             UUID NOT NULL,
  message_type             TEXT NOT NULL,
  payload                  JSONB NOT NULL,
  requires_human_approval  BOOLEAN NOT NULL DEFAULT TRUE,
  approved_by              UUID,
  approved_at              TIMESTAMPTZ,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── triggers: auto-update updated_at ────────────────────────────────────
CREATE OR REPLACE FUNCTION public.tg_touch_updated_at() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT n.nspname AS schema, c.relname AS table
    FROM pg_class c JOIN pg_namespace n ON c.relnamespace = n.oid
    WHERE n.nspname IN ('core','business','blueprints','conversations','commerce','templates','billing','daemon','a2a')
      AND c.relkind = 'r'
      AND EXISTS (
        SELECT 1 FROM pg_attribute a
        WHERE a.attrelid = c.oid AND a.attname = 'updated_at' AND NOT a.attisdropped
      )
  LOOP
    EXECUTE format(
      'CREATE TRIGGER tg_touch_updated_at BEFORE UPDATE ON %I.%I FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at()',
      r.schema, r.table
    );
  END LOOP;
END $$;
