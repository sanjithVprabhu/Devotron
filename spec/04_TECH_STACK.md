# 04 — Tech Stack

> Every stack choice with explicit rationale, what was rejected and why, and what triggers a v2 reconsideration. **When tempted to add a new technology, read this first.**

---

## Stack Summary

```
LANGUAGES:    TypeScript (Node.js 20+), Python 3.11+
FRAMEWORKS:   Fastify (TS edge), FastAPI (Python services), Next.js 14+ (App Router)
AGENT FRAME:  LangGraph (Python)
LLMs:         Anthropic Claude (Sonnet primary, Haiku for cheap classification)
              Azure OpenAI (fallback for resilience)
EVENT BUS:    Kafka (Confluent Cloud on Azure)
DATABASES:    Neon Postgres • MongoDB Atlas • Qdrant Cloud • Azure Cache for Redis
STORAGE:      Azure Blob Storage (India South region)
DEPLOYMENT:   AKS (backend + dashboard) + Vercel (marketing) + India South region
AUTH:         Auth.js (NextAuth) for dashboard, custom Principal model for chat identity
CI/CD:        GitHub Actions → Azure Container Registry → AKS
OBSERVAB.:    OpenTelemetry → Azure Monitor + Grafana Cloud
SECRETS:      Azure Key Vault
PAYMENTS:     Razorpay (India) + Stripe (international, V2)
```

---

## Languages

### TypeScript (Node.js 20+)

**Used for:**
- Edge layer (webhooks, channel adapters, outbound sender)
- All three frontends (marketing, onboarding, dashboard)
- Background jobs that don't touch agent reasoning (BullMQ workers)

**Rationale:**
- WhatsApp/Twitter SDKs have first-class TypeScript support
- Frontend and edge layer in same language → shared types via Zod schemas
- Strong typing catches integration bugs early
- Async I/O model fits webhook-style workloads

**Conventions:**
- Strict mode on
- `import type` for type-only imports
- Zod for runtime validation at every boundary (HTTP, Kafka, DB)
- No `any` without an inline justification comment
- Prettier + ESLint, enforced in CI

### Python 3.11+

**Used for:**
- Agent orchestration (LangGraph)
- All business logic services (FastAPI)
- Capability workers
- Daemon
- Analytics

**Rationale:**
- The agent ecosystem (LangGraph, LangChain, LlamaIndex, Pydantic-AI, DeepEval, Ragas) lives here. Trying to do this in TypeScript or Rust costs months of maturity.
- Anthropic SDK is excellent in Python
- FastAPI gives type-checked APIs comparable to TypeScript ergonomics
- Easier to find Python LLM engineers than Rust LLM engineers

**Conventions:**
- Type hints on every function signature
- Pydantic v2 for all data models
- `ruff` for linting, `black` for formatting, both in CI
- `pytest` + `pytest-asyncio` for tests
- `uv` for dependency management (faster than pip/poetry)

### What's Rejected

**Rust:** Acknowledged as the founder's preferred language and a long-term option. **Not in v1.** Reasons:
1. The agent ecosystem in Rust (Rig, Swiftide) is years behind Python — using it imposes a self-tax
2. Operating two languages is hard; three is operationally lethal at small team size
3. WhatsApp's per-number throughput cap (~80 msg/sec) means Node/Fastify is more than sufficient for the edge layer
4. Prompt iteration speed matters far more than runtime perf for the next 6–12 months

**v2 trigger for Rust:** any of:
- Edge layer sustained throughput > 500 msg/sec across all tenants
- Agent orchestrator p99 latency > 3s and profiling shows CPU bound (not LLM bound)
- Cost per conversation dominated by infra not LLM
- Series A funding allows a polyglot team

When triggered, the rewrite candidates in priority order are:
1. `edge-webhook` and `edge-sender` (cleanest replacement, lowest risk)
2. The Supervisor / Router within the agent orchestrator (after prompts stabilize)

**Go:** Rejected for the same reasons as Rust but with less upside. Go's agent ecosystem is also weak.

**Java/Kotlin:** Rejected. JVM operational footprint not worth it at this team size.

---

## Frameworks

### Fastify (TypeScript edge layer)

**Why Fastify over Express:**
- Faster (JSON parsing/serialization)
- First-class TypeScript support
- Better plugin architecture (auth, rate limiting, validation)
- Schema-first request validation matches our Zod approach

