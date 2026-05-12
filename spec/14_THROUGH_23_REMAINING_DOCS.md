# 14 — Daemon (Proactive Intelligence Layer)

> The Daemon thinks when no one is talking. It reads events, finds opportunities, proposes actions.

---

## What the Daemon Does

The Daemon is a per-tenant background process that runs every 6 hours (configurable). It:

1. Reads recent conversation events, order history, and catalog state
2. Runs a set of analysis jobs
3. For each finding, generates a structured **Daemon Proposal**
4. Pushes proposals to the dashboard for owner review
5. On approval, executes the action

The Daemon is explicitly **NOT** in the request path. It runs on a separate node pool (spot instances) and can be interrupted without affecting live conversations.

---

## Analysis Jobs

### Job 1: Re-engagement Finder

```python
async def find_reengagement_candidates(tenant_id: str, config: ReengagementConfig) -> List[Proposal]:
    threshold_date = now() - timedelta(days=config.dormancy_threshold_days)
    
    # Find customers who ordered before threshold but not since
    dormant = await order_service.get_dormant_customers(
        tenant_id=tenant_id,
        last_order_before=threshold_date,
        limit=config.max_per_run
    )
    
    if not dormant:
        return []
    
    # Generate a personalized re-engagement draft
    draft_message = await llm.generate(
        model="haiku",
        task="reengagement_message_draft",
        context={
            "business_name": blueprint.identity.business_name,
            "typical_order": summarize_order_history(dormant[:5]),
            "dormancy_days": config.dormancy_threshold_days
        }
    )
    
    return [Proposal(
        type="reengagement",
        title=f"Re-engage {len(dormant)} dormant customers",
        description=f"{len(dormant)} customers haven't ordered in {config.dormancy_threshold_days}+ days",
        action={
            "type": "broadcast",
            "targets": [c.principal_id for c in dormant],
            "message_draft": draft_message
        },
        estimated_impact=f"Potential recovery: ₹{estimate_revenue(dormant):,.0f}"
    )]
```

### Job 2: FAQ Pattern Detector

```python
async def detect_faq_patterns(tenant_id: str) -> List[Proposal]:
    # Get all support agent queries from last 7 days that weren't answered by FAQ
    unanswered = await analytics.get_unanswered_queries(tenant_id, days=7)
    
    # Cluster similar queries
    clusters = await cluster_queries(unanswered)
    
    proposals = []
    for cluster in clusters:
        if cluster.count >= 3:  # only if asked 3+ times
            # Generate FAQ answer
            answer = await llm.generate(
                model="sonnet",
                task="faq_answer_generation",
                question=cluster.representative_query,
                context=blueprint_context
            )
            
            proposals.append(Proposal(
                type="faq_update",
                title=f"Add FAQ: '{cluster.representative_query[:50]}...'",
                description=f"Asked {cluster.count} times this week. No existing FAQ covers it.",
                action={
                    "type": "faq_add",
                    "question": cluster.representative_query,
                    "answer_draft": answer,
                    "similar_queries": cluster.all_queries[:5]
                }
            ))
    
    return proposals
```

### Job 3: Catalog Gap Finder

```python
async def find_catalog_gaps(tenant_id: str) -> List[Proposal]:
    # Find searches that returned zero results
    zero_result_searches = await analytics.get_zero_result_searches(tenant_id, days=7)
    
    proposals = []
    for search in zero_result_searches:
        if search.count >= 2:
            proposals.append(Proposal(
                type="catalog_gap",
                title=f"Add to catalog: '{search.query}'",
                description=f"Customers searched for '{search.query}' {search.count} times — not in catalog.",
                action={
                    "type": "catalog_prompt",
                    "query": search.query,
                    "search_count": search.count
                }
            ))
    
    return proposals
```

### Job 4: Conversation Quality Review

