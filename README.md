# DEVOTRON

> Bring any business to life on WhatsApp through conversation, not configuration.

DEVOTRON is a conversational agent platform: a meta-agent named **DEVOTRON** interviews business owners, generates a versioned **Business Blueprint**, and stands up a per-tenant agent that runs the business end-to-end on WhatsApp (and Twitter). See [`spec/`](./spec/) for the full architectural specification.

## Repo layout

```
veda/
  apps/
    edge/                # TypeScript, Fastify — WhatsApp + Twitter webhooks + outbound sender
    orchestrator/        # Python, LangGraph — Veda + per-tenant Business Agents (7-site harness)
    blueprint-service/   # Python, FastAPI — versioned Blueprint CRUD + mutations
    catalog-service/     # Python, FastAPI — per-tenant catalogs (Mongo + Qdrant)
    order-service/       # Python, FastAPI — order state machine, Razorpay coordination
    identity-service/    # Python, FastAPI — Principals, identifiers, linking codes
    team-service/        # Python, FastAPI — memberships, invites, permissions
    template-service/    # Python, FastAPI — WhatsApp template lifecycle
    integration-hub/     # Python, FastAPI — Razorpay, Shopify, ATS, crawl, API sandbox
    daemon/              # Python — proactive intelligence loop (re-engagement, FAQ gaps, etc.)
    dashboard/           # Next.js 15 — login, conversations, catalog, orders, blueprint, team
    marketing-site/      # Next.js — public landing pages (Vercel)
    onboarding-web/      # Next.js — web alternative to WhatsApp-only onboarding
  packages/
    shared-types/        # TypeScript — canonical messages, Blueprint Zod, Kafka event schemas
    kafka-client/        # TypeScript — typed producer/consumer wrapper
    llm-router/          # Python — OpenAI/Anthropic/Azure/mock router with caching and budgets
    python-shared/       # Python — shared infra (Pydantic models, db clients, OTel, Kafka)
  capabilities/          # Python — capability workers (catalog.search, payment.razorpay, etc.)
  db/                    # Drizzle migrations and seed scripts (Postgres source of truth)
  k8s/                   # Kustomize manifests (base + dev/staging/prod overlays)
  scripts/               # Demo helpers (simulate-whatsapp.ts, etc.)
  spec/                  # Authoritative specification — read this first
```

## End-to-end demo (no external API keys required)

This path runs the entire stack locally with the **mock LLM provider** so you can drive a customer message all the way through to the dashboard without an OpenAI/Anthropic/Meta key.

```bash
# 1. Copy the env template
cp .env.example .env

# 2. Set the LLM provider to mock (one line in .env)
echo 'LLM_DEFAULT_PROVIDER=mock' >> .env

# 3. Bring up local infra (Postgres, Mongo, Redis, Qdrant, Redpanda, Azurite)
docker compose up -d

# 4. Install JS workspaces + Python deps
corepack enable && pnpm install
pip install uv && uv sync

# 5. Apply migrations + seed (creates the Acme Auto Parts tenant + a v1 blueprint
#    + an owner email rajesh@acme.local for dashboard login)
pnpm --filter @veda/db migrate
pnpm --filter @veda/db seed

# 6. Start the stack — every service in its own terminal (or use a process manager)
pnpm --filter @veda/edge dev                                  # :8080
pnpm --filter @veda/dashboard dev                             # :3001
uv run --package veda-orchestrator uvicorn orchestrator.main:app --port 8081
uv run --package veda-blueprint-service uvicorn blueprint_service.main:app --port 8084
uv run --package veda-catalog-service uvicorn catalog_service.main:app --port 8085
uv run --package veda-order-service uvicorn order_service.main:app --port 8086
uv run --package veda-identity-service uvicorn identity_service.main:app --port 8083
uv run --package veda-team-service uvicorn team_service.main:app --port 8087
uv run --package veda-daemon uvicorn daemon.main:app --port 8082
```

### What you can do now

**Sign in to the dashboard**
1. Open <http://localhost:3001> → redirects to `/login`
2. Enter `rajesh@acme.local` (the seeded owner email)
3. Watch the dashboard server console — the OTP is printed in a banner box
4. Enter the 6-digit code → you land on the Overview page for Acme Auto Parts