### FastAPI (Python services)

**Why FastAPI over Flask/Django:**
- Async by default
- Pydantic-native (type hints become validation)
- Auto-generated OpenAPI specs
- Best Python framework for the agent era

### LangGraph (Python agent orchestration)

**Why LangGraph over LangChain:**
- Graph-based agent flows match our Supervisor + Sub-Agent architecture exactly
- Built-in state checkpointing (we use this for conversation persistence)
- Supports human-in-the-loop interrupts (critical for owner approval flows)
- Sane multi-agent coordination primitives
- Active maintenance, large community

**Why LangGraph over alternatives (CrewAI, AutoGen):**
- LangGraph: lower-level, more control. Right choice for production systems.
- CrewAI: too opinionated, conflated abstractions
- AutoGen: research-grade, less production-ready

**What we don't use:**
- LangChain itself for Anthropic API calls (use SDK directly — fewer layers, easier to debug)
- LangSmith (evaluate alternatives like Braintrust or DeepEval; LangSmith pricing scales poorly)

### Next.js 14+ App Router (all frontends)

**Why Next.js:**
- Founder familiarity (stated requirement)
- Server Components reduce client JS payload (matters for marketing site SEO)
- App Router is the future direction
- React Server Actions for dashboard mutations (less API boilerplate)
- Vercel deployment is excellent for marketing site

**What we use within Next.js:**
- **shadcn/ui** for components (copy-paste, owned, no library lock-in)
- **Tailwind** for styling
- **TanStack Query** for client-side data fetching
- **Zustand** if global state needed (likely minimal)
- **Recharts or Tremor** for analytics charts
- **react-hook-form + Zod** for forms
- **next-intl** for i18n (Hindi support in dashboard from day one)

---

## LLM Providers

### Anthropic Claude (Primary)

**Models:**
- **Claude Sonnet 4.6** — primary reasoning, agent supervision, complex tool calling
- **Claude Haiku 4.5** — cheap classification (e.g., "is this a product inquiry or a support ticket?"), routing decisions, summarization

**Rationale:**
- Best-in-class for agent / tool-use workloads
- Excellent prompt caching (90% discount on cached tokens) — critical for cost
- Native multi-modal (handles voice transcription pipelines well, image analysis for product photos)
- 200K context window allows substantial Blueprint context inline
- Anthropic's safety posture aligns with consumer-facing product

### Azure OpenAI (Fallback)

**Models:** GPT-4o, GPT-4o-mini

**Rationale:**
- Resilience: if Anthropic has an outage, we can fall back without service interruption
- Already on Azure (existing credits, no new vendor relationship)
- Different failure modes than Anthropic — true diversification

**Usage pattern:** Active-passive. All requests go to Anthropic by default. Fallback triggered by:
- Anthropic API errors > 3 retries
- Anthropic latency > circuit breaker threshold
- Manual flag during incidents

### What's Rejected

**OpenAI direct (not Azure):** Use Azure OpenAI instead — same models, but covered by Azure data residency and our existing credits.

**Open-source models (Llama, Mistral) self-hosted:** Considered for v2. Not v1 because:
- Operational overhead of running GPUs
- Quality gap on agent/tool-use workloads is real
- Cost win is uncertain at our scale

**Local Ollama:** For development only, never production.

---

## Event Bus

### Kafka (Confluent Cloud on Azure)

**Why Kafka:**
- Battle-tested for event-sourced architectures
- Tenant partitioning gives us ordered per-tenant processing
- Consumer groups allow horizontal scaling of agent orchestrator
- Long retention (7+ days) enables replay for debugging
- Schema registry support

**Why Confluent Cloud:**
- Managed = less ops burden
- Available in Azure Mumbai region (data residency)
- Schema registry included
- ksqlDB available if we need it later

### What's Rejected

**Azure Service Bus:** Considered. Rejected because:
- Less suited for high-throughput event sourcing
- Weaker partitioning model
- Smaller ecosystem of tools

**RabbitMQ:** Considered. Rejected because:
- Not optimized for event sourcing
- We'd lose long retention and replay

**NATS / Redpanda:** Promising but smaller ecosystems. Confluent is safer for v1.

---

## Databases

### Neon Postgres (Primary OLTP)

