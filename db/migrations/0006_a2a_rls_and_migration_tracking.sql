-- 0006 — Two defensive fixes from the architectural audit:
--
-- 1. Add RLS to a2a.threads / a2a.messages / a2a.agent_registry. These tables
--    are tenant-scoped but were never RLS-protected (the a2a feature was
--    skeletal in 0001_init). Application-layer scoping is fine but RLS is a
--    safety net.
--
--    a2a tables are unusual because they have TWO tenant ids per row (initiator
--    + counterparty). The owner of a row is the initiator. The counterparty
--    should also be able to read inbound messages addressed to them. We model
--    this with a USING clause that allows either side to read.
--
-- 2. Introduce a `meta.schema_migrations` table so future migrations can be
--    tracked (idempotency). The existing 0001-0005 are recorded as already-
--    applied so re-running is a no-op.

CREATE SCHEMA IF NOT EXISTS meta;

CREATE TABLE IF NOT EXISTS meta.schema_migrations (
  version       TEXT PRIMARY KEY,
  applied_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  applied_by    TEXT,
  notes         TEXT
);

-- Backfill the existing migrations as applied (idempotent — only inserts new rows).
INSERT INTO meta.schema_migrations (version, notes) VALUES
  ('0001_init',                          'initial schema'),
  ('0002_aisensy',                       'aisensy whatsapp creds'),
  ('0003_aisensy_campaign',              'aisensy campaign-tier creds'),
  ('0004_phase2_geo_and_a2a_registry',   'geo + a2a registry'),
  ('0005_payment_credentials',           'per-tenant payment creds'),
  ('0006_a2a_rls_and_migration_tracking', 'this migration')
ON CONFLICT (version) DO NOTHING;

-- ── A2A RLS ─────────────────────────────────────────────────────────────
-- a2a.threads — both initiator and counterparty can see their own rows.
ALTER TABLE a2a.threads ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON a2a.threads;
CREATE POLICY tenant_isolation ON a2a.threads
  USING (
    initiator_tenant_id::text = current_setting('app.tenant_id', TRUE)
    OR counterparty_tenant_id::text = current_setting('app.tenant_id', TRUE)
  );

-- a2a.messages — same: either party can read messages on their thread.
ALTER TABLE a2a.messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON a2a.messages;
CREATE POLICY tenant_isolation ON a2a.messages
  USING (
    from_tenant_id::text = current_setting('app.tenant_id', TRUE)
    OR to_tenant_id::text = current_setting('app.tenant_id', TRUE)
  );

-- a2a.agent_registry — single-tenant rows (one row per tenant).
ALTER TABLE a2a.agent_registry ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON a2a.agent_registry;
-- Exception: the public registry needs to be readable by ANYONE looking up
-- another agent. We split read vs write.
CREATE POLICY tenant_self_full ON a2a.agent_registry
  USING (tenant_id::text = current_setting('app.tenant_id', TRUE));
-- Public read of opted-in entries (no app.tenant_id required).
CREATE POLICY public_read_listed ON a2a.agent_registry
  FOR SELECT
  USING (is_listed_publicly = TRUE);
