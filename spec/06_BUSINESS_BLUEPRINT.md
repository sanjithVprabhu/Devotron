# 06 — Business Blueprint

> The Business Blueprint is the single source of truth for every business on VEDA. All runtime agent behavior derives from it. It is versioned, immutable in history, and mutated only through controlled channels.

---

## What the Blueprint Is

A Blueprint is a structured JSON document stored in Postgres (`blueprints.versions`). It captures everything about a business:

- Who they are (identity, legal, location)
- What they sell or offer (catalog configuration)
- How their agent should talk (persona, languages)
- What their agent can do (capability set)
- What rules govern decisions (policies)
- What external systems they use (integrations)
- Who's on their team (deferred to `core.tenant_memberships`, referenced here)
- How the Daemon should behave (daemon config)

Every time the Blueprint changes — by any means (owner texting Veda, dashboard edit, catalog sync) — a new version is written. The previous version is never overwritten.

---

## Complete Blueprint Schema

```typescript
// TypeScript type definition — Zod schema is authoritative for validation

interface BusinessBlueprint {
  // ── SCHEMA VERSION ──────────────────────────────────────────────
  schema_version: "1.0";         // bump when schema changes break compatibility

  // ── IDENTITY ────────────────────────────────────────────────────
  identity: {
    tenant_id: string;           // UUID
    business_name: string;       // display name
    legal_name?: string;
    vertical: Vertical;
    sub_vertical?: string;       // e.g. "oem_auto_parts" within "auto_parts"
    description: string;         // 2-3 sentence description of what the business does
    logo_url?: string;
    website_url?: string;
    gstin?: string;
    pan?: string;
    founded_year?: number;
    operating_since?: string;    // "20 years" — human readable for agent to use
  };

  // ── LOCATIONS ───────────────────────────────────────────────────
  locations: Array<{
    id: string;
    label: string;               // "Main Store", "Warehouse"
    address: string;
    city: string;
    state: string;
    pincode: string;
    country: "IN";               // India-first; extend later
    lat?: number;
    lng?: number;
    is_primary: boolean;
    hours: OperatingHours;
    serves_radius_km?: number;   // for delivery/service area
  }>;

  // ── PERSONA ─────────────────────────────────────────────────────
  persona: {
    agent_name: string;          // what the agent calls itself — e.g. "Acme Assistant"
    base_tone: "formal" | "friendly" | "casual" | "stoic" | "supportive";
    custom_tone_description?: string; // owner's own words about how to sound
    adapts_to_user_tone: boolean;     // true for most SMBs
    languages: LanguageConfig[];
    greeting_message?: string;   // custom first message override
    sign_off?: string;           // "Thanks, Acme Team" style
    persona_examples?: Array<{   // few-shot examples of ideal responses
      user_message: string;
      ideal_response: string;
    }>;
    prohibited_topics?: string[]; // topics the agent should never discuss
  };

  // ── CATALOG CONFIGURATION ────────────────────────────────────────
  catalog: {
    item_count: number;          // synced from catalog-service
    last_synced_at?: string;
    source: CatalogSource;
    // actual items live in MongoDB, not here
    // this block configures how catalog is managed

    display_config: {
      items_per_page: number;    // how many to show at once in WhatsApp list
      show_price: boolean;
      show_stock: boolean;
      show_images: boolean;
    };

    search_config: {
      enable_semantic_search: boolean;
      enable_vehicle_compatibility: boolean; // auto parts specific
      fuzzy_matching: boolean;
    };

    pricing_config: {
      currency: "INR";
      include_gst: boolean;
      gst_rate?: number;         // e.g. 18
      show_mrp: boolean;
    };
  };

  // ── CAPABILITIES ─────────────────────────────────────────────────
  capabilities: {
    enabled: CapabilityId[];
    disabled: CapabilityId[];
    config: Record<CapabilityId, object>; // capability-specific config

    // examples of per-capability config:
    // "payment.razorpay": { key_id: "rzp_live_xxx", currency: "INR" }
    // "scheduling.calendar": { provider: "google", calendar_id: "xxx" }
    // "broadcast.send": { max_per_day: 1000, require_approval: true }
  };

  // ── POLICIES ─────────────────────────────────────────────────────
  policies: {
    haggling: HagglingPolicy;
    escalation: EscalationPolicy;
    returns: ReturnPolicy;
    delivery: DeliveryPolicy;
    payment: PaymentPolicy;
    privacy: PrivacyPolicy;
    hours: {
      respond_outside_hours: boolean;
      outside_hours_message?: string;
    };
  };

  // ── INTEGRATIONS ─────────────────────────────────────────────────
  integrations: {
    crm?: IntegrationConfig;
    ats?: IntegrationConfig;     // jobs vertical
    inventory?: IntegrationConfig;
    payments: IntegrationConfig; // required
    calendar?: IntegrationConfig;
    custom_apis?: Array<{        // API sandbox integrations
      id: string;
      name: string;
      purpose: string;           // auto-detected or owner-confirmed
      base_url: string;
      auth_type: "bearer" | "api_key" | "basic" | "none";
      endpoints: Array<{
        path: string;
        method: string;
        purpose: string;
        schema: object;          // detected response schema
      }>;
    }>;
  };

  // ── DAEMON CONFIGURATION ─────────────────────────────────────────
  daemon: {
    enabled: boolean;
    schedule_hours: number;      // run every N hours (default 6)
    daily_budget_inr: number;    // compute budget per day
    enabled_jobs: DaemonJobType[];
    reengagement_config?: {
      dormancy_threshold_days: number;   // default 60
      max_per_run: number;               // default 100
    };
  };

  // ── LLM CONFIGURATION ────────────────────────────────────────────
  llm: {
    preferred_reasoning_model?: string;  // owner preference override (pro+ tier)
    max_tokens_per_response: number;     // default 500
    // most config is platform-level, not per-blueprint
  };

  // ── DISCOVERY (for Veda's consumer-side search) ───────────────────
  discovery: {
    visible: boolean;            // is this business discoverable via Veda?
    keywords: string[];          // e.g. ["brake pads", "car parts", "Maruti"]
    service_area: {
      cities: string[];
      states: string[];
      nationwide: boolean;
    };
    specializations?: string[];  // e.g. ["German cars", "Vintage vehicles"]
  };

  // ── METADATA ─────────────────────────────────────────────────────
  _meta: {
    version: number;
    is_current: boolean;
    created_at: string;
    mutated_by: string;          // principal_id
    mutation_source: "veda" | "dashboard" | "api" | "migration";
    mutation_reason?: string;
    completion_pct: number;      // 0-100, how complete the blueprint is
  };
}
```

