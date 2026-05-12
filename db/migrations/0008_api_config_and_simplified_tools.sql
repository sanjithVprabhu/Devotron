-- 0008 — Refactor of 0007 dynamic-tool registry.
--
-- Per architectural feedback: base URL + auth belong at the TENANT level,
-- not on every tool. Each tenant connects ONE upstream API, then registers
-- many endpoints (paths) off that base.
--
-- Changes:
-- 1. New table `business.api_config` — one row per tenant; the "API connection".
--    Holds base_url (lock-once), encrypted machine token, acting-user header.
-- 2. Reshape `business.api_tools`:
--    - REMOVE: url_template, auth_*, pass_acting_user, acting_user_header
--    - ADD: path (relative, e.g. "/jobs/{id}")
--    - The dispatcher joins api_config.base_url + tool.path at call time.
--
-- The 0007 table had no rows yet (migration just applied), so we drop & recreate.

-- ── New: tenant-level API connection ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS business.api_config (
  tenant_id              UUID PRIMARY KEY REFERENCES core.tenants(id) ON DELETE CASCADE,

  -- The locked upstream API. Once set + locked, mutating requires explicit unlock
  -- (an audit-visible action). Prevents accidental redirect to a malicious host.
  base_url               TEXT NOT NULL,             -- "https://api.develup.com" (no trailing slash)
  base_url_locked        BOOLEAN NOT NULL DEFAULT FALSE,
  base_url_locked_at     TIMESTAMPTZ,
  base_url_locked_by     UUID REFERENCES core.principals(id),

  -- Shared auth for all endpoints under this base.
  auth_type              TEXT NOT NULL DEFAULT 'bearer'
    CHECK (auth_type IN ('none', 'bearer', 'api_key_header', 'basic')),
  auth_secret_enc        TEXT,                      -- encrypted bearer/key
  auth_header_name       TEXT,                      -- for api_key_header (e.g. 'X-API-Key')

  -- Acting-user injection (Option A). Default ON: every registered endpoint
  -- gets X-Acting-User-Id = <principal_id> per call. Owner can opt out per tool.
  pass_acting_user_default BOOLEAN NOT NULL DEFAULT TRUE,
  acting_user_header     TEXT NOT NULL DEFAULT 'X-Acting-User-Id',

  -- Optional health check — UI hits this once after connect to verify creds.
  health_check_path      TEXT,                      -- e.g. "/health"
  last_healthcheck_at    TIMESTAMPTZ,
  last_healthcheck_ok    BOOLEAN,

  notes                  TEXT,                      -- "DevelUp's job portal REST API, Node backend"
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE business.api_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON business.api_config;
CREATE POLICY tenant_isolation ON business.api_config
  USING (tenant_id::text = current_setting('app.tenant_id', TRUE));

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'tg_api_config_touch') THEN
    CREATE TRIGGER tg_api_config_touch BEFORE UPDATE ON business.api_config
      FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();
  END IF;
END $$;

-- ── Reshape api_tools ───────────────────────────────────────────────────
-- 0007 just shipped; no production rows. Safe to drop + recreate.
DROP TABLE IF EXISTS business.api_tools CASCADE;

CREATE TABLE business.api_tools (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID NOT NULL REFERENCES core.tenants(id) ON DELETE CASCADE,

  -- Identity
  name                  TEXT NOT NULL,           -- 'develup.jobs.search' (dotted, agent-callable)
  display_name          TEXT NOT NULL,           -- 'Search jobs on DevelUp'
  description           TEXT NOT NULL,           -- LLM-readable: what it does, when to use

  -- HTTP — path is RELATIVE to api_config.base_url. Use {placeholders} for path/query vars.
  http_method           TEXT NOT NULL CHECK (http_method IN ('GET','POST','PUT','PATCH','DELETE')),
  path                  TEXT NOT NULL,           -- '/jobs?q={query}&loc={location}'  or '/applications'
  static_headers        JSONB NOT NULL DEFAULT '{}'::jsonb,
  body_template         TEXT,                    -- POST/PUT/PATCH body with {{var}} substitution

  -- Override the tenant-level acting-user default for this specific endpoint.
  -- NULL → use api_config.pass_acting_user_default. TRUE/FALSE → override.
  pass_acting_user_override  BOOLEAN,

  -- Schema
  input_schema          JSONB NOT NULL,          -- JSON-schema for args the agent passes
  output_shape_hint     TEXT,

  -- Sandbox-captured
  sample_request        JSONB,
  sample_response       JSONB,
  last_tested_at        TIMESTAMPTZ,
  last_test_status      TEXT,

  -- Risk + lifecycle
  side_effect           BOOLEAN NOT NULL DEFAULT FALSE,
  risk_override         TEXT CHECK (risk_override IN ('low','medium','high')),
  status                TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','active','disabled')),
  rate_limit_per_minute INT NOT NULL DEFAULT 60,

  -- Audit
  created_by_principal_id  UUID REFERENCES core.principals(id),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (tenant_id, name)
);

CREATE INDEX IF NOT EXISTS idx_api_tools_tenant_status
  ON business.api_tools (tenant_id, status)
  WHERE status = 'active';

ALTER TABLE business.api_tools ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON business.api_tools;
CREATE POLICY tenant_isolation ON business.api_tools
  USING (tenant_id::text = current_setting('app.tenant_id', TRUE));

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'tg_api_tools_touch') THEN
    CREATE TRIGGER tg_api_tools_touch BEFORE UPDATE ON business.api_tools
      FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();
  END IF;
END $$;

INSERT INTO meta.schema_migrations (version, notes)
VALUES ('0008_api_config_and_simplified_tools', 'split api_config (tenant-level) from api_tools (per-endpoint)')
ON CONFLICT (version) DO NOTHING;