```python
async def review_conversation_quality(tenant_id: str) -> List[Proposal]:
    # Find conversations with: escalations, low confidence flags, negative signals
    poor_conversations = await analytics.get_poor_quality_conversations(tenant_id, days=3)
    
    proposals = []
    for conv in poor_conversations[:5]:  # limit per run
        summary = await llm.generate(
            model="haiku",
            task="conversation_review_summary",
            conversation=conv.messages[-10:]
        )
        
        proposals.append(Proposal(
            type="conversation_review",
            title=f"Review conversation from {format_date(conv.started_at)}",
            description=summary,
            action={
                "type": "review_link",
                "thread_id": conv.thread_id
            }
        ))
    
    return proposals
```

---

## Budget Control

```python
async def run_daemon_for_tenant(tenant_id: str) -> None:
    # Acquire lock (prevent concurrent runs)
    lock_acquired = await redis.set(f"tenant:{tenant_id}:daemon:lock", "running", ex=600, nx=True)
    if not lock_acquired:
        return
    
    try:
        config = blueprint.daemon
        budget_remaining = await cost_tracker.get_daemon_budget_remaining(tenant_id)
        
        all_proposals = []
        
        for job_type in config.enabled_jobs:
            if budget_remaining < MIN_BUDGET_PER_JOB:
                break  # stop if budget nearly exhausted
            
            job_cost_before = await cost_tracker.get_usage_today(tenant_id)
            
            proposals = await run_job(job_type, tenant_id, blueprint)
            all_proposals.extend(proposals)
            
            job_cost_after = await cost_tracker.get_usage_today(tenant_id)
            budget_remaining -= (job_cost_after - job_cost_before)
        
        # Write proposals to DB + Kafka
        for proposal in all_proposals:
            await daemon_service.create_proposal(tenant_id, proposal)
            await kafka.publish("veda.daemon.proposals", proposal.to_event())
    
    finally:
        await redis.delete(f"tenant:{tenant_id}:daemon:lock")
```

---

# 15 — Agent-to-Agent Protocol (V2 Design, v1 Hooks)

> B2B agent transactions: how one business's agent can transact with another's. Designed for V2, hooks built in v1.

---

## Concept

When business A needs something business B provides, their agents can negotiate:

```
Shoe Store Agent (A) needs warehouse space
  → Queries VEDA directory for warehousing businesses
  → Sends structured RFQ to Warehouse Agent (B)
  → Warehouse Agent B responds with Quote
  → Shoe Store Agent A presents quote to owner
  → Owner approves
  → Agents execute: agreement created, calendar invite, payment terms set
  → Human-to-human call scheduled for contract signing
```

---

## A2A Message Schema

```typescript
interface A2AMessage {
  message_id: string;
  from_tenant_id: string;
  to_tenant_id: string;
  thread_id: string;
  message_type: "rfq" | "quote" | "acceptance" | "rejection" | "clarification" | "completion";
  payload: RFQPayload | QuotePayload | AcceptancePayload | ...;
  requires_human_approval: boolean;
  created_at: string;
}

interface RFQPayload {
  category: string;           // "warehousing" | "delivery" | "inventory_supply" | ...
  requirements: object;       // category-specific requirements
  quantity?: number;
  timeline?: string;
  budget_max_inr?: number;
  preferred_location?: string;
}

interface QuotePayload {
  rfq_message_id: string;
  price_inr: number;
  terms: string;
  validity_days: number;
  availability_from?: string;
  notes?: string;
}
```

---

## Trust and Safety

All A2A transactions in v1 (when enabled per tenant) require:
1. Both tenants must be VEDA-verified (not just registered)
2. Both tenants must have A2A capability enabled in their Blueprint
3. Every transaction requires human approval on BOTH sides
4. First transaction between two businesses has an escrow requirement
5. All A2A messages are logged to audit trail

---

## v1 Hooks (What We Build Now for V2)

In v1, we:
- Define the A2A message schema (above)
- Add `a2a.transact` to the capability registry (disabled by default)
- Create the `a2a.transactions` Kafka topic (no producers yet)
- Create Postgres table for A2A threads (empty)
- Add A2A section to Blueprint schema (disabled)
- Write the trust/verification framework spec

We do **not** implement the actual inter-agent messaging or the discovery directory for A2A. That's V2.

---

# 16 — Frontend: Marketing Site

> Public-facing site. SEO-optimized. Converts visitors to signups.

---

## Pages

