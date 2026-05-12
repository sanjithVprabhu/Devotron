-- 0007 — Dynamic API tool registry.
--
-- The capability registry currently has hardcoded Python tools (catalog.search,
-- payment.razorpay.create_link, etc.). This migration adds a sibling pattern:
-- tools that are REGISTERED VIA UI rather than written in code. Each row here
-- becomes a callable tool the agent can use at runtime.
--
-- Naming convention: dotted names like 'develup.jobs.search', namespaced by
-- vertical/integration. The first segment is the tenant's chosen prefix.
--
-- Auth secrets are AES-256-GCM-encrypted (same scheme as
-- business.payment_credentials, business.whatsapp_numbers, etc.).
--
-- RLS-scoped to the owning tenant. Public read NOT allowed — tools may contain
-- API keys or internal endpoints.

CREATE TABLE IF NOT EXISTS business.api_tools (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID NOT NULL REFERENCES core.tenants(id) ON DELETE CASCADE,

  -- Identity
  name                  TEXT NOT NULL,           -- e.g. 'develup.jobs.search'
  display_name          TEXT NOT NULL,           -- 'Search jobs on DevelUp'
  description           TEXT NOT NULL,           -- LLM-readable: what it does, when to use

  -- HTTP
  http_method           TEXT NOT NULL CHECK (http_method IN ('GET','POST','PUT','PATCH','DELETE')),
  url_template          TEXT NOT NULL,           -- 'https://api.develup.com/jobs?q={query}&loc={location}'
  static_headers        JSONB NOT NULL DEFAULT '{}'::jsonb,
  body_template         TEXT,                    -- for POST/PUT/PATCH; supports {{var}} substitution

  -- Auth — secret encrypted with TENANT_SECRET_KEY_B64 (same scheme as other creds)
  auth_type             TEXT NOT NULL DEFAULT 'none'
    CHECK (auth_type IN ('none','bearer','api_key_header','basic','oauth2')),
  auth_secret_enc       TEXT,                    -- bearer token / api key — encrypted
  auth_header_name      TEXT,                    -- for api_key_header: which header (e.g. 'X-API-Key')

  -- Per-user acting flag — if true, the dispatcher injects X-Acting-User-Id
  -- with the principal's DevelUp user id (resolved by phone). Required for
  -- DevelUp-style "agent acts on behalf of candidate".
  pass_acting_user      BOOLEAN NOT NULL DEFAULT FALSE,
  acting_user_header    TEXT DEFAULT 'X-Acting-User-Id',

  -- Schema — JSON-Schema for inputs the agent must pass
  input_schema          JSONB NOT NULL,          -- { type: 'object', properties: {...}, required: [...] }
  output_shape_hint     TEXT,                    -- LLM hint: what the response shape looks like

  -- Captured during sandbox testing
  sample_request        JSONB,
  sample_response       JSONB,
  last_tested_at        TIMESTAMPTZ,
  last_test_status      TEXT,                    -- 'ok', 'http_error', 'timeout', 'auth_failed'

  -- Risk + lifecycle
  side_effect           BOOLEAN NOT NULL DEFAULT FALSE,  -- → HIGH risk in harness, needs approval
  risk_override         TEXT CHECK (risk_override IN ('low','medium','high')),  -- explicit override
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

-- RLS
ALTER TABLE business.api_tools ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON business.api_tools;
CREATE POLICY tenant_isolation ON business.api_tools
  USING (tenant_id::text = current_setting('app.tenant_id', TRUE));

-- Auto-touch updated_at on changes
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'tg_api_tools_touch') THEN
    CREATE TRIGGER tg_api_tools_touch
      BEFORE UPDATE ON business.api_tools
      FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();
  END IF;
END $$;

-- Record migration
INSERT INTO meta.schema_migrations (version, notes)
VALUES ('0007_dynamic_api_tools', 'dynamic api tool registry — UI-driven tools')
ON CONFLICT (version) DO NOTHING;