**What lives here:**
- Tenants, principals, blueprints (versioned), conversation metadata
- Orders, transactions, audit log, billing
- Team and permissions

**Why Neon:**
- Founder has access (stated)
- Serverless model fits unpredictable traffic
- Branching is great for development environments
- Standard Postgres — no lock-in
- Available with India region support

**Schema management:** Drizzle ORM (TypeScript side) + SQLAlchemy (Python side) both pointing at the same DB. Migrations via Drizzle as the source of truth (TypeScript schema definitions are easier to review).

### MongoDB Atlas (Heterogeneous & High-Cardinality)

**What lives here:**
- Per-tenant catalogs (schema varies by vertical)
- Raw conversation message blobs (full message content with media references)
- Agent state checkpoints (LangGraph)
- Per-tenant analytics aggregates with high cardinality

**Why MongoDB:**
- Schema flexibility is necessary for vertical-agnostic catalogs (auto parts ≠ jobs ≠ courses)
- Per-tenant database isolation is clean
- Atlas is fully managed, available in Mumbai
- Native time-series collection support useful for message analytics

**Why not just JSONB in Postgres?**
- Per-tenant DB isolation is harder to enforce with shared tables
- Mongo's query model fits document-heavy workloads better
- We don't need cross-tenant aggregation on these datasets — that's a Postgres concern

### Qdrant (Vector DB for RAG)

**What lives here:**
- Per-tenant collections of catalog embeddings (for semantic product search)
- Per-tenant collections of FAQ embeddings (for support agent retrieval)
- Per-tenant collections of conversation history embeddings (for memory)

**Why Qdrant:**
- Founder has access (stated)
- Self-hostable if needed
- Excellent filtering (per-tenant, per-collection scoping enforced naturally)
- Good Python client

**Embeddings model:** Anthropic embeddings (when GA) or OpenAI `text-embedding-3-small` via Azure OpenAI in the meantime.

### Redis (Azure Cache)

**What lives here:**
- Active conversation session state (short-lived)
- WhatsApp 24-hour window expiry timers
- Idempotency keys (webhook deduplication)
- Rate limiting counters
- Cache for blueprints, templates, principal lookups

**Why Azure Cache for Redis:**
- Managed
- Available in Mumbai
- Standard Redis API

**Eviction policy:** allkeys-lru with appropriate TTLs on all keys.

### What's Rejected

**Single Postgres for everything:** Tempting, but heterogeneous catalogs would force JSONB-everywhere, losing Postgres benefits. Vector workloads are also better served by a dedicated vector DB.

**DynamoDB:** Not on Azure path; we'd be cross-cloud for no reason.

**ElasticSearch / OpenSearch:** Considered for catalog search. Decided to use Postgres FTS + Qdrant vector hybrid in v1; revisit if quality insufficient.

**Pinecone (instead of Qdrant):** More expensive, less control, weaker filtering. Qdrant wins.

---

## Storage

### Azure Blob Storage (India South region)

**What's stored:**
- Voice notes (inbound from customers, persisted for transcription + audit)
- Image uploads (product photos, ID proofs during onboarding)
- Excel/CSV catalog uploads
- Generated reports (PDF exports, CSVs for download)
- Backups

**Access pattern:** Pre-signed URLs for direct upload from frontend (no backend bandwidth cost). Lifecycle policies for tiering (hot → cool → archive) over time.

---

## Deployment

### Azure Kubernetes Service (AKS) — India South region

**What runs here:**
- All backend services (edge, orchestrator, business logic, daemon, capability workers)
- Dashboard frontend (`dashboard-web` Next.js)
- Onboarding web (when it touches tenant data)

**Why AKS:**
- Existing Azure credits
- India region for DPDP compliance
- Standard Kubernetes — portable if we ever leave Azure
- Good integration with Azure Monitor, Key Vault, Container Registry

**Cluster topology:**
- Multi-AZ within India South
- Node pools separated by workload class (edge, orchestrator, daemon, frontend)
- Daemon pool can use spot instances for cost (workload is interruptible)
- Autoscaling on CPU/memory + custom metrics (Kafka lag for agent orchestrator)

### Vercel — Marketing Site

**Why Vercel for marketing only:**
- Best-in-class for static + ISR Next.js sites
- Edge caching globally → SEO + speed
- Free tier sufficient initially
- No tenant data on this site → no DPDP concern with US deployment