| Route | Purpose |
|---|---|
| `/` | Hero, how it works, social proof, CTA |
| `/pricing` | Tier comparison, FAQ |
| `/verticals/auto-parts` | Vertical-specific landing |
| `/verticals/jobs` | Vertical-specific landing |
| `/verticals/services` | Vertical-specific landing |
| `/blog` | Content marketing |
| `/about` | Team, mission |
| `/contact` | Enterprise inquiry form |

## Tech Stack

- Next.js 14+ App Router (SSG for most pages, ISR for blog)
- Tailwind + shadcn/ui
- Deployed to Vercel
- Analytics: Posthog (self-hosted on Azure for privacy)

## CTA Flow

Primary CTA: "Start your business on WhatsApp" → /signup
Secondary CTA: "See a demo" → Opens WhatsApp pre-filled "Demo" message to VEDA's number

## Twitter Demo Integration

The marketing site embeds a live Twitter demo widget that shows recent `@veda_bot` interactions in real-time (with permission). This acts as a social proof engine — visitors see real people setting up businesses.

---

# 17 — Frontend: Onboarding Web

> Web-based alternative entry point to WhatsApp-only onboarding. For users who prefer a browser.

---

## Flow

```
1. /signup → Enter phone number (India +91)
2. OTP verification via SMS
3. "Which are you?" → [Business owner / Looking for businesses]
4. Business owner path:
   → Same intake questions as Veda, in web form format
   → Mirrors Veda's WhatsApp intake but in browser
   → At completion: "Your VEDA WhatsApp number is ready. Save it."
   → Redirects to dashboard
5. Consumer path:
   → Search bar → redirects to Veda on WhatsApp with intent pre-filled
```

## Why This Exists

Some enterprise buyers (Priya) prefer web onboarding for initial setup. Some power users want to see everything at once rather than conversationally. The web onboarding mirrors the WhatsApp intake exactly — same Blueprint is generated.

---

# 18 — Frontend: Business Dashboard

> The operational hub for business owners and their teams.

---

## Navigation Structure

```
Sidebar:
├── Overview (home)
├── Conversations
│   ├── Live (with escalation alerts)
│   ├── History
│   └── Shared Inbox
├── Catalog
│   ├── Browse / Edit
│   └── Import
├── Orders
├── Broadcasts
│   ├── Send new
│   └── History
├── Analytics
│   ├── Conversations
│   ├── Revenue
│   └── Catalog performance
├── Veda (proposals from daemon)
├── Blueprint
│   ├── Business info
│   ├── Persona
│   ├── Capabilities
│   └── Integrations
├── Team
└── Settings / Billing
```

## Conversations Page

Real-time conversation viewer with:
- Live feed of active conversations (SSE)
- Filter by: active / escalated / resolved / agent
- Click to open full conversation thread
- "Take over" button → assigns to current operator, switches to human-in-the-loop mode
- Agent confidence score visible per message (for debugging)
- Internal notes on conversations (visible to team only)

```tsx
// Key component
export function ConversationThread({ threadId }: { threadId: string }) {
  const { messages, status } = useConversationStream(threadId);
  const { mutate: takeover } = useTakeoverConversation();
  
  return (
    <div className="flex flex-col h-full">
      <ConversationHeader thread={thread} onTakeover={() => takeover(threadId)} />
      <MessageList messages={messages} />
      {status === "escalated" && <HumanReplyBox threadId={threadId} />}
    </div>
  );
}
```

## Blueprint Editor

Two modes:
- **Visual:** form-based UI that maps to Blueprint fields. Sections match Blueprint schema.
- **Raw YAML:** for power users (Pro+ tier). Direct edit with schema validation.

Every save creates a new Blueprint version. Version history viewer with diff.

## Daemon Proposals (The "Veda" Page)

Card-based UI:

```
┌─────────────────────────────────────────────────────┐
│ 💬 Re-engage 23 dormant customers                    │
│ Last order 60+ days ago. Potential: ₹45,000          │
│                                                     │
│ Draft message:                                      │
│ "Hi [Name]! It's been a while — we have new stock   │
│  that might interest you..."                        │
│                                                     │
│ [Edit message] [Approve & Send] [Dismiss]           │
└─────────────────────────────────────────────────────┘
```