### Supporting Types

```typescript
type Vertical =
  | "auto_parts"
  | "jobs"
  | "services"
  | "retail"
  | "education"
  | "healthcare"
  | "food"
  | "real_estate"
  | "events"
  | "content"
  | "b2b_distribution"
  | "generic";

interface LanguageConfig {
  code: string;         // ISO 639-1: "en", "hi", "kn", "ta", "te", "mr", "bn"
  name: string;         // "English", "Hindi", "Kannada"
  proficiency: "primary" | "secondary";
  script?: "latin" | "devanagari" | "kannada" | "tamil" | "telugu";
}

interface CatalogSource {
  type: "manual" | "csv_upload" | "shopify" | "api" | "crawl" | "ats_api";
  last_import_at?: string;
  auto_sync: boolean;
  sync_frequency_hours?: number;
}

type CapabilityId =
  | "catalog.search"
  | "catalog.add"
  | "catalog.update"
  | "payment.razorpay"
  | "payment.upi_manual"
  | "broadcast.send"
  | "scheduling.calendar"
  | "negotiation.bounded"
  | "support.faq"
  | "support.escalation"
  | "recommendations.similar_items"
  | "a2a.transact"              // V2
  | "integration.shopify"
  | "integration.ats_search"
  | "integration.ats_apply";

interface HagglingPolicy {
  mode: "off" | "escalate" | "bounded" | "free";
  max_discount_pct?: number;    // for "bounded" mode
  approval_required_above_pct?: number;
  policy_is_one_time?: boolean; // once approved, remember forever?
  agent_can_remember_policy: boolean;
}

interface EscalationPolicy {
  triggers: Array<{
    condition: string;          // e.g. "order_value_above", "complaint", "refund_request"
    threshold?: number;
    escalate_to: "owner" | "operator" | "admin";
  }>;
  escalation_message?: string;  // what to tell the customer when escalating
  response_sla_minutes?: number;
}

interface ReturnPolicy {
  accepts_returns: boolean;
  return_window_days?: number;
  conditions?: string;
  process_description?: string;
}

interface DeliveryPolicy {
  offers_delivery: boolean;
  delivery_radius_km?: number;
  delivery_fee_inr?: number;
  free_delivery_above_inr?: number;
  estimated_time?: string;      // "2-4 hours", "Next day"
  cod_available: boolean;
}

interface PaymentPolicy {
  accepted_methods: Array<"upi" | "razorpay" | "cash" | "cod" | "bank_transfer" | "credit_30d">;
  auto_generate_invoice: boolean;
  require_advance_pct?: number; // for custom orders
}

interface PrivacyPolicy {
  data_retention_days: number;
  share_with_third_parties: boolean;
  marketing_opt_in_default: boolean;
}

interface IntegrationConfig {
  provider: string;
  status: "connected" | "disconnected" | "error";
  connected_at?: string;
  config: object;               // provider-specific, stored encrypted in Key Vault
}

type DaemonJobType =
  | "reengagement"
  | "faq_patterns"
  | "catalog_gaps"
  | "conversation_review"
  | "weekly_digest";
```

