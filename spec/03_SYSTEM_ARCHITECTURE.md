# 03 — System Architecture

> The high-level shape of the system: services, their responsibilities, how they communicate, and the data flow for the most important journeys.

---

## Architectural Principles (Recap)

These are the constraints that shape every decision in this doc:

1. **Two languages: TypeScript + Python.** Nothing else in v1.
2. **The Business Blueprint is the source of truth.** All runtime behavior derives from it.
3. **Three-tier agent hierarchy.** Dev → Business Agents → Capability Workers.
4. **Event-sourced.** Kafka is the spine. Every meaningful action is an event.
5. **Multi-tenant isolation at the data layer.** RLS on Postgres, per-tenant collections in Qdrant, per-tenant DBs in Mongo.
6. **Channel-agnostic.** All channel-specific code lives behind the channel adapter interface.
7. **Cost-disciplined.** LLM cost is metered, attributed, and capped per tenant.

---

## High-Level Architecture

```
                         ┌─────────────────────────────────────────────────┐
                         │  EXTERNAL                                       │
                         │                                                 │
                         │   WhatsApp Cloud API     Twitter API            │
                         │   Meta Graph API         Razorpay               │
                         │   Aggregator ATS APIs    Shopify (V2)           │
                         │                                                 │
                         └──────────┬──────────────────────┬───────────────┘
                                    │                      │
                                    ▼                      ▼
┌──────────────────────────────────────────────────────────────────────────┐
│  EDGE LAYER (TypeScript / Node, Fastify)                                 │
│                                                                          │
│  • Webhook ingestion (WhatsApp, Twitter, Razorpay)                       │
│  • Channel Adapters (canonicalize messages → internal format)            │
│  • Idempotency, signature verification, rate limiting                    │
│  • Outbound message sender (with 24-hour-window guard, template lookup)  │
│                                                                          │
└──────────────────────────────────────┬───────────────────────────────────┘
                                       │  Canonical Message Events
                                       ▼
┌──────────────────────────────────────────────────────────────────────────┐
│  EVENT BUS (Kafka — Confluent on Azure)                                  │
│                                                                          │
│  Topics: messages.inbound, messages.outbound, agent.actions,             │
│          blueprint.mutations, orders, escalations, daemon.proposals,     │
│          a2a.transactions, billing.usage, audit.log                      │
│                                                                          │
│  All other services read/write through Kafka.                            │
└──────┬─────────────────────┬───────────────────────┬─────────────────────┘
       │                     │                       │
       ▼                     ▼                       ▼
┌─────────────┐  ┌────────────────────────┐  ┌────────────────────────────┐
│  AGENT      │  │  BUSINESS LOGIC        │  │  ANALYTICS & DAEMON         │
│  ORCHESTR.  │  │  SERVICES              │  │                            │
│  (Python,   │  │  (Python, FastAPI)     │  │  (Python, scheduled jobs)  │
│  LangGraph) │  │                        │  │                            │
│             │  │  • Blueprint Service   │  │  • Daemon Runner           │
│  • Dev      │  │  • Catalog Service     │  │    (per-tenant scheduled)  │
│  • Business │  │  • Order Service       │  │  • Analytics aggregator    │
│    Agents   │  │  • Identity Service    │  │  • Cost tracker            │
│  • Sub-     │  │  • Team/Permissions    │  │  • Eval pipelines          │
│    Agents   │  │  • Integration Hub     │  │                            │
│             │  │                        │  │                            │
└─────┬───────┘  └────────────┬───────────┘  └────────────┬───────────────┘
      │                       │                           │
      └───────────────────────┴───────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────────────┐
│  CAPABILITY WORKERS (Python, stateless functions/services)               │
│                                                                          │
│  catalog.search    catalog.add        payment.razorpay.create_link       │
│  payment.verify    broadcast.send     scheduling.calendar.book           │
│  template.lookup   template.submit    integration.shopify.sync           │
│  integration.ats.search_jobs   media.transcribe   media.image_analyze    │
│                                                                          │
│  Tools called by agents. Each is a small, focused, well-tested unit.     │
└──────────────────────────────────────┬───────────────────────────────────┘
                                       │
                                       ▼
┌──────────────────────────────────────────────────────────────────────────┐
│  DATA LAYER                                                              │
│                                                                          │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌────────────┐         │
│  │ Neon       │  │ MongoDB    │  │ Qdrant     │  │ Redis      │         │
│  │ Postgres   │  │ Atlas      │  │            │  │            │         │
│  ├────────────┤  ├────────────┤  ├────────────┤  ├────────────┤         │
│  │ tenants    │  │ catalogs   │  │ per-tenant │  │ sessions   │         │
│  │ principals │  │ messages   │  │ collections│  │ rate limits│         │
│  │ blueprints │  │ agent      │  │ for RAG    │  │ 24hr win.  │         │
│  │ (versioned)│  │  state     │  │            │  │ idempot.   │         │
│  │ orders     │  │ checkpts   │  │            │  │ keys       │         │
│  │ team       │  │            │  │            │  │            │         │
│  │ audit_log  │  │            │  │            │  │            │         │
│  │ billing    │  │            │  │            │  │            │         │
│  └────────────┘  └────────────┘  └────────────┘  └────────────┘         │
│                                                                          │
│  All scoped by tenant_id. RLS on Postgres, per-tenant DBs/collections    │
│  on Mongo/Qdrant, namespaced keys on Redis.                              │
└──────────────────────────────────────────────────────────────────────────┘
                                       │
                                       ▼
┌──────────────────────────────────────────────────────────────────────────┐
│  FRONTENDS (Next.js + TypeScript)                                        │
│                                                                          │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────────┐    │
│  │ Marketing Site   │  │ Onboarding Web   │  │ Operational Dashboard│    │
│  │ (Vercel)         │  │ (Vercel + AKS)   │  │ (AKS, India region)  │    │
│  └──────────────────┘  └──────────────────┘  └──────────────────────┘    │
│                                                                          │
│  Realtime updates via SSE/WebSocket from API gateway                     │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## Service-by-Service Breakdown

Each service below has a stable name and responsibility. They communicate via Kafka and HTTP (REST/gRPC where it makes sense).

### Edge Layer (TypeScript, Fastify)

#### `edge-webhook`
**Responsibility:** Receive inbound webhooks from WhatsApp, Twitter, Razorpay, etc. Verify signatures. Deduplicate. Push to Kafka.
**Stateful?** No (uses Redis for idempotency keys).
**Scaling:** Horizontal, behind a load balancer.

#### `edge-sender`
**Responsibility:** Send outbound messages to channels. Enforces the WhatsApp 24-hour window (must use templates outside it). Looks up template definitions. Tracks delivery + read receipts.
**Stateful?** No (uses Redis for window tracking).
**Scaling:** Horizontal.

#### `channel-whatsapp`, `channel-twitter`
**Responsibility:** Channel-specific adapters. Translate between channel API and our canonical message format. Each channel has a module under `edge/src/channels/`.
**Important:** No code outside these modules talks directly to channel APIs.

---

### Event Bus (Kafka)

Topics (initial set):

| Topic | Producers | Consumers | Notes |
|---|---|---|---|
| `messages.inbound` | edge-webhook | agent-orchestrator, audit, daemon | Canonical inbound messages |
| `messages.outbound` | agent-orchestrator | edge-sender, audit | Messages to send out |
| `agent.actions` | agent-orchestrator | audit, billing, analytics | Tool calls, sub-agent dispatch, decisions |
| `blueprint.mutations` | blueprint-service | runtime, audit, dashboard | Versioned blueprint changes |
| `orders` | order-service | dashboard, billing, daemon | Order state transitions |
| `escalations` | agent-orchestrator | dashboard (notifications), audit | Human handoff triggers |
| `daemon.proposals` | daemon-runner | dashboard, audit | Proposed actions for owner approval |
| `a2a.transactions` | agent-orchestrator (V2) | audit, dashboard | Agent-to-agent transactions |
| `billing.usage` | agent-orchestrator, capability workers | billing-service | LLM cost, message counts |
| `audit.log` | (all services) | audit-store | Compliance audit trail |
| `integrations.events` | integration workers | dashboard, daemon | External system updates (e.g., Shopify catalog change) |

**Schema management:** Kafka topics use Avro or JSON Schema with a schema registry. Forward-compatible evolution.

**Partitioning:** Most topics partitioned by `tenant_id` for ordered per-tenant consumption.

---

### Agent Orchestration Layer (Python, LangGraph)

#### `agent-orchestrator`
**Responsibility:** The brain. Receives inbound messages, identifies the target Principal (Dev or specific Business Agent), runs the agent graph, decides on tool calls, produces outbound messages.
**Stateful?** Per-conversation state checkpointed to Mongo (LangGraph checkpoints). Long-term memory in Postgres + Qdrant.
**Scaling:** Horizontal. Each instance can handle multiple conversations concurrently (async).

Internally structured as:
- **Dev Agent module** — handles Dev's onboarding + discovery flows
- **Business Agent module** — generic per-tenant agent runtime, parameterized by Blueprint
- **Sub-agents** — Catalog, Transaction, Support, Follow-up, Escalation
- **Supervisor** — top-level router within a Business Agent

See `09_DEV_AGENT.md` and `10_BUSINESS_AGENT_RUNTIME.md` for details.

---

### Business Logic Services (Python, FastAPI)

These are CRUD + business-rule services, called by the orchestrator and the dashboard.

#### `blueprint-service`
- CRUD on Blueprints (versioned, immutable history)
- Validation against vertical-specific schemas
- Mutation events to Kafka

#### `catalog-service`
- CRUD on catalog items (per business)
- Search (text + vector hybrid)
- Bulk import (CSV, Excel, Tally export, Shopify sync)
- Schema-per-vertical enforcement

#### `order-service`
- Order state machine (Created → Confirmed → Paid → Fulfilled → Closed/Cancelled)
- Coordinates with payment workers
- Emits `orders` events for analytics

#### `identity-service`
- Principal CRUD
- Identifier resolution (phone → Principal, Twitter handle → Principal)
- Cross-channel linking codes
- Authentication (for dashboard)

#### `team-service`
- Team member CRUD
- Permission checks
- Invite/accept flow

#### `integration-hub`
- Manages all external integrations (Razorpay, Shopify, ATS, Tally export parsing, website crawl)
- Each integration is a sub-module
- Webhook receivers from third parties land here, are normalized, pushed to Kafka

#### `template-service`
- WhatsApp message template management
- Submit to Meta for approval
- Track approval status
- Lookup at send time

---

### Daemon (Python, scheduled)

#### `daemon-runner`
- Reads conversation event stream and per-tenant context
- Per-tenant scheduled (default: every 6 hours)
- Generates Daemon Proposals
- Bounded by per-tenant compute budget
- Writes proposals to `daemon.proposals` topic

See `15_DAEMON.md` for proposal types and decision logic.

---

### Analytics & Cost (Python)

#### `analytics-aggregator`
- Consumes events, projects them into queryable views
- Powers dashboard charts
- Stores aggregates in Postgres (and Mongo for high-cardinality slices)

#### `cost-tracker`
- Real-time tracking of LLM token usage per tenant
- Enforces per-tenant compute budgets
- Alerts when tenants approach limits

---

### Frontend Services

#### `marketing-site` (Next.js, deployed to Vercel)
- Public landing page, pricing, blog, vertical-specific landing pages
- No tenant data
- SEO-optimized

#### `onboarding-web` (Next.js, deployed to Vercel + AKS hybrid)
- Web-based alternative to WhatsApp-only onboarding
- Account creation, payment, link WhatsApp number

#### `dashboard-web` (Next.js, deployed to AKS, India region)
- Authenticated, tenant-scoped
- Conversation viewer, shared inbox, blueprint editor, analytics, team management, billing
- Real-time updates via SSE/WebSocket

---

## Data Flow — The Critical Paths

### Path 1: An End User Sends a Message to a Business Agent

```
1. Customer sends WhatsApp message to Acme Auto Parts number
        ↓
