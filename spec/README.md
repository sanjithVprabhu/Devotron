# VEDA — Specification

> **One-line vision:** Bring any business to life on WhatsApp through conversation, not configuration.

This directory contains the complete product, architectural, and build specification for **VEDA** — a conversational agent platform that allows business owners to set up, operate, and grow their entire business through chat interfaces, with WhatsApp as the primary surface and Twitter as the experimentation surface.

---

## How These Docs Are Organized

The specification is split into **three tiers**, written in dependency order. Read them in order.

### Tier 1 — Foundations (read first)
Vision, scope, system architecture, tech stack. Establishes the *what* and *why*.

| File | Purpose |
|---|---|
| `00_VISION.md` | North star, target users, non-goals, success criteria |
| `01_GLOSSARY.md` | Definitive terminology — Dev, Blueprint, Principal, etc. |
| `02_PERSONAS_AND_JOURNEYS.md` | Who uses this, how they experience it end-to-end |
| `03_SYSTEM_ARCHITECTURE.md` | High-level architecture, services, data flow |
| `04_TECH_STACK.md` | Stack decisions and explicit rationale |

### Tier 2 — Building Blocks (the meat)
Data model, the Business Blueprint, agent runtime, capabilities, vertical specs, integrations.

| File | Purpose |
|---|---|
| `05_DATA_MODEL.md` | Postgres schemas, Mongo collections, Qdrant collections, Kafka topics |
| `06_BUSINESS_BLUEPRINT.md` | The central versioned artifact that defines a business |
| `07_IDENTITY_AND_PRINCIPALS.md` | Identity model, cross-channel stitching, team roles |
| `08_CHANNEL_LAYER.md` | WhatsApp + Twitter adapters, abstract channel interface |
| `09_DEV_AGENT.md` | The meta-agent — prompts, flows, state machine |
| `10_BUSINESS_AGENT_RUNTIME.md` | Per-tenant agent mesh, supervisor pattern |
| `11_CAPABILITY_REGISTRY.md` | Capabilities, vertical bundles, opt-ins |
| `12_VERTICAL_AUTO_PARTS.md` | Pilot 1 — auto parts (B2C/B2B) full spec |
| `13_VERTICAL_JOBS.md` | Pilot 2 — jobs aggregator full spec |
| `14_INTEGRATIONS.md` | Meta verification, Razorpay, Shopify, ATS, crawl, sandbox |

### Tier 3 — Production Concerns
Daemon, A2A, frontends, observability, deployment, build sequence.

| File | Purpose |
|---|---|
| `15_DAEMON.md` | Proactive intelligence layer — re-engagement, FAQ patterns, etc. |
| `16_AGENT_TO_AGENT_PROTOCOL.md` | V2 design with v1 hooks for B2B agent transactions |
| `17_FRONTEND_MARKETING.md` | Public landing site, pricing, blog |
| `18_FRONTEND_ONBOARDING.md` | Web-based signup alternative to WhatsApp-only |
| `19_FRONTEND_DASHBOARD.md` | The operational dashboard for business owners |
| `20_OBSERVABILITY_AND_COST.md` | OTel, cost guardrails, audit log |
| `21_SECURITY_AND_COMPLIANCE.md` | DPDP Act, multi-tenant isolation, PII, A2A trust |
| `22_DEPLOYMENT.md` | Azure infra (AKS), Vercel split, CI/CD |
| `23_BUILD_SEQUENCE.md` | Sprint-by-sprint, Claude Code-ready milestones |
| `24_OPEN_QUESTIONS.md` | Deferred decisions, unknowns, follow-up needed |

### Root context

`CLAUDE.md` — root context file for Claude Code. Always read first when starting a build session.

---

## Status

- [x] Tier 1 — written (this delivery)
- [ ] Tier 2 — in progress after Tier 1 review
- [ ] Tier 3 — written after Tier 2 review

## Conventions Used Across All Docs

- **Code blocks** show schemas, examples, or interface definitions in TypeScript/Python/SQL/YAML as appropriate.
- **`v1` / `V2` markers** indicate scope. If something is marked V2, the v1 spec only requires that we don't *block* it later.
- **`[OPEN]`** flags an unresolved question that needs decision before build.
- **`[ASSUMPTION]`** flags something I'm assuming as a default — push back if wrong.
- **`[RECOMMEND]`** flags my opinion where the founder hasn't yet decided.

## How to Use With Claude Code

1. Open the project root containing `/spec`
2. Start a Claude Code session — it auto-reads `CLAUDE.md`
3. Reference specific docs in your prompts: *"Per `06_BUSINESS_BLUEPRINT.md`, scaffold the blueprint mutation API"*
4. Update `24_OPEN_QUESTIONS.md` whenever you decide a deferred question
