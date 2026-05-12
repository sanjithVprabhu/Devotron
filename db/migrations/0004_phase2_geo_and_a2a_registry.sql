-- Phase 2 (geo) + Phase 3 (A2A primitives only).
-- These are additive columns / tables; safe to re-run.

-- ── Phase 2: geo-tagging on business profiles ──────────────────────────
ALTER TABLE business.profiles
  ADD COLUMN IF NOT EXISTS latitude     DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS longitude    DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS city         TEXT,
  ADD COLUMN IF NOT EXISTS geocoded_at  TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_profiles_geo
  ON business.profiles (latitude, longitude)
  WHERE latitude IS NOT NULL AND longitude IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_city
  ON business.profiles (LOWER(city));

-- ── Phase 3: agent registry (primitives only — no wire format yet) ──────
-- Tracks which tenant agents are publicly callable from other agents.
-- `signing_pubkey` is generated lazily the first time the agent attempts an
-- A2A call; until then NULL means "not yet enrolled in the A2A network".
CREATE TABLE IF NOT EXISTS a2a.agent_registry (
  tenant_id            UUID PRIMARY KEY REFERENCES core.tenants(id) ON DELETE CASCADE,
  is_listed_publicly   BOOLEAN NOT NULL DEFAULT FALSE,
  exposed_capabilities TEXT[] NOT NULL DEFAULT '{}',
  signing_pubkey       TEXT,
  display_name         TEXT,
  registry_url         TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_registry_listed
  ON a2a.agent_registry (is_listed_publicly)
  WHERE is_listed_publicly = TRUE;

-- ── Phase 2: cross-business consent ─────────────────────────────────────
-- Per-principal flag: do you want VEDA to share *that you exist* across
-- businesses (so other agents can greet you with continuity)? OFF by default.
-- We never share what you did at one business with another — only existence.
ALTER TABLE core.principals
  ADD COLUMN IF NOT EXISTS cross_business_continuity BOOLEAN NOT NULL DEFAULT FALSE;