## Tech Specifics

- Next.js 14+ App Router, deployed to AKS (India region, not Vercel)
- Auth.js with phone OTP
- TanStack Query for data fetching
- SSE for real-time conversation updates
- Recharts for analytics
- Deployed on AKS behind Azure Application Gateway

---

# 19 — Observability and Cost Control

---

## OpenTelemetry Setup

Every service exports traces, metrics, and logs via OTel:

```python
# Python services
from opentelemetry import trace
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter

tracer = trace.get_tracer(__name__)

async def catalog_search(tenant_id: str, query: str) -> List[CatalogItem]:
    with tracer.start_as_current_span("catalog.search") as span:
        span.set_attribute("tenant_id", tenant_id)
        span.set_attribute("query_length", len(query))
        # ... implementation
        span.set_attribute("result_count", len(results))
        return results
```

## Key Metrics to Track

| Metric | Alert Threshold |
|---|---|
| Message processing latency p95 | > 5 seconds |
| Agent response latency p95 | > 8 seconds |
| LLM API error rate | > 2% |
| Per-tenant daily cost | > 80% of budget |
| WhatsApp quality rating | Yellow or Red |
| Kafka consumer lag | > 1000 messages |
| Webhook 200 response rate | < 99% |

## Cost Guardrail Implementation

```python
class CostGuardrail:
    async def check_and_record(self, tenant_id: str, estimated_cost_paise: int) -> bool:
        """Returns True if call is allowed, False if budget exceeded."""
        daily_key = f"tenant:{tenant_id}:cost:daily:{today()}"
        
        current = await redis.get(daily_key) or 0
        budget = await get_daily_budget_paise(tenant_id)
        
        if int(current) + estimated_cost_paise > budget:
            await alert_owner_if_first_time_today(tenant_id)
            return False
        
        await redis.incrby(daily_key, estimated_cost_paise)
        await redis.expire(daily_key, 86400 * 2)  # 2 day TTL
        return True
```

---

# 20 — Security and Compliance

---

## DPDP Act (India) Compliance

The Digital Personal Data Protection Act 2023 is now in force. Key obligations:

| Requirement | Implementation |
|---|---|
| Consent before collecting data | Opt-in message before first interaction |
| Purpose limitation | Only collect what's needed for service |
| Data minimization | No PII in logs, vectors, or events |
| Right to access | "What do you know about me?" → Veda returns summary |
| Right to erasure | "Delete my data" → full anonymization flow |
| Data breach notification | Incident response plan, 72-hour notification |
| Data fiduciary registration | Register with Data Protection Board when required |

## Multi-Tenant Security

- Postgres: Row Level Security, `SET LOCAL app.tenant_id` per transaction
- MongoDB: separate database per tenant
- Qdrant: separate collection per tenant
- Redis: namespaced keys per tenant
- Kafka: consumed with tenant_id in payload; consumers validate
- API layer: JWT contains tenant_id, validated against Principal membership on every request

## Secrets Management

All secrets in Azure Key Vault. Services use Managed Identity (no static credentials).

Rotation schedule:
- WhatsApp tokens: when compromised or annually
- Razorpay keys: annually
- Internal service tokens: every 90 days (automated)

## Threat Model (Top 5)

| Threat | Mitigation |
|---|---|
| Tenant data leakage | RLS + separate DBs + code review |
| Prompt injection from customer messages | Input sanitization + sandboxed agent context |
| WhatsApp spam (quality rating) | Broadcast caps, opt-in enforcement, monitoring |
| Fake business agents impersonating others | Verification badge + reputation score (V2) |
| LLM hallucination causing bad orders | Confirmation steps, escalation thresholds, audit log |

---

# 21 — Deployment

---

## Infrastructure Map

