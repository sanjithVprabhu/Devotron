# Claude Code Context — VEDA

> This file is read by Claude Code at the start of every session. The authoritative project specification lives in [`spec/`](./spec/). Read [`spec/CLAUDEupdated.md`](./spec/CLAUDEupdated.md) for the full set of invariants and conventions; this root file is a short pointer.

## Where to find authoritative specs

The `/spec` directory holds the complete specification. **Do not improvise around the spec.** When in doubt, read the relevant doc and follow it. If the spec is ambiguous, surface the ambiguity rather than guessing.

| Working on... | Read first... |
|---|---|
| Anything (start of session) | `spec/README.md`, `spec/00_VISION.md`, `spec/03_SYSTEM_ARCHITECTURE.md` |
| DB schemas | `spec/05_DATA_MODEL.md` |
| Blueprint shape | `spec/06_BUSINESS_BLUEPRINT.md` |
| Agent prompts/flows | `spec/09_DEV_AGENT.md`, `spec/10_BUSINESS_AGENT_RUNTIME.md` |
| Adding a capability | `spec/11_CAPABILITY_REGISTRY.md` |
| Auto parts vertical | `spec/12_VERTICAL_AUTO_PARTS_AND_JOBS.md` |
| Jobs vertical | `spec/12_VERTICAL_AUTO_PARTS_AND_JOBS.md` (second half) |
| WhatsApp / Twitter | `spec/08_CHANNEL_LAYER.md`, `spec/13_INTEGRATIONS.md` |
| Frontends | `spec/14_THROUGH_23_REMAINING_DOCS.md` (#16-18) |
| Daemon | `spec/14B_DAEMON_EXECUTION_AND_LEARNING.md` |
| Build sequence | `spec/14_THROUGH_23_REMAINING_DOCS.md` (#22) |

## Hard rules (non-negotiable in v1)

- **Two languages only**: TypeScript (Node 20+) and Python (3.11+). No Go, no Rust, no Java in v1.
- **TS scope**: edge (Fastify), all frontends, BullMQ workers that don't touch agent reasoning.
- **Python scope**: agent orchestration (LangGraph), all FastAPI services, capability workers, daemon, analytics.
- **Databases**: Neon Postgres (OLTP source of truth), MongoDB Atlas (per-tenant heterogeneous catalogs/messages/checkpoints), Qdrant (per-tenant vector collections), Azure Cache for Redis (sessions, 24-hour window, idempotency, rate limits).
- **Event bus**: Kafka (Confluent on Azure). Local dev uses Redpanda via docker-compose.
- **Cloud**: Azure India South region for tenant data. Vercel for marketing site only.
- **LLM**: Anthropic Claude (Sonnet 4.6 + Haiku 4.5) primary; Azure OpenAI fallback. Use prompt caching aggressively.

## Architectural invariants

1. **Business Blueprint is source of truth.** All runtime behavior derives from a versioned Blueprint stored in Postgres. Mutations are events.
2. **Three-tier agent hierarchy.** Veda (one global, multi-channel) → Business Agents (one per tenant, derived from Blueprint) → Capability Workers (stateless).
3. **Every meaningful action is a Kafka event.** `MessageReceived`, `AgentResponded`, `ToolCalled`, `BlueprintMutated`, `OrderPlaced`, `EscalationTriggered`, `DaemonProposalCreated`, etc.
4. **Multi-tenant isolation at the data layer.** Postgres RLS by `tenant_id`; per-tenant Mongo databases; per-tenant Qdrant collections; namespaced Redis keys.
5. **Channel-agnostic.** No `whatsapp.send(...)` calls outside `apps/edge/src/channels/whatsapp/`.
6. **Cost guardrails first-class.** Every LLM call metered, attributed to tenant, capped per tenant budget.
7. **Identity = Principal model.** A WhatsApp number / Twitter handle is an Identifier resolving to a Principal. Principals can be EndUser, BusinessOwner, BusinessTeamMember, BusinessAgent.
8. **No ad-hoc human-in-the-loop.** Approval flows are explicit state machines.

## Coding conventions

- **TypeScript**: strict mode, `import type`, no `any` without justifying comment, Zod at every boundary (HTTP, Kafka, DB), Prettier + ESLint, async/await everywhere.
- **Python**: 3.11+, full type hints, Pydantic v2, ruff + black, pytest + pytest-asyncio, `uv` for deps.
- **Errors**: every external call wraps with retry + timeout + structured logging. No silent failures.
- **Secrets**: never in code, never in logs. Azure Key Vault in prod; `.env` (gitignored) in dev.
- **Migrations**: Postgres via Drizzle (TS source of truth), Python services use SQLAlchemy reading the same DB.
- **PII**: never log raw phone numbers/emails/names. Log Principal IDs.

## What not to do

- Don't add Rust services in v1 even if "obviously" faster.
- Don't add new SaaS dependencies without flagging.
- Don't bypass the Blueprint — every business-specific behavior reads from it.
- Don't write to the database from the agent layer directly. Agents emit events; consumers update state.
- Don't couple the dashboard to a specific channel.
- Don't log PII.

## Memory

Persistent project memory lives at `~/.claude/projects/-home-sanjith-SanjithTS-DevAgent/memory/`. Check `MEMORY.md` for index. Keep it up to date when locked decisions change.