**Drive a customer message through the agent**
```bash
pnpm tsx scripts/simulate-whatsapp.ts "Hi, I need brake pads for Swift Dzire"
```
This posts a Meta-shaped webhook to the edge layer. The flow:
- edge verifies the (skipped-in-dev) signature and publishes to Kafka
- orchestrator consumes, loads the Acme blueprint, runs the harness loop
- the mock LLM emits canned XML; the harness dispatches `<call>` tags through capabilities, accumulates `<say>`, finalises the turn
- conversation appears live on the **Conversations** page (4-second polling)

**Hit Postman directly**
Every dashboard data flow has a JSON BFF endpoint:
- `POST /api/auth/start` `{email}` — kicks off OTP flow (code printed to console)
- `POST /api/auth/verify` `{email, code}` — sets the session cookie
- `GET /api/conversations` — list threads
- `GET /api/conversations/{id}` — thread with messages from Mongo
- `GET /api/catalog` / `POST /api/catalog` / `DELETE /api/catalog/{id}`
- `GET /api/orders` / `POST /api/orders/transition` `{order_id, to_status}`
- `GET /api/proposals` / `POST /api/proposals/{id}/approve|reject`
- `GET /api/blueprint` / `POST /api/blueprint` `{content, mutation_reason}`
- `GET /api/team` / `POST /api/team/invite` `{email|phone, role}`
- `GET /api/tenant` / `POST /api/tenant` `{tenant_id}` (switch business)

**Trigger the daemon manually**
```bash
curl -X POST http://localhost:8082/run/11111111-1111-1111-1111-111111111111
```
Returns `{ proposals: N }`. They show up on the **Veda proposals** page where you can approve/dismiss.

## LLM provider switching

Default is **direct OpenAI** (`gpt-4o` for reasoning, `gpt-4o-mini` for cheap classification). All other providers stay available — the `complete()` call falls through the chain on failure.

| `LLM_DEFAULT_PROVIDER` | Required env |
|---|---|
| `openai` (default) | `OPENAI_API_KEY` |
| `anthropic` | `ANTHROPIC_API_KEY` |
| `azure_openai` | `AZURE_OPENAI_API_KEY`, `AZURE_OPENAI_ENDPOINT` |
| `mock` | none — emits canned harness XML for keyless demos |

Per-task overrides live in `packages/llm-router/llm_router/router.py` → `TASK_ROUTES`.

## Going to production

1. Provision **Neon Postgres**, **MongoDB Atlas**, **Qdrant Cloud**, **Azure Cache for Redis**, **Confluent Kafka**.
2. Provision **Meta WhatsApp Business Cloud API** + a phone number; set `META_*` and `VEDA_*` env vars.
3. Set `OPENAI_API_KEY`. Optionally `ANTHROPIC_API_KEY` for fallback.
4. Set `RAZORPAY_*` for payment links, `AZURE_SPEECH_KEY` for voice transcription, `AZURE_BLOB_CONNECTION_STRING` for media.
5. Set `SESSION_SECRET` to a random 32-byte hex for the dashboard.
6. Deploy with the manifests in [`k8s/`](./k8s/).

## Documentation

- **Vision**: [`spec/00_VISION.md`](./spec/00_VISION.md)
- **Architecture**: [`spec/03_SYSTEM_ARCHITECTURE.md`](./spec/03_SYSTEM_ARCHITECTURE.md)
- **Data model**: [`spec/05_DATA_MODEL.md`](./spec/05_DATA_MODEL.md)
- **Harness (Yggdrasil core_loop)**: [`yggdrasil/core_loop.md`](./yggdrasil/core_loop.md)
- **For Claude Code**: [`CLAUDE.md`](./CLAUDE.md)

## Status

| Phase | Status |
|---|---|
| Phase 0 — Monorepo, shared types, Postgres schema | ✅ done |
| Sprint 1 — Edge + Kafka + orchestrator skeleton | ✅ done |
| Sprint 2 — Blueprint + Catalog + capabilities | ✅ done |
| Sprint 3 — Order flow + escalation | ✅ done |
| Sprint 4 — Veda meta-agent intake | ✅ partial (intake tree complete; blueprint persistence pending) |
| Sprint 5 — Dashboard + auth + tenant picker | ✅ done |
| Sprint 6 — Daemon + jobs vertical | ✅ daemon done; jobs vertical capabilities present |
| 7-site harness (Yggdrasil core_loop) | ✅ done with 20 passing tests |
| Sprint 7 — Production hardening | 🟡 manifests + CI; not yet exercised against a real cluster |