```
Azure India South region:
├── AKS Cluster
│   ├── edge-pool (Fastify services)
│   ├── orchestrator-pool (Python agents)
│   ├── workers-pool (capability workers, business logic)
│   ├── daemon-pool (spot instances)
│   └── frontend-pool (dashboard Next.js)
├── Azure Application Gateway (load balancer + WAF)
├── Azure Container Registry
├── Azure Key Vault
├── Azure Blob Storage
├── Azure Cache for Redis
├── Azure Monitor + Log Analytics
└── Confluent Cloud (Kafka) — Mumbai region

Neon Postgres — India region
MongoDB Atlas — Mumbai
Qdrant Cloud — closest India-supported region

Vercel (global CDN):
├── marketing-site (public, no tenant data)
└── onboarding-web (pre-auth flows only)
```

## Kubernetes Resources (per service)

```yaml
# Example: agent-orchestrator deployment
apiVersion: apps/v1
kind: Deployment
metadata:
  name: agent-orchestrator
spec:
  replicas: 2  # start small, autoscale
  template:
    spec:
      containers:
      - name: orchestrator
        image: veda.azurecr.io/agent-orchestrator:latest
        resources:
          requests: { cpu: "500m", memory: "1Gi" }
          limits: { cpu: "2000m", memory: "4Gi" }
        env:
        - name: ANTHROPIC_API_KEY
          valueFrom:
            secretKeyRef: { name: veda-secrets, key: anthropic-api-key }
---
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: agent-orchestrator-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: agent-orchestrator
  minReplicas: 2
  maxReplicas: 20
  metrics:
  - type: External
    external:
      metric:
        name: kafka_consumer_lag
        selector:
          matchLabels: { topic: "veda.messages.inbound" }
      target: { type: AverageValue, averageValue: "100" }
```

## CI/CD Pipeline

```yaml
# .github/workflows/deploy.yml (simplified)
on:
  push:
    branches: [main]

jobs:
  build-and-deploy:
    steps:
    - name: Build images
      run: docker build -t $ACR/$SERVICE:$SHA .
    
    - name: Push to ACR
      run: docker push $ACR/$SERVICE:$SHA
    
    - name: Deploy to staging
      run: kubectl set image deployment/$SERVICE $SERVICE=$ACR/$SERVICE:$SHA -n staging
    
    - name: Run smoke tests
      run: pytest tests/smoke/ --env=staging
    
    - name: Deploy to prod-canary (10%)
      run: kubectl apply -f k8s/canary-$SERVICE.yaml
    
    - name: Monitor for 1 hour
      run: ./scripts/monitor-canary.sh 3600
    
    - name: Promote to prod
      if: success()
      run: kubectl apply -f k8s/prod-$SERVICE.yaml
```

---

# 22 — Build Sequence

> Sprint-by-sprint delivery plan. Each sprint is 2 weeks. Designed for 1-2 engineers (founder + one hire or Claude Code heavily assisted).

---

## Phase 0: Setup (Week 0, before Sprint 1)

- [ ] Provision Azure account, AKS cluster (dev environment only)
- [ ] Provision Neon Postgres, MongoDB Atlas, Qdrant Cloud, Redis
- [ ] Provision Confluent Kafka (dev cluster)
- [ ] Create GitHub repo with monorepo structure
- [ ] Set up Azure Container Registry
- [ ] Set up Meta Business Manager + get WhatsApp Business API test number
- [ ] Set up Razorpay test account
- [ ] Deploy basic CI pipeline

---

## Sprint 1 (Weeks 1-2): Foundation

**Goal: A message can flow from WhatsApp to an LLM and back.**

- [ ] `edge-webhook`: Fastify app, WhatsApp webhook receiver, signature verification, idempotency
- [ ] `edge-sender`: WhatsApp outbound sender, 24-hour window check
- [ ] Channel adapter: WhatsApp inbound/outbound translation to canonical format
- [ ] Kafka: basic producer/consumer setup, `veda.messages.inbound` and `veda.messages.outbound` topics
- [ ] `identity-service`: Principal lookup/create, phone number resolution
- [ ] Postgres schema: `core.principals`, `core.identifiers`, `core.tenants` (minimal)
- [ ] `agent-orchestrator`: stub that receives a canonical message, calls Claude, sends back a text response
- [ ] **Done criteria:** WhatsApp message → Kafka → Claude response → WhatsApp reply (end-to-end, hardcoded tenant)

---

## Sprint 2 (Weeks 3-4): Blueprint + Catalog