---

## Example: Auto Parts Blueprint (v1, after onboarding)

```json
{
  "schema_version": "1.0",
  "identity": {
    "tenant_id": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
    "business_name": "Acme Auto Parts",
    "legal_name": "Acme Automobile Parts Pvt Ltd",
    "vertical": "auto_parts",
    "description": "Bangalore's trusted auto spare parts shop for 20+ years. OEM and aftermarket parts for all major Indian car brands. Walk-in, B2B, and delivery available.",
    "founded_year": 2004,
    "operating_since": "over 20 years"
  },
  "locations": [{
    "id": "loc_main",
    "label": "Main Store",
    "address": "42, Hosur Road",
    "city": "Bengaluru",
    "state": "Karnataka",
    "pincode": "560095",
    "country": "IN",
    "is_primary": true,
    "hours": {
      "monday": { "open": "09:00", "close": "20:00" },
      "tuesday": { "open": "09:00", "close": "20:00" },
      "wednesday": { "open": "09:00", "close": "20:00" },
      "thursday": { "open": "09:00", "close": "20:00" },
      "friday": { "open": "09:00", "close": "20:00" },
      "saturday": { "open": "09:00", "close": "18:00" },
      "sunday": { "open": "10:00", "close": "15:00" }
    },
    "serves_radius_km": 10
  }],
  "persona": {
    "agent_name": "Acme Assistant",
    "base_tone": "friendly",
    "adapts_to_user_tone": true,
    "languages": [
      { "code": "kn", "name": "Kannada", "proficiency": "primary", "script": "kannada" },
      { "code": "hi", "name": "Hindi", "proficiency": "primary", "script": "devanagari" },
      { "code": "en", "name": "English", "proficiency": "primary" }
    ],
    "sign_off": "- Acme Auto Parts Team",
    "prohibited_topics": ["competitors' pricing", "politics"]
  },
  "catalog": {
    "item_count": 2847,
    "source": { "type": "csv_upload", "auto_sync": false },
    "display_config": { "items_per_page": 5, "show_price": true, "show_stock": true, "show_images": false },
    "search_config": { "enable_semantic_search": true, "enable_vehicle_compatibility": true, "fuzzy_matching": true },
    "pricing_config": { "currency": "INR", "include_gst": true, "gst_rate": 18, "show_mrp": false }
  },
  "capabilities": {
    "enabled": [
      "catalog.search", "catalog.update", "payment.razorpay", "payment.upi_manual",
      "broadcast.send", "support.faq", "support.escalation",
      "recommendations.similar_items", "negotiation.bounded"
    ],
    "disabled": ["scheduling.calendar", "a2a.transact"],
    "config": {
      "payment.razorpay": { "currency": "INR" },
      "negotiation.bounded": { "max_discount_pct": 10, "approval_required_above_pct": 5 },
      "broadcast.send": { "max_per_day": 500, "require_approval": true }
    }
  },
  "policies": {
    "haggling": {
      "mode": "bounded",
      "max_discount_pct": 10,
      "approval_required_above_pct": 5,
      "agent_can_remember_policy": true
    },
    "escalation": {
      "triggers": [
        { "condition": "order_value_above", "threshold": 10000, "escalate_to": "owner" },
        { "condition": "refund_request", "escalate_to": "owner" },
        { "condition": "complaint", "escalate_to": "operator" }
      ],
      "escalation_message": "Let me connect you with our team for this. They'll respond within 30 minutes.",
      "response_sla_minutes": 30
    },
    "returns": {
      "accepts_returns": true,
      "return_window_days": 7,
      "conditions": "Unused, in original packaging, with receipt"
    },
    "delivery": {
      "offers_delivery": true,
      "delivery_radius_km": 10,
      "delivery_fee_inr": 80,
      "free_delivery_above_inr": 2000,
      "estimated_time": "2-4 hours",
      "cod_available": true
    },
    "payment": {
      "accepted_methods": ["upi", "razorpay", "cash", "cod"],
      "auto_generate_invoice": true
    },
    "privacy": {
      "data_retention_days": 730,
      "share_with_third_parties": false,
      "marketing_opt_in_default": true
    },
    "hours": {
      "respond_outside_hours": true,
      "outside_hours_message": "Hi! Our shop is currently closed. We'll respond first thing when we open. Our hours are Mon-Fri 9am-8pm, Sat 9am-6pm, Sun 10am-3pm."
    }
  },
  "integrations": {
    "payments": {
      "provider": "razorpay",
      "status": "connected",
      "config": {}
    }
  },
  "daemon": {
    "enabled": true,
    "schedule_hours": 6,
    "daily_budget_inr": 50,
    "enabled_jobs": ["reengagement", "faq_patterns", "catalog_gaps", "conversation_review"],
    "reengagement_config": {
      "dormancy_threshold_days": 60,
      "max_per_run": 100
    }
  },
  "llm": { "max_tokens_per_response": 500 },
  "discovery": {
    "visible": true,
    "keywords": ["auto parts", "car parts", "brake pads", "Maruti", "Hyundai", "spare parts", "Bangalore"],
    "service_area": { "cities": ["Bengaluru"], "states": ["Karnataka"], "nationwide": false },
    "specializations": ["Japanese cars", "Korean cars", "OEM compatibility lookup"]
  },
  "_meta": {
    "version": 3,
    "is_current": true,
    "created_at": "2025-01-15T10:30:00Z",
    "mutated_by": "principal_rajesh_uuid",
    "mutation_source": "dashboard",
    "mutation_reason": "Added delivery policy after customer inquiry",
    "completion_pct": 92
  }
}
```

