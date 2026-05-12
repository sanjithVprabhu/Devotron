-- Per-tenant payment provider credentials.
-- Stored AES-256-GCM-encrypted (same scheme as AiSensy creds).
-- Lookup is RLS-scoped so a tenant can only read its own.

CREATE TABLE IF NOT EXISTS business.payment_credentials (
  tenant_id            UUID PRIMARY KEY REFERENCES core.tenants(id) ON DELETE CASCADE,
  -- Razorpay
  razorpay_key_id      TEXT,                 -- "rzp_test_xxx" — public-ish, stored plaintext
  razorpay_key_secret_enc TEXT,              -- encrypted
  razorpay_webhook_secret_enc TEXT,          -- encrypted
  -- Stripe (placeholder; not wired yet)
  stripe_pubkey        TEXT,
  stripe_secret_enc    TEXT,
  -- UPI manual fallback
  upi_handle           TEXT,                 -- "merchant@hdfc"
  -- Audit
  configured_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE business.payment_credentials ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON business.payment_credentials
  USING (tenant_id::text = current_setting('app.tenant_id', TRUE));

-- Auto-update updated_at on change
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'tg_payment_credentials_touch'
  ) THEN
    CREATE TRIGGER tg_payment_credentials_touch
      BEFORE UPDATE ON business.payment_credentials
      FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();
  END IF;
END $$;
