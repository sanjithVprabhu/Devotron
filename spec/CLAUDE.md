# Claude Code Context — VEDA

> This file is read by Claude Code at the start of every session. It establishes the project's vision, architecture, conventions, and where to find authoritative specifications.

---

## What We're Building

**VEDA** is a conversational agent platform that allows business owners to set up, operate, and grow their entire business through chat interfaces. The primary surface is **WhatsApp** for business operations. The secondary surface is **Twitter** for low-friction experimentation and discovery.

The core insight: SMBs and aggregators alike are moving operations into messaging apps. Existing tools (AiSensy, Wati, Interakt) are flow-builders that require configuration. VEDA is *configuration through conversation* — a meta-agent named **Dev** interviews the business owner, generates a structured **Business Blueprint**, and stands up a per-tenant agent runtime that can talk to customers, sell, support, and proactively grow.

The two pilot verticals are:
1. **Auto parts** (B2C/B2B retail-with-catalog) — concrete reference customer
2. **Jobs aggregators** (Naukri-style platforms) — enterprise pilot

The architecture is intentionally **vertical-agnostic at the framework level** but **vertical-specific in shipped behavior**. We start with two verticals and expand.

---

## Where to Find Authoritative Specs

The `/spec` directory holds the complete specification. **Do not improvise around the spec.** When in doubt, read the relevant doc and follow it. If the spec is ambiguous, surface the ambiguity rather than guessing.

| If you're working on... | Read first... |
|---|---|
| Anything (start of session) | `spec/README.md`, `spec/00_VISION.md`, `spec/03_SYSTEM_ARCHITECTURE.md` |
| Database schemas | `spec/05_DATA_MODEL.md` |
| The Business Blueprint shape | `spec/06_BUSINESS_BLUEPRINT.md` |
| Agent prompts or flows | `spec/09_DEV_AGENT.md` or `spec/10_BUSINESS_AGENT_RUNTIME.md` |
| Adding a new capability | `spec/11_CAPABILITY_REGISTRY.md` |
| Auto parts pilot work | `spec/12_VERTICAL_AUTO_PARTS.md` |
| Jobs pilot work | `spec/13_VERTICAL_JOBS.md` |
| WhatsApp / Twitter integration | `spec/08_CHANNEL_LAYER.md`, `spec/14_INTEGRATIONS.md` |
| Frontend (any of the three apps) | `spec/17_FRONTEND_MARKETING.md`, `spec/18_FRONTEND_ONBOARDING.md`, `spec/19_FRONTEND_DASHBOARD.md` |
| Deployment / infra | `spec/22_DEPLOYMENT.md` |
| Build sequence / what to do next | `spec/23_BUILD_SEQUENCE.md` |

---

## Tech Stack — Hard Rules

These are non-negotiable in v1. If you find yourself wanting to introduce a new language or replace a foundational choice, **stop and ask the human first.**

- **Two languages only in v1: TypeScript and Python.**
  - TypeScript: webhook gateway, channel adapters, all frontends, background jobs that don't touch agent logic.
  - Python: agent orchestration (LangGraph), RAG pipelines, daemon, capability workers.
- **No Rust in v1.** Rust enters in V2 only if data shows specific bottlenecks. See `spec/04_TECH_STACK.md` for the explicit decision and triggers.
- **Databases:**
  - **Neon Postgres** — source of truth for tenants, users, principals, blueprints (versioned), conversation metadata, transactions, audit log.
  - **MongoDB Atlas** — heterogeneous catalogs (per-vertical schemas), raw message blobs, agent state checkpoints.
  - **Qdrant** — per-tenant vector collections for RAG.
  - **Redis** — session state, the WhatsApp 24-hour window timer, rate limits, idempotency keys.
- **Event bus: Kafka** (Confluent on Azure) — every meaningful action is an event.
- **Frontend: Next.js 14+ (App Router) + TypeScript + Tailwind + shadcn/ui.**
- **Cloud: Azure** (your existing credits). Marketing site on Vercel, dashboard on AKS in Azure India region.
- **LLM provider: Anthropic Claude (primary), Azure OpenAI (fallback).** Use prompt caching aggressively.

---