**Goal: Business Blueprint is live, catalog can be loaded and searched.**

- [ ] Full Postgres schema (all schemas from `05_DATA_MODEL.md`)
- [ ] `blueprint-service`: CRUD, versioning, mutation events
- [ ] `catalog-service`: CRUD, CSV import, MongoDB storage
- [ ] Qdrant setup: per-tenant collection creation, embedding pipeline
- [ ] `catalog.search` capability: hybrid text + vector search
- [ ] `catalog.bulk_import` capability: Excel/CSV parsing
- [ ] Manual Blueprint creation for pilot (father's auto parts) — no Veda onboarding yet
- [ ] **Done criteria:** Manually create a Blueprint for auto parts business. WhatsApp customer asks "brake pads for Swift Dzire" → agent searches catalog → returns results.

---

## Sprint 3 (Weeks 5-6): Auto Parts Happy Path

**Goal: Full end-to-end purchase flow for auto parts pilot.**

- [ ] Transaction Agent: cart, checkout flow
- [ ] `payment.razorpay.create_link` capability
- [ ] Razorpay webhook receiver
- [ ] Order service + state machine
- [ ] Support Agent: FAQ retrieval, escalation
- [ ] Owner recognition (admin mode when owner messages their agent)
- [ ] Admin Agent: basic price update, catalog add via WhatsApp
- [ ] Dashboard (minimal): conversation viewer only, real-time via SSE
- [ ] **Done criteria:** Customer messages auto parts agent → finds brake pads → selects → pays via Razorpay → gets confirmation. Owner can view this in dashboard.

---

## Sprint 4 (Weeks 7-8): Veda Meta-Agent + Onboarding

**Goal: A new business can be onboarded by talking to Veda.**

- [ ] Veda agent: greeting, language detection, mode detection
- [ ] Auto parts intake question tree
- [ ] Blueprint draft creation from intake
- [ ] Meta verification guidance flow (conversational)
- [ ] Cross-channel identity + linking codes
- [ ] `blueprint.drafts` table + completion tracking
- [ ] **Done criteria:** A new auto parts business owner messages Veda → completes intake → Blueprint is created → test conversation with their agent works.

---

## Sprint 5 (Weeks 9-10): Dashboard + Twitter

**Goal: Dashboard is usable. Twitter bot is live.**

- [ ] Dashboard: full conversation viewer, shared inbox, escalation handling
- [ ] Dashboard: catalog management UI
- [ ] Dashboard: Blueprint editor (visual mode)
- [ ] Dashboard: basic analytics (message count, order count, revenue)
- [ ] Auth.js setup for dashboard
- [ ] Twitter channel adapter (`channel-twitter`)
- [ ] Veda on Twitter: @mention handler, basic onboarding start, CCI linking
- [ ] Twitter demo flow: describe business → 24-hour demo sandbox
- [ ] Marketing site: landing page, pricing page
- [ ] **Done criteria:** Auto parts pilot is live on Twitter + WhatsApp. Dashboard shows live conversations. Anu can start a business via Twitter and get a WhatsApp demo.

---

## Sprint 6 (Weeks 11-12): Daemon + Jobs Vertical

**Goal: Daemon is running. Jobs vertical pilot is integrated.**

- [ ] Daemon runner: all 4 job types
- [ ] Daemon proposals: dashboard UI, approve/reject flow
- [ ] Broadcast capability: `broadcast.send` with opt-in check
- [ ] Jobs vertical: ATS API integration framework
- [ ] Jobs vertical: candidate profile loading, job search, application flow
- [ ] Jobs intake question tree
- [ ] Scheduling capability (for interview scheduling)
- [ ] **Done criteria:** Daemon proposes re-engagement messages for dormant auto parts customers. Jobs pilot candidate can search jobs, apply, and get status updates via WhatsApp.

---

## Sprint 7 (Weeks 13-14): Polish, Billing, Launch Prep

**Goal: Production-ready for paying customers.**

- [ ] Billing: Razorpay subscriptions for VEDA's own billing
- [ ] Tier enforcement: free/starter/growth capability limits
- [ ] LLM cost tracking and per-tenant budget enforcement
- [ ] Observability: OTel, Azure Monitor, Grafana dashboards
- [ ] Security audit: RLS verification, penetration test on webhooks
- [ ] DPDP compliance: consent flows, erasure flow
- [ ] Performance testing: load test webhook endpoint and agent orchestrator
- [ ] Production environment setup (separate from dev/staging)
- [ ] Onboarding web (basic version)
- [ ] **Done criteria:** 5+ real businesses onboarded and paying. System handles 1,000 messages/day reliably. Billing working.

---

## Repository Structure

```
/veda (monorepo)
├── apps/
│   ├── edge/                    # TypeScript, Fastify — webhooks + sender
│   ├── orchestrator/            # Python, LangGraph — agent brain
│   ├── blueprint-service/       # Python, FastAPI
│   ├── catalog-service/         # Python, FastAPI
│   ├── order-service/           # Python, FastAPI
│   ├── identity-service/        # Python, FastAPI
│   ├── team-service/            # Python, FastAPI
│   ├── integration-hub/         # Python, FastAPI
│   ├── daemon/                  # Python, scheduled
│   ├── dashboard/               # Next.js, TypeScript
│   ├── marketing-site/          # Next.js, TypeScript
│   └── onboarding-web/          # Next.js, TypeScript
├── packages/
│   ├── shared-types/            # TypeScript types shared across TS apps
│   ├── kafka-client/            # Shared Kafka producer/consumer utils
│   ├── channel-adapters/        # WhatsApp, Twitter adapters
│   └── llm-router/             # Python package for LLM routing
├── capabilities/                # Python capability implementations
│   ├── catalog/
│   ├── payment/
│   ├── broadcast/
│   ├── scheduling/
│   ├── media/
│   └── integration/
├── spec/                        # This directory
├── k8s/                         # Kubernetes manifests
├── .github/workflows/           # CI/CD
└── docker-compose.yml           # Local development
```

---

# 23 — Open Questions

> Decisions not yet made. Update this file as decisions are reached.

---

## High Priority (must resolve before Tier 2 build begins)

| # | Question | Context | Decision |
|---|---|---|---|
| OQ-01 | Final brand name | "VEDA" is placeholder. Founder to provide name + meaning. | PENDING |
| OQ-02 | Which smaller jobs platform for v1 pilot? | Naukri is long sales cycle. Need Apna/Hirect/regional consultancy as first logo. | PENDING |
| OQ-03 | Sarvam AI — trial account needed | Need API key to test Indic language quality vs Sonnet | PENDING |

## Medium Priority (resolve before Sprint 4)

| # | Question | Context | Default |
|---|---|---|---|
| OQ-04 | Free tier limits | How many conversations/day on free tier? | 50/day, Haiku only |
| OQ-05 | Growth tier pricing | ₹X/month for Growth? | Recommend ₹7,999/month |
| OQ-06 | Enterprise pricing model | Per-conversation or flat? | Flat + per-conversation overage |
| OQ-07 | Twitter API tier | Basic ($200/mo) limits: ~50 meaningful interactions/day. Acceptable for v1? | Yes, acceptable |
| OQ-08 | Tally integration depth | Tally has no proper API. Export-only (owner sends Excel) or Tally ODBC connector? | Export-only for v1 |

## Lower Priority (V2 decisions)

| # | Question | Context |
|---|---|---|
| OQ-09 | On-prem deployment | Enterprise customer may require. Architecture supports it. Trigger: one deal requires it. |
| OQ-10 | Open-source LLM | Cost reduction at scale. Trigger: infra cost > LLM cost for any tenant. |
| OQ-11 | A2A escrow provider | Razorpay has escrow product. Evaluate when A2A is ready. |
| OQ-12 | SOC 2 Type II | Required for US enterprise customers. Start audit process at Series A. |
| OQ-13 | International expansion | First international market: UAE or Singapore? Decide at Series A. |
| OQ-14 | WhatsApp native commerce | Meta's built-in product catalog and payments. Evaluate vs our own commerce layer. |

---

*This document is living. Add new questions as they arise during build. Delete (or move to decided) when resolved.*
