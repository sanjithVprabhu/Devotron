# 05 — Data Model

> Complete schemas for Postgres, MongoDB, Qdrant, Redis, and Kafka. This is the authoritative reference for all data structures. When adding a field, update this doc first.

---

## Postgres (Neon) — Relational Source of Truth

All tables use UUIDs as primary keys. All tenant-scoped tables have `tenant_id` with RLS enforced. Timestamps are UTC.

### Schema: `core`

```sql
-- TENANTS
CREATE TABLE core.tenants (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  slug            TEXT UNIQUE NOT NULL,          -- URL-safe identifier
  status          TEXT NOT NULL DEFAULT 'pending' -- pending|active|suspended|churned
    CHECK (status IN ('pending','active','suspended','churned')),
  tier            TEXT NOT NULL DEFAULT 'free'
    CHECK (tier IN ('free','starter','growth','pro','enterprise')),
  vertical        TEXT NOT NULL DEFAULT 'generic',
  country_code    TEXT NOT NULL DEFAULT 'IN',
  currency_code   TEXT NOT NULL DEFAULT 'INR',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata        JSONB NOT NULL DEFAULT '{}'
);

-- PRINCIPALS (unified identity)
CREATE TABLE core.principals (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  display_name    TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata        JSONB NOT NULL DEFAULT '{}'
);

-- IDENTIFIERS (how we find a principal from a channel message)
CREATE TABLE core.identifiers (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  principal_id    UUID NOT NULL REFERENCES core.principals(id),
  channel         TEXT NOT NULL CHECK (channel IN ('whatsapp','twitter','email','internal')),
  identifier      TEXT NOT NULL,              -- phone number, twitter handle, email
  verified        BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (channel, identifier)
);
CREATE INDEX idx_identifiers_lookup ON core.identifiers (channel, identifier);

-- CROSS-CHANNEL LINKING CODES (Twitter → WhatsApp identity stitching)
CREATE TABLE core.linking_codes (
  code            TEXT PRIMARY KEY,
  principal_id    UUID NOT NULL REFERENCES core.principals(id),
  source_channel  TEXT NOT NULL,
  expires_at      TIMESTAMPTZ NOT NULL,
  used_at         TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- TENANT MEMBERSHIPS (which principals belong to which tenant, with what role)
CREATE TABLE core.tenant_memberships (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES core.tenants(id),
  principal_id    UUID NOT NULL REFERENCES core.principals(id),
  role            TEXT NOT NULL CHECK (role IN ('owner','admin','operator','viewer')),
  permissions     JSONB NOT NULL DEFAULT '[]',   -- array of permission strings
  invited_by      UUID REFERENCES core.principals(id),
  joined_at       TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, principal_id)
);
-- RLS: tenant members can only see their own tenant's memberships
ALTER TABLE core.tenant_memberships ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON core.tenant_memberships
  USING (tenant_id = current_setting('app.tenant_id')::UUID);

-- TEAM INVITES
CREATE TABLE core.team_invites (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES core.tenants(id),
  invited_by      UUID NOT NULL REFERENCES core.principals(id),
  phone_number    TEXT,
  email           TEXT,
  role            TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','accepted','expired','revoked')),
  expires_at      TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '7 days',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### Schema: `business`

```sql
-- BUSINESS PROFILES (metadata about each tenant's business)
CREATE TABLE business.profiles (
  tenant_id           UUID PRIMARY KEY REFERENCES core.tenants(id),
  legal_name          TEXT,
  gstin               TEXT,
  pan                 TEXT,
  registered_address  TEXT,
  operating_address   TEXT,
  website_url         TEXT,
  logo_url            TEXT,
  verification_status TEXT NOT NULL DEFAULT 'unverified'
    CHECK (verification_status IN ('unverified','pending','verified','rejected')),
  meta_business_id    TEXT,                    -- Meta Business Manager ID
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE business.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON business.profiles USING (tenant_id = current_setting('app.tenant_id')::UUID);

-- WHATSAPP NUMBERS (a tenant can have multiple numbers)
CREATE TABLE business.whatsapp_numbers (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES core.tenants(id),
  phone_number        TEXT NOT NULL UNIQUE,   -- E.164 format
  display_name        TEXT NOT NULL,
  status              TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','active','restricted','banned')),
  quality_rating      TEXT DEFAULT 'green'
    CHECK (quality_rating IN ('green','yellow','red')),
  waba_id             TEXT,                    -- WhatsApp Business Account ID
  phone_number_id     TEXT,                    -- Meta phone number ID for API calls
  is_primary          BOOLEAN NOT NULL DEFAULT TRUE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE business.whatsapp_numbers ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON business.whatsapp_numbers USING (tenant_id = current_setting('app.tenant_id')::UUID);

-- TWITTER ACCOUNTS (for businesses with Twitter presence)
CREATE TABLE business.twitter_accounts (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES core.tenants(id),
  twitter_handle      TEXT NOT NULL UNIQUE,
  access_token        TEXT,                    -- stored in Key Vault, reference only
  status              TEXT NOT NULL DEFAULT 'active',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE business.twitter_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON business.twitter_accounts USING (tenant_id = current_setting('app.tenant_id')::UUID);
```

### Schema: `blueprints`

```sql
-- BLUEPRINT VERSIONS (immutable, append-only)
CREATE TABLE blueprints.versions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES core.tenants(id),
  version         INTEGER NOT NULL,
  is_current      BOOLEAN NOT NULL DEFAULT FALSE,
  content         JSONB NOT NULL,              -- full blueprint JSON
  diff            JSONB,                       -- diff from previous version
  mutated_by      UUID REFERENCES core.principals(id),
  mutation_source TEXT CHECK (mutation_source IN ('veda','dashboard','api','migration')),
  mutation_reason TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, version)
);
CREATE INDEX idx_blueprints_current ON blueprints.versions (tenant_id, is_current) WHERE is_current = TRUE;
ALTER TABLE blueprints.versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON blueprints.versions USING (tenant_id = current_setting('app.tenant_id')::UUID);

-- BLUEPRINT DRAFT (work in progress during onboarding)
CREATE TABLE blueprints.drafts (
  tenant_id       UUID PRIMARY KEY REFERENCES core.tenants(id),
  content         JSONB NOT NULL DEFAULT '{}',
  completion_pct  INTEGER NOT NULL DEFAULT 0,
  last_step       TEXT,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE blueprints.drafts ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON blueprints.drafts USING (tenant_id = current_setting('app.tenant_id')::UUID);
```

### Schema: `conversations`

```sql
-- CONVERSATIONS (metadata only; full content in MongoDB)
CREATE TABLE conversations.threads (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES core.tenants(id),
  principal_id    UUID NOT NULL REFERENCES core.principals(id),
  channel         TEXT NOT NULL,
  channel_thread_id TEXT,                      -- WhatsApp contact ID, Twitter DM thread ID
  agent_type      TEXT NOT NULL CHECK (agent_type IN ('veda','business')),
  status          TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','escalated','resolved','abandoned')),
  escalated_to    UUID REFERENCES core.principals(id),
  window_expires_at TIMESTAMPTZ,               -- WhatsApp 24-hour window
  message_count   INTEGER NOT NULL DEFAULT 0,
  last_message_at TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_conversations_tenant ON conversations.threads (tenant_id, status, last_message_at DESC);
CREATE INDEX idx_conversations_principal ON conversations.threads (principal_id, tenant_id);
ALTER TABLE conversations.threads ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON conversations.threads USING (tenant_id = current_setting('app.tenant_id')::UUID);

-- ESCALATIONS
CREATE TABLE conversations.escalations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES core.tenants(id),
  thread_id       UUID NOT NULL REFERENCES conversations.threads(id),
  reason          TEXT NOT NULL,
  assigned_to     UUID REFERENCES core.principals(id),
  resolved_at     TIMESTAMPTZ,
  resolution_note TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE conversations.escalations ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON conversations.escalations USING (tenant_id = current_setting('app.tenant_id')::UUID);
```

### Schema: `commerce`

```sql
-- ORDERS
CREATE TABLE commerce.orders (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES core.tenants(id),
  principal_id    UUID NOT NULL REFERENCES core.principals(id),
  thread_id       UUID REFERENCES conversations.threads(id),
  order_number    TEXT NOT NULL,               -- human-readable: ACM-2019
  status          TEXT NOT NULL DEFAULT 'created'
    CHECK (status IN ('created','confirmed','paid','fulfilled','closed','cancelled')),
  line_items      JSONB NOT NULL DEFAULT '[]',
  subtotal_paise  BIGINT NOT NULL DEFAULT 0,   -- store in smallest unit
  tax_paise       BIGINT NOT NULL DEFAULT 0,
  delivery_paise  BIGINT NOT NULL DEFAULT 0,
  total_paise     BIGINT NOT NULL DEFAULT 0,
  currency        TEXT NOT NULL DEFAULT 'INR',
  payment_method  TEXT,
  payment_ref     TEXT,                        -- Razorpay order/payment ID
  delivery_address JSONB,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_orders_tenant ON commerce.orders (tenant_id, status, created_at DESC);
CREATE INDEX idx_orders_principal ON commerce.orders (tenant_id, principal_id);
ALTER TABLE commerce.orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON commerce.orders USING (tenant_id = current_setting('app.tenant_id')::UUID);
```

### Schema: `templates`

```sql
-- WHATSAPP MESSAGE TEMPLATES
CREATE TABLE templates.whatsapp_templates (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES core.tenants(id),
  name            TEXT NOT NULL,
  category        TEXT NOT NULL CHECK (category IN ('marketing','utility','authentication')),
  language        TEXT NOT NULL DEFAULT 'en',
  status          TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','approved','rejected','paused')),
  components      JSONB NOT NULL,              -- header, body, footer, buttons
  meta_template_id TEXT,
  rejection_reason TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, name, language)
);
ALTER TABLE templates.whatsapp_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON templates.whatsapp_templates USING (tenant_id = current_setting('app.tenant_id')::UUID);
```

### Schema: `billing`

```sql
-- SUBSCRIPTIONS
CREATE TABLE billing.subscriptions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL UNIQUE REFERENCES core.tenants(id),
  tier            TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'active',
  current_period_start TIMESTAMPTZ NOT NULL,
  current_period_end   TIMESTAMPTZ NOT NULL,
  razorpay_subscription_id TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- LLM USAGE (daily rollup per tenant per model)
CREATE TABLE billing.llm_usage_daily (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES core.tenants(id),
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

-- DAEMON COMPUTE BUDGET (daily)
CREATE TABLE billing.daemon_budgets (
  tenant_id       UUID NOT NULL REFERENCES core.tenants(id),
  date            DATE NOT NULL,
  budget_paise    BIGINT NOT NULL,
  used_paise      BIGINT NOT NULL DEFAULT 0,
  PRIMARY KEY (tenant_id, date)
);
```

### Schema: `daemon`

```sql
-- DAEMON PROPOSALS
CREATE TABLE daemon.proposals (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES core.tenants(id),
  proposal_type   TEXT NOT NULL
    CHECK (proposal_type IN ('reengagement','faq_update','catalog_gap','conversation_review','broadcast')),
  title           TEXT NOT NULL,
  description     TEXT NOT NULL,
  action          JSONB NOT NULL,              -- structured action payload
  estimated_impact TEXT,
  status          TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','approved','rejected','executed','expired')),
  reviewed_by     UUID REFERENCES core.principals(id),
  reviewed_at     TIMESTAMPTZ,
  executed_at     TIMESTAMPTZ,
  expires_at      TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '7 days',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_proposals_tenant ON daemon.proposals (tenant_id, status, created_at DESC);
ALTER TABLE daemon.proposals ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON daemon.proposals USING (tenant_id = current_setting('app.tenant_id')::UUID);
```

### Schema: `audit`

```sql
-- AUDIT LOG (append-only, no RLS — compliance requirement)
CREATE TABLE audit.events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID,                        -- NULL for platform-level events
  principal_id    UUID,
  event_type      TEXT NOT NULL,
  entity_type     TEXT,
  entity_id       UUID,
  payload         JSONB NOT NULL DEFAULT '{}',
  ip_address      INET,
  user_agent      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
) PARTITION BY RANGE (created_at);
CREATE INDEX idx_audit_tenant ON audit.events (tenant_id, created_at DESC);
CREATE INDEX idx_audit_event_type ON audit.events (event_type, created_at DESC);
```

### Schema: `reputation` (V2 hooks, minimal v1)

```sql
-- REVIEWS (collected silently in v1, not displayed)
CREATE TABLE reputation.reviews (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES core.tenants(id),
  reviewer_principal_id UUID NOT NULL REFERENCES core.principals(id),
  thread_id       UUID REFERENCES conversations.threads(id),
  order_id        UUID REFERENCES commerce.orders(id),
  rating          SMALLINT CHECK (rating BETWEEN 1 AND 5),
  tags            TEXT[],
  collected_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_displayed    BOOLEAN NOT NULL DEFAULT FALSE  -- FALSE until V2 turns this on
);
ALTER TABLE reputation.reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON reputation.reviews USING (tenant_id = current_setting('app.tenant_id')::UUID);
```

---

## MongoDB Atlas — Document Store

One database per tenant: `tenant_<tenant_uuid>`. Collections below exist in each.

### Collection: `catalog_items`

```javascript
// Schema varies by vertical — enforced by catalog-service, not Mongo
{
  _id: ObjectId,
  tenant_id: String,           // redundant but useful for cross-collection queries
  item_id: String,             // stable business-side ID (e.g., SKU)
  vertical: String,            // "auto_parts" | "jobs" | "services" | ...
  status: String,              // "active" | "inactive" | "out_of_stock"
  
  // Vertical-specific fields — examples:
  
  // AUTO PARTS:
  // name: String, sku: String, oem_numbers: [String], brand: String,
  // compatible_vehicles: [{make, model, year_from, year_to, variant}],
  // price_inr: Number, mrp_inr: Number, stock_qty: Number,
  // location: String, weight_kg: Number, images: [String]
  
  // JOBS:
  // title: String, company: String, jd: String, ctc_min: Number,
  // ctc_max: Number, location: String, remote: Boolean,
  // experience_min: Number, experience_max: Number,
  // skills: [String], apply_url: String, posted_at: Date,
  // expires_at: Date
  
  // SERVICES:
  // name: String, description: String, price_inr: Number,
  // duration_mins: Number, availability: {...}, images: [String]
  
  data: Object,                // vertical-specific fields stored here
  search_text: String,         // pre-computed search string for FTS
  embedding_id: String,        // reference to Qdrant point
  created_at: Date,
  updated_at: Date,
  metadata: Object
}
```

### Collection: `messages`

```javascript
{
  _id: ObjectId,
  tenant_id: String,
  thread_id: String,           // references conversations.threads.id
  message_id: String,          // channel-native ID (Meta message ID, tweet ID)
  direction: String,           // "inbound" | "outbound"
  channel: String,             // "whatsapp" | "twitter"
  
  sender_principal_id: String,
  
  // Canonical message content
  content: {
    type: String,              // "text" | "voice" | "image" | "document" | "button_reply" | "list_reply" | "location"
    text: String,
    media_url: String,         // Azure Blob reference
    media_type: String,
    caption: String,
    transcription: String,     // for voice notes
    location: { lat: Number, lng: Number, address: String },
    interactive: {             // for button/list replies
      type: String,
      selected_id: String,
      selected_title: String
    }
  },
  
  // Agent metadata
  agent_metadata: {
    model_used: String,
    provider: String,
    input_tokens: Number,
    output_tokens: Number,
    cached_tokens: Number,
    cost_paise: Number,
    sub_agent: String,         // which sub-agent handled this
    tool_calls: [{
      tool: String,
      input: Object,
      output: Object,
      duration_ms: Number
    }],
    confidence: Number,        // 0-1
    escalation_triggered: Boolean
  },
  
  // Delivery
  delivery_status: String,     // "sent" | "delivered" | "read" | "failed"
  delivered_at: Date,
  read_at: Date,
  
  created_at: Date
}
```

### Collection: `agent_checkpoints`

```javascript
// LangGraph state checkpoints
{
  _id: ObjectId,
  tenant_id: String,
  thread_id: String,
  checkpoint_id: String,       // LangGraph internal
  state: Object,               // serialized LangGraph state
  created_at: Date
}
```

### Collection: `end_user_profiles`

```javascript
// Per-tenant view of an EndUser — their history, preferences, tags
{
  _id: ObjectId,
  tenant_id: String,
  principal_id: String,
  tags: [String],              // "repeat_customer", "high_value", "churned"
  preferences: Object,         // inferred preferences for recommendations
  order_count: Number,
  total_spent_paise: Number,
  last_interaction_at: Date,
  first_interaction_at: Date,
  custom_fields: Object,       // tenant-defined fields
  created_at: Date,
  updated_at: Date
}
```

### Collection: `integration_sync_state`

```javascript
// Track last sync position for external integrations
{
  _id: ObjectId,
  tenant_id: String,
  integration: String,         // "shopify" | "ats_naukri" | "tally_export"
  last_synced_at: Date,
  cursor: String,              // pagination cursor or timestamp
  status: String,              // "ok" | "error" | "paused"
  error_message: String,
  stats: Object                // items synced, errors, etc.
}
```

---

## Qdrant — Vector Collections

Naming convention: `{tenant_uuid}_{collection_type}`

### Collection: `{tenant_uuid}_catalog`

```python
# Each catalog item gets an embedding for semantic search
{
  id: str,                     # catalog item ID (matches MongoDB _id)
  vector: List[float],         # 1536-dim (text-embedding-3-small) or Anthropic equiv
  payload: {
    tenant_id: str,
    item_id: str,
    vertical: str,
    name: str,
    search_text: str,          # same as MongoDB search_text field
    status: str,               # filter by active only
    price_inr: float,          # for price-range filtering
    metadata: dict
  }
}
```

### Collection: `{tenant_uuid}_faq`

```python
# FAQ entries and their answers for RAG-based support responses
{
  id: str,
  vector: List[float],
  payload: {
    tenant_id: str,
    question: str,
    answer: str,
    source: str,               # "owner_defined" | "extracted" | "daemon_suggested"
    confidence: float,
    created_at: str
  }
}
```

### Collection: `{tenant_uuid}_conversation_memory`

```python
# Semantic memory of past conversations — for personalization
{
  id: str,
  vector: List[float],
  payload: {
    tenant_id: str,
    principal_id: str,         # the EndUser
    summary: str,              # summarized memory chunk
    thread_id: str,
    created_at: str
  }
}
```

### Global Collection: `veda_business_directory`

```python
# For Veda's consumer discovery flow — findable businesses
{
  id: str,                     # tenant_id
  vector: List[float],         # embedding of business description + capabilities
  payload: {
    tenant_id: str,
    name: str,
    vertical: str,
    description: str,
    location: {
      city: str,
      state: str,
      lat: float,
      lng: float,
      serves_radius_km: float
    },
    languages: List[str],
    tier: str,
    is_verified: bool,
    reputation_score: float    # null in v1, populated V2
  }
}
```

---

## Redis — Ephemeral State

All keys are namespaced: `tenant:{tenant_id}:...` or `global:...`

### Key Patterns

```
# WhatsApp 24-hour window tracking
# TTL: 24 hours, reset on each inbound message
tenant:{tid}:window:{phone_number}:{contact_number}
  → EXPIREAT timestamp (when window closes)

# Active conversation session (short-term state)
# TTL: 30 minutes idle
tenant:{tid}:session:{thread_id}
  → JSON: { current_node, context_summary, last_tool_calls }

# Idempotency keys (webhook deduplication)
# TTL: 24 hours
global:idempotency:whatsapp:{message_id}
global:idempotency:twitter:{tweet_id}
  → "processed" (value doesn't matter; key existence = processed)

# Blueprint cache
# TTL: 5 minutes, invalidate on blueprint mutation event
tenant:{tid}:blueprint:current
  → JSON: full blueprint content

# Principal/identifier lookup cache
# TTL: 1 hour
global:principal:whatsapp:{phone_number}
global:principal:twitter:{handle}
  → principal_id (UUID string)

# Template cache
# TTL: 1 hour
tenant:{tid}:templates:approved
  → JSON: array of approved templates

# Rate limiting (LLM calls per tenant per minute)
tenant:{tid}:rate:llm:{minute_bucket}
  → Counter (INCR + EXPIREAT)

# Daily LLM cost counter (real-time, synced to Postgres daily)
tenant:{tid}:cost:daily:{date}
  → Counter in paise (INCRBY atomic updates)

# Linking codes (cross-channel identity)
global:linking:{code}
  → JSON: { principal_id, source_channel, expires_at }
  → TTL: 15 minutes

# Daemon lock (prevent concurrent daemon runs per tenant)
tenant:{tid}:daemon:lock
  → "running" with TTL = max daemon run duration (10 minutes)
```

---

## Kafka Topics — Event Schema

Topics are prefixed `veda.` in production. All messages are JSON (schema registry with JSON Schema).

### `veda.messages.inbound`

```json
{
  "event_id": "uuid",
  "occurred_at": "ISO8601",
  "tenant_id": "uuid",
  "thread_id": "uuid",
  "principal_id": "uuid",
  "channel": "whatsapp|twitter",
  "channel_message_id": "string",
  "content": {
    "type": "text|voice|image|button_reply|list_reply|location|document",
    "text": "string",
    "media_url": "string",
    "transcription": "string",
    "interactive": {}
  },
  "raw_payload": {}
}
```

### `veda.messages.outbound`

```json
{
  "event_id": "uuid",
  "occurred_at": "ISO8601",
  "tenant_id": "uuid",
  "thread_id": "uuid",
  "target_channel": "whatsapp|twitter",
  "target_identifier": "string",
  "content_type": "text|interactive|template|media",
  "content": {},
  "template_name": "string",
  "template_variables": {},
  "requires_window_check": true,
  "priority": "normal|high"
}
```

### `veda.agent.actions`

```json
{
  "event_id": "uuid",
  "occurred_at": "ISO8601",
  "tenant_id": "uuid",
  "thread_id": "uuid",
  "action_type": "sub_agent_dispatched|tool_called|escalation_triggered|session_started|session_ended",
  "sub_agent": "string",
  "tool": "string",
  "tool_input": {},
  "tool_output": {},
  "duration_ms": 0,
  "model_used": "string",
  "provider": "string",
  "tokens": { "input": 0, "output": 0, "cached": 0 },
  "cost_paise": 0
}
```

### `veda.blueprint.mutations`

```json
{
  "event_id": "uuid",
  "occurred_at": "ISO8601",
  "tenant_id": "uuid",
  "version_from": 0,
  "version_to": 0,
  "mutated_by_principal": "uuid",
  "mutation_source": "veda|dashboard|api",
  "diff": {},
  "full_blueprint": {}
}
```

### `veda.orders`

```json
{
  "event_id": "uuid",
  "occurred_at": "ISO8601",
  "tenant_id": "uuid",
  "order_id": "uuid",
  "order_number": "string",
  "transition": "created→confirmed|confirmed→paid|paid→fulfilled|*→cancelled",
  "total_paise": 0,
  "principal_id": "uuid",
  "line_items": []
}
```

### `veda.daemon.proposals`

```json
{
  "event_id": "uuid",
  "occurred_at": "ISO8601",
  "tenant_id": "uuid",
  "proposal_id": "uuid",
  "proposal_type": "reengagement|faq_update|catalog_gap|conversation_review|broadcast",
  "title": "string",
  "description": "string",
  "action": {},
  "estimated_impact": "string",
  "expires_at": "ISO8601"
}
```

### `veda.billing.usage`

```json
{
  "event_id": "uuid",
  "occurred_at": "ISO8601",
  "tenant_id": "uuid",
  "provider": "anthropic|azure_openai|sarvam",
  "model": "claude-sonnet-4-6|claude-haiku-4-5|gpt-4o|sarvam-v1",
  "task_type": "string",
  "input_tokens": 0,
  "output_tokens": 0,
  "cached_tokens": 0,
  "cost_paise": 0
}
```

---

## Data Retention Policy

| Data | Retention | Justification |
|---|---|---|
| Audit log | 7 years | DPDP Act + financial compliance |
| Conversation messages | 2 years | Business analytics, support |
| Order records | 7 years | GST/financial compliance |
| Blueprint versions | Permanent | Audit trail, replay |
| Agent checkpoints | 30 days | Debugging, then purge |
| LLM usage daily | 3 years | Billing disputes |
| Redis sessions | 30 min TTL | Ephemeral by design |
| Redis window timers | 24h TTL | WhatsApp protocol |
| Linking codes | 15 min TTL | Security |

---

## PII Handling

Fields classified as PII: phone numbers, email, name, address, ID numbers (GST, PAN, Aadhaar).

- **In logs:** hash phone numbers with HMAC-SHA256 keyed per tenant. Never log raw PII.
- **In Postgres:** stored plaintext but access-controlled via RLS.
- **In MongoDB:** stored plaintext in per-tenant DB.
- **In Qdrant payloads:** never store raw PII in vector payloads — store principal_id reference only.
- **In Kafka messages:** hash or omit PII in event payloads where not necessary for processing.
- **In exports / analytics:** always aggregate or pseudonymize.
- **Right to erasure (DPDP):** deleting a principal hard-deletes identifier rows, anonymizes Mongo docs (replace PII with `[DELETED]`), removes Qdrant points. Order records retain pseudonymized data for financial compliance.