2. Meta delivers webhook to edge-webhook
        ↓
3. edge-webhook:
   - Verifies signature
   - Deduplicates by message ID (Redis)
   - Identifies tenant by recipient phone number (Postgres lookup)
   - Identifies sender Principal (or creates new EndUser principal)
   - Translates to canonical message format
   - Publishes to messages.inbound topic (partitioned by tenant_id)
        ↓
4. agent-orchestrator consumes the message:
   - Loads Blueprint for tenant (Postgres, cached)
   - Loads/creates Conversation context (Mongo)
   - Runs Business Agent graph (LangGraph)
        ↓
5. Within the agent:
   - Supervisor routes to Catalog sub-agent (intent: product inquiry)
   - Catalog sub-agent calls catalog.search capability
   - catalog-service returns matching SKUs
   - Catalog sub-agent formulates response with options
   - Supervisor passes back to message formatter
        ↓
6. Outbound message published to messages.outbound topic
        ↓
7. edge-sender consumes:
   - Checks 24-hour window (open, since customer just messaged)
   - Sends via WhatsApp Cloud API
   - Updates delivery status when receipt comes back
        ↓
8. All steps publish events to audit.log, billing.usage, agent.actions
        ↓
9. Dashboard subscribers (via SSE) receive live conversation updates
        ↓