---

## Blueprint Lifecycle

### Creation
1. Owner starts onboarding with Veda
2. Veda creates a `blueprints.drafts` record, populating it progressively through the intake question tree
3. When `completion_pct >= 70`, Veda creates `blueprints.versions` version 1
4. Blueprint is marked `is_current = true`
5. Business Agent runtime loads blueprint from cache

### Mutation
Any change to the blueprint goes through this flow:

```
Mutation source (Veda/Dashboard/API)
  → blueprint-service.mutate(tenant_id, patch, mutated_by, reason)
  → Validate patch against vertical schema (Zod)
  → Load current blueprint
  → Apply patch (deep merge with conflict detection)
  → Write new version (version+1, is_current=true)
  → Set old version is_current=false
  → Publish BlueprintMutated event to Kafka
  → Invalidate Redis cache for tenant
  → Agent orchestrator picks up new version on next conversation
```

### Rollback
```
blueprint-service.rollback(tenant_id, target_version, rolled_back_by)
  → Copies target_version content to new version (version+1)
  → Same mutation flow from here
```

### Reading
- **Hot path (agent orchestrator):** reads from Redis cache (5-min TTL)
- **Cache miss:** reads `blueprints.versions WHERE is_current=TRUE`
- **Dashboard:** reads directly from Postgres (no caching, always fresh)
- **Daemon:** reads from Postgres at start of each run

