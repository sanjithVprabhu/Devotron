-- Adds Campaign API support to business.whatsapp_numbers.
-- Free-tier AiSensy uses the Campaign API (JWT in body). The Project API columns
-- from migration 0002 stay for paid customers; we now branch on which credentials
-- are populated.

ALTER TABLE business.whatsapp_numbers
  ADD COLUMN IF NOT EXISTS aisensy_api_tier TEXT NOT NULL DEFAULT 'campaign'
    CHECK (aisensy_api_tier IN ('campaign', 'project')),
  -- Encrypted JWT for the Campaign API (POST backend.aisensy.com/campaign/t1/api/v2)
  ADD COLUMN IF NOT EXISTS aisensy_campaign_api_key_enc TEXT,
  -- Name of the AiSensy campaign / approved template used to send agent replies.
  -- e.g. "veda_session_reply" — must exist + be approved in the AiSensy dashboard.
  ADD COLUMN IF NOT EXISTS aisensy_campaign_template_name TEXT;