**Why NOT Vercel for dashboard:**
- Tenant data must stay in India region
- Vercel doesn't have India region for serverless functions
- Going through Vercel + AKS backend is one extra hop

---

## Authentication

### Dashboard Auth — Auth.js (NextAuth) v5

**Why Auth.js:**
- Free, open-source, unopinionated
- Multiple providers (email magic link, Google OAuth, eventually phone OTP for India)
- Session management built-in
- Works well with Next.js App Router

**Phone OTP for Indian SMB owners:**
- Use MSG91 or similar for SMS OTP
- Custom NextAuth provider

### Chat Identity — Custom Principal Model

Phone numbers (WhatsApp) and Twitter handles are Identifiers that resolve to Principals. No traditional "authentication" — the channel itself authenticates (Meta has verified the phone is the user's). See `07_IDENTITY_AND_PRINCIPALS.md`.

### What's Rejected

**Clerk:** Excellent product but expensive at scale and limited self-hosting. Auth.js is enough.

**Custom JWT:** Reinventing wheels. Auth.js handles this.

---

## CI/CD

### GitHub Actions

**Pipeline:**
1. PR opened → lint, type-check, unit tests run
2. PR merged to main → build container images, push to Azure Container Registry
3. Auto-deploy to staging environment
4. Manual promote to prod-canary (10% traffic)
5. Auto-promote to prod after 1 hour with no SLO violations
6. Rollback button always available

**Why GitHub Actions over Azure Pipelines:**
- Better DX, better community
- Code lives on GitHub anyway
- Easier to onboard contractors

---

## Observability

### OpenTelemetry → Azure Monitor + Grafana Cloud

**What we instrument:**
- HTTP requests (incoming webhooks, internal service calls)
- Kafka producer/consumer latency
- LLM call latency, token counts, costs
- Database query times
- Agent decision points (which sub-agent picked, why)

**Why this combo:**
- OTel is vendor-neutral (avoid lock-in)
- Azure Monitor is included with our infra
- Grafana Cloud for dashboards and alerting (better UX than Azure Monitor's UI)

**Trace context propagation:**
- Every Kafka message carries trace context in headers
- Agent decisions traced end-to-end (webhook → Kafka → orchestrator → tool calls → outbound)

### Cost Tracking

Custom layer — every LLM call goes through a wrapper that:
- Records tenant_id, model, input_tokens, output_tokens, cached_tokens
- Computes cost (live pricing tables)
- Publishes to `billing.usage` Kafka topic
- Updates Redis counter for daily budget checking
- Alerts on threshold crossings

---

## Secrets Management

### Azure Key Vault

**What lives here:**
- Anthropic API keys
- Azure OpenAI keys
- Meta WhatsApp Business API tokens
- Twitter API tokens
- Razorpay keys
- Database connection strings
- Internal service-to-service auth tokens

**Access pattern:** AKS workloads use Azure AD Workload Identity to fetch secrets at runtime. No secrets in env vars or config files.

---

## Why We Picked These Trade-offs (Summary)

| Principle | Resulting Choice |
|---|---|
| Iteration speed > runtime perf for v1 | Python over Rust |
| Two languages max | TS + Python, no Go/Java/Rust |
| Best-in-class agent ecosystem | Python + LangGraph |
| Cost discipline as first-class | Anthropic prompt caching, custom cost tracker |
| India-first, DPDP-compliant | Azure India region for all tenant data |
| Multi-tenancy correctness | Postgres RLS + per-tenant DBs/collections |
| Founder familiarity | Next.js for frontends |
| Don't reinvent wheels | Auth.js, shadcn/ui, Drizzle |
| Plan for the rewrite | Service boundaries that allow Rust replacement later |

---

## What Will Change in V2

Anticipated changes in 12–18 months, listed so we don't accidentally lock them out:

- **Edge layer rewritten in Rust** (when throughput justifies it)
- **Open-source LLM self-hosted** for some workloads (cost reduction)
- **Telegram + Instagram channels added** (channel adapter pattern handles this)
- **A2A protocol live** (hooks already in v1)
- **On-prem deployment option** for a single enterprise customer (architecture supports it)
- **International expansion** — multi-region deployment, multi-currency
