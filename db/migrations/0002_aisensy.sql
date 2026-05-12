-- Adds AiSensy / multi-provider columns to business.whatsapp_numbers.
-- Provider column lets one tenant operate via AiSensy now and graduate to direct
-- Meta later without schema changes elsewhere.
--
-- The project API password is stored encrypted (Fernet/AES-GCM via the
-- TENANT_SECRET_KEY_B64). The webhook shared secret is also stored encrypted
-- so we can verify inbound AiSensy signatures.

ALTER TABLE business.whatsapp_numbers
  ADD COLUMN IF NOT EXISTS provider TEXT NOT NULL DEFAULT 'aisensy'
    CHECK (provider IN ('aisensy', 'meta_direct')),
  ADD COLUMN IF NOT EXISTS aisensy_project_id TEXT,
  -- Encrypted at the application layer; never plaintext in this column.
  ADD COLUMN IF NOT EXISTS aisensy_project_api_pwd_enc TEXT,
  ADD COLUMN IF NOT EXISTS aisensy_webhook_secret_enc TEXT,
  ADD COLUMN IF NOT EXISTS aisensy_partner_id TEXT;

CREATE INDEX IF NOT EXISTS idx_whatsapp_numbers_aisensy_project
  ON business.whatsapp_numbers (aisensy_project_id)
  WHERE aisensy_project_id IS NOT NULL;