10. Daemon (later, on schedule) reads aggregated events and may
    propose actions ("This customer asked about Bosch — we don't
    stock the rear; consider adding")
```

### Path 2: An Owner Onboards Their Business with Dev

```
1. Owner sends "Hi" to Dev's WhatsApp number
        ↓
2. edge-webhook routes to Dev (special tenant_id = "dev")
        ↓
3. agent-orchestrator runs Dev Agent graph:
   - Identifies Principal (new or returning)
   - Determines mode (consumer discovery or business setup)
   - Runs the appropriate flow (intake question tree for setup)
        ↓
4. Throughout the flow, Dev:
   - Calls intake.next_question to determine what to ask next
   - Captures answers, validates, builds up a draft Blueprint
   - When ready, calls blueprint.create with draft
        ↓
5. blueprint-service:
   - Validates against vertical schema
   - Creates Tenant record (Postgres)
   - Creates initial Blueprint version
   - Publishes blueprint.mutations event
        ↓
6. integration-hub kicks off Meta verification flow:
   - Creates Meta Business Manager via Graph API where possible
   - Generates checklist of human-in-the-loop steps
   - Communicates progress back through Dev
        ↓
7. Once verified, edge-webhook now recognizes the new business
   number → routes to its Business Agent
        ↓
8. Dev sends owner a "you're live!" message + sandbox demo
```

### Path 3: The Daemon Proposes an Action

```
1. daemon-runner wakes up for tenant Acme Auto Parts (every 6 hours)
        ↓
2. Loads:
   - Recent events (last 48 hours): orders, conversations, escalations
   - Tenant compute budget remaining for the day
   - Daemon config from Blueprint
        ↓
3. Runs analyses (each is a small LLM-aided task):
   - Re-engagement: which customers haven't ordered in 60+ days?
   - FAQ patterns: what are repeated unanswered queries?
   - Catalog gaps: what products were searched but not found?
   - Conversation review: which conversations had low confidence or escalations?
        ↓
4. For each opportunity:
   - Generates a Proposal (structured JSON with title, action, target,
     expected impact, draft message)
   - Writes to daemon.proposals topic
        ↓
5. dashboard subscribes — owner sees proposals in their queue
        ↓
6. Owner reviews, approves/rejects/edits
        ↓
7. On approval: action is executed (e.g., broadcast.send capability
   sends the re-engagement messages)
        ↓
8. Outcome events tracked → daemon learns whether proposals are
   accepted (uses this to tune future proposals)
```

---

## Inter-Service Communication Patterns

### Async via Kafka
**Default for everything event-driven:** message ingestion, agent actions, blueprint changes, analytics, audit, daemon proposals.

### Sync HTTP (REST or gRPC)
**Only for direct CRUD and lookups:**
- Agent → blueprint-service (load blueprint)
- Agent → catalog-service (search)
- Dashboard → all business logic services
- Capability workers → integration-hub

### NEVER:
- Service A → Service B → Service C synchronous chains (use events)
- Direct DB access from one service to another's tables (use the owning service's API)

---

## Multi-Tenancy Enforcement

This is critical. Failure here is a data breach.

### Postgres
- Every tenant-scoped table has a `tenant_id` column
- Row-Level Security policies enforced at DB level
- Application sets `SET LOCAL app.tenant_id = '...'` per request
- Code reviews flag any query without explicit tenant scoping

### MongoDB
- Per-tenant database name: `tenant_<uuid>`
- Connection string includes tenant DB explicitly
- No cross-tenant aggregation queries possible by design

### Qdrant
- Per-tenant collection: `tenant_<uuid>_<vector_type>`
- Collections explicitly scoped, not filtered

### Redis
- All keys prefixed with `tenant:<uuid>:`
- Helper library enforces this; bare `redis.set(...)` calls flagged in CI

### Kafka
- Topics partitioned by `tenant_id`
- Consumer groups assigned per-tenant where appropriate

### Logs
- Tenant ID always present in structured logs
- PII (phone numbers, names, emails) is hashed or redacted in logs

---

## Caching Strategy

LLM cost discipline + latency management.

| Layer | What's cached | Where | TTL |
|---|---|---|---|
| Anthropic prompt cache | System prompts, blueprint context | Anthropic-side | 5 min sliding |
| Blueprint | Latest version per tenant | Redis | 5 min, invalidate on mutation |
| Catalog search results | Common queries | Redis | 1 hour |
| Template definitions | All approved templates | Redis | 1 hour |
| Principal lookups | Phone → Principal, handle → Principal | Redis | 1 hour |
| LLM classification calls | "What vertical is this business?" | Postgres + Redis | Permanent (with invalidation) |

**Anthropic prompt caching is the biggest cost lever.** System prompts can be 5–15K tokens (especially with Blueprint context). Caching cuts cost ~90%. Architect prompts to maximize cache hit rate (stable prefix, variable suffix).

---

## Reliability and Failure Modes

### Webhook Reliability
- Meta retries failed webhooks; we must respond with 200 within 20 seconds
- Edge layer responds 200 immediately after persisting to Kafka, regardless of downstream success
- Idempotency by message ID prevents double-processing on retries

### LLM API Failures
- Retry with exponential backoff (3 retries)
- Fallback model: Anthropic primary → Azure OpenAI fallback
- If all fail: escalate to human (mark conversation as needing attention, notify on dashboard)
- **Never** send "sorry I'm having trouble" message to customer — silence is better than visible failure

### Database Failures
- Postgres: read replica for non-critical reads; primary for writes
- Mongo Atlas: managed, multi-zone
- Qdrant: clustered with replication
- Redis: managed (Azure Cache); accept brief unavailability with graceful degradation (skip cache, hit DB)

### Cascading Failures
- Each service has a circuit breaker on its dependencies
- Events accumulate in Kafka if consumers are down — Kafka is the buffer
- Dashboard shows degraded mode if real-time updates fail (poll fallback)

### Cost Runaway
- Per-tenant daily compute budget enforced by cost-tracker
- Alerts at 80% of budget
- Auto-throttle daemon at 90%
- Hard cap at 100% (escalation only, no proactive sends)

---

## Deployment Topology

### Production
- **Marketing site:** Vercel
- **Onboarding web:** Vercel (no tenant data)
- **Dashboard:** AKS, Azure India South region
- **All backend services:** AKS, Azure India South region
- **Databases:** Neon (multi-region with India primary), MongoDB Atlas (Mumbai), Qdrant Cloud (closest region with India support), Azure Cache for Redis (Mumbai)
- **Kafka:** Confluent Cloud (Azure Mumbai)
- **Object storage (Excel uploads, voice notes, images):** Azure Blob Storage (India South)

### Environments
- **dev** — single shared environment for development, ephemeral data
- **staging** — production-like, used for pre-release validation
- **prod** — live customer traffic
- **prod-canary** — fraction of prod traffic for new releases

### Data Residency
- All tenant data stays in India regions (DPDP requirement)
- No cross-region replication outside India
- Backups in Azure India only

See `22_DEPLOYMENT.md` for full infra details (Tier 3).

---

## What This Architecture Optimizes For

1. **Iteration speed.** Prompts and agent flows can be updated in Python without touching the edge or data layers.
2. **Cost control.** Every LLM call is in one service (orchestrator), making it easy to enforce caps and add caching.
3. **Multi-tenancy correctness.** Isolation is enforced at the data layer, not just application code.
4. **Channel agnosticism.** Adding Telegram/Instagram in V2 is a new adapter, not a system rewrite.
5. **Observability.** Event-sourced design means every conversation can be replayed and audited.

## What This Architecture Does *Not* Optimize For

1. **Maximum throughput.** We're not building Twilio. WhatsApp's own rate limits cap us.
2. **Sub-100ms latency.** Conversational, not real-time. p95 of 3 seconds is acceptable.
3. **Infinite horizontal scale.** v1 needs to handle hundreds of tenants well, not millions.
4. **Stateless everywhere.** Conversation state is checkpointed in Mongo — accept that as a trade-off.

---

## What's Deliberately Missing (to be filled in later docs)

- Specific data schemas → `05_DATA_MODEL.md`
- The Blueprint structure → `06_BUSINESS_BLUEPRINT.md`
- Identity model deep-dive → `07_IDENTITY_AND_PRINCIPALS.md`
- Channel adapter interface → `08_CHANNEL_LAYER.md`
- Dev agent prompts and flows → `09_DEV_AGENT.md`
- Capability registry → `11_CAPABILITY_REGISTRY.md`
- Concrete vertical specs → `12_VERTICAL_AUTO_PARTS.md`, `13_VERTICAL_JOBS.md`
- Daemon details → `15_DAEMON.md`
- Frontend specs → `17`–`19`
- Deployment specifics → `22_DEPLOYMENT.md`
- Build sequence → `23_BUILD_SEQUENCE.md`