## Architectural Invariants

These hold across the entire system. Violating them creates pain later.

1. **The Business Blueprint is the source of truth.** No business behavior is hard-coded. All runtime behavior derives from a versioned blueprint stored in Postgres. Mutations to the blueprint are events.

2. **Three-tier agent hierarchy.**
   - **Tier 1 — Dev** (one global instance, multi-channel): onboarding, discovery routing.
   - **Tier 2 — Business Agents** (one per business, derived from Blueprint): customer interaction, ops.
   - **Tier 3 — Capability Workers** (stateless): catalog.search, payment.razorpay, broadcast.send.

3. **Every meaningful action is a Kafka event.** `MessageReceived`, `AgentResponded`, `ToolCalled`, `BlueprintMutated`, `OrderPlaced`, `EscalationTriggered`, `DaemonProposalCreated`, etc. The event log powers analytics, replay, debugging, and the daemon's input stream.

4. **Multi-tenant isolation is enforced at the data layer.** Postgres uses row-level security by `tenant_id`. Qdrant uses per-tenant collections. Mongo uses per-tenant databases. Redis keys are namespaced by tenant.

5. **Channel-agnostic at the abstraction layer.** Code that talks to WhatsApp must go through the channel adapter interface. No `whatsapp.send(...)` calls outside of `channels/whatsapp/`.

6. **Cost guardrails are first-class.** Every LLM call is metered, attributed to a tenant, and capped per the tenant's budget. See `spec/20_OBSERVABILITY_AND_COST.md`.

7. **Identity is a Principal model.** A WhatsApp number is a `Principal`. Principals can be `EndUser`, `BusinessOwner`, `BusinessTeamMember`, or `BusinessAgent`. One Principal can have multiple roles across multiple businesses. See `spec/07_IDENTITY_AND_PRINCIPALS.md`.

8. **No ad-hoc human-in-the-loop.** Human approval flows are explicit state machines, not implicit "if confused, ask" patterns. See `spec/15_DAEMON.md`.

---

## Coding Conventions

- **TypeScript:** strict mode, `import type` where applicable, no `any` without comment justifying it, Zod for runtime validation at all boundaries.
- **Python:** 3.11+, type hints everywhere, Pydantic for models, `ruff` + `black` for formatting, `pytest` for tests.
- **Async:** use async/await everywhere; do not block.
- **Error handling:** every external call (LLM, DB, third-party API) wraps with retry + timeout + structured logging. No silent failures.
- **Secrets:** never in code, never in logs. Use Azure Key Vault.
- **Tests:** every capability worker has unit tests. Every agent flow has at least one happy-path eval. Frontend uses Playwright for critical journeys.
- **Migrations:** Postgres migrations via Drizzle (TS) or Alembic (Python). Mongo schema changes are forward-compatible.
- **Branching:** trunk-based with short-lived feature branches. Tag every deploy.

---

## When You Add Code, Also...

- Update the relevant spec file if your implementation reveals an inaccuracy or gap.
- Add an entry to `spec/24_OPEN_QUESTIONS.md` if you encountered ambiguity that needs founder input.
- Write a CHANGELOG entry per service.
- Add an event to the schema if you introduce a new state transition.

---

## What Not To Do

- **Do not add Rust services in v1.** Even if you're "sure" it'd help.
- **Do not add new SaaS dependencies without flagging.** Each new dependency is a vendor risk and a cost line.
- **Do not bypass the Blueprint.** Every business-specific behavior reads from the blueprint, even in tests.
- **Do not log PII.** Customer phone numbers, names, addresses are PII. Log Principal IDs, not raw values.
- **Do not write to the database from the agent layer directly.** Agents emit events; consumers update state.
- **Do not couple the dashboard to a specific channel.** The dashboard is channel-agnostic.

---

## Quick Reference — Key URLs and Endpoints (placeholder until provisioned)

```
Production:    https://app.projectdev.in
Marketing:     https://projectdev.in
API:           https://api.projectdev.in
WhatsApp Dev:  +91-XXXXXXXXXX (Dev's primary number)
Twitter Dev:   @projectdev_bot
```

---

*Last updated: Tier 1 of spec, initial draft.*