---

## Vertical-Specific Blueprint Extensions

Each vertical adds fields inside the relevant sections. The core schema above covers all verticals; verticals extend specific blocks:

### Auto Parts Extension (inside `catalog.search_config`)
```json
{
  "enable_vehicle_compatibility": true,
  "oem_lookup_enabled": true,
  "brands_stocked": ["Bosch", "Brembo", "Roulunds", "Minda", "Lumax"],
  "vehicle_makes_supported": ["Maruti", "Hyundai", "Honda", "Toyota", "Tata"]
}
```

### Jobs Extension (inside `capabilities.config["integration.ats_search"]`)
```json
{
  "ats_provider": "naukri_api",
  "candidate_profile_fields": ["name", "current_ctc", "expected_ctc", "location", "skills", "experience"],
  "search_filters_exposed": ["location", "salary", "experience", "skills", "work_mode"],
  "application_flow": "direct_apply",
  "interview_scheduling_enabled": true
}
```

---

## What the Agent Does With the Blueprint

The blueprint is injected into every agent's context at the start of a conversation. It is injected as a compressed, structured prompt section — not the raw JSON.

The prompt injection function (`render_blueprint_for_prompt`) converts the blueprint to natural language:

```python
def render_blueprint_for_prompt(blueprint: BusinessBlueprint) -> str:
    """
    Converts a Business Blueprint into a compressed natural-language
    context block for injection into the agent system prompt.
    This text is cache-eligible on Anthropic's side.
    """
    return f"""
## Business Context
You are the AI agent for {blueprint.identity.business_name}.
{blueprint.identity.description}

## Your Persona
Name: {blueprint.persona.agent_name}
Tone: {blueprint.persona.base_tone}. Adapt to user tone: {blueprint.persona.adapts_to_user_tone}.
Languages: {', '.join(l.name for l in blueprint.persona.languages)}.
Do not discuss: {', '.join(blueprint.persona.prohibited_topics or [])}.

## What You Can Do
Enabled capabilities: {', '.join(blueprint.capabilities.enabled)}.

## Key Policies
Haggling: {render_haggling_policy(blueprint.policies.haggling)}
Escalate orders above: ₹{blueprint.policies.escalation.triggers[0].threshold if blueprint.policies.escalation.triggers else 'N/A'}
Delivery: {render_delivery_policy(blueprint.policies.delivery)}
Payments: {', '.join(blueprint.policies.payment.accepted_methods)}

## Hours
{render_hours(blueprint.locations[0].hours)}
Outside hours: {blueprint.policies.hours.outside_hours_message or 'Still respond helpfully.'}
"""
```

This rendered string is stable enough for Anthropic's 5-minute prompt cache to work effectively across most conversations for the same tenant.
