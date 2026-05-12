# Mimir — Full Specification

**Mimir** is the essence of Yggdrasil delivered as a lean, cloud-native agentic runtime.
It keeps everything that makes Yggdrasil feel alive — the orchestrated loop, Valkyrie's
ambient observation, YMIR's consolidation and reflection, the disciplined separation of
concerns — and replaces the ambitious self-built infrastructure (custom WAL, Parquet
snapshots, in-process knowledge graph, distributed placement engine) with **managed
cloud services**.

The name comes from Mímir, the Norse keeper of the well of wisdom at the base of
Yggdrasil. Where Yggdrasil is the world-tree, Mimir is the well you draw from. This
system is the distilled intelligence of the tree, without the roots and branches that
take a year to grow.

---

## 1. North Star

> **A multi-tenant agentic runtime for enterprise service and commerce automation,
> with an ambient observer (Valkyrie) and a background consolidator (YMIR) that make
> the system feel aware of the conversations flowing through it — deployable on
> managed cloud services, ready for paying customers within weeks.**

Everything in this document serves that sentence. Anything that does not contribute
to shipping that system is deferred to the future Yggdrasil build.

---

## 2. What Mimir Inherits From Yggdrasil

Mimir preserves the **architectural essence** of Yggdrasil. This is not a rewrite
from scratch — it is a carefully pruned subset with managed-service substitutions
at the storage layer.

### 2.1 Preserved in full

- **The 7-site orchestrated loop.** Permission gate → tool execution → (stubs for
  memory verification, critic, compaction, swarm) → output. The same loop shape,
  the same event emissions, the same checkpoint semantics.
- **Trait-based seams.** `ContextAssembler`, `ModelProvider`, `ToolExecutor`,
  `EgressHandler`, `MemoryStore` remain the core abstractions. Implementations
  change; contracts do not.
- **Strongly typed ID system and error hierarchy.** `TaskId`, `TenantId`, `TraceId`,
  `SessionId`, `MessageId`, `ObservationId`, `YggError`, `ErrorCode` — ported as-is.
- **Event-driven instrumentation.** Every stage emits structured events through
  `EventBus`, wired to OpenTelemetry/tracing. This is how we build observability
  for free.
- **Valkyrie — the Observer.** The ambient intelligence that watches conversation
  turns, buffers observations per tenant/session, respects token and call budgets,
  and trips circuit breakers. Kept intact. This is part of what makes Mimir feel
  alive.
- **YMIR — the Reflector.** The background intelligence that wakes on triggers,
  processes Valkyrie's raw observations, consolidates them into facts and notes,
  generates proposals. Kept intact. This is the other part of what makes Mimir feel
  alive.
- **Ingress normalization.** Validation, idempotency keys, tenant scoping.
- **Egress with idempotent delivery.** Dedup on `idempotency_key`.
- **Tool registry + permission gate.** Discovery, metadata, allowed/denied capability
  sets per task.
- **Multi-tenant isolation as a first-class concern.** Every ID is tenant-scoped;
  every query filters by tenant.

### 2.2 Replaced with managed services

| Yggdrasil original                         | Mimir replacement                                      |
|--------------------------------------------|--------------------------------------------------------|
| Custom JSONL WAL                           | Postgres `events` table (append-only)                  |
| In-process `petgraph` knowledge graph      | Postgres `facts`/`relations` tables                    |
| Parquet snapshot storage                   | Cloudflare R2 / S3 cold archives (optional)            |
| In-memory `DashMap<tenant_id, ...>`        | Postgres with row-level security                       |
| Custom vector index                        | pgvector (HNSW) in Postgres                            |
| Redb for mutable state                     | Postgres rows (MVCC handles edits natively)            |
| Self-built object storage                  | R2 / S3                                                |
| Custom durable queue                       | Postgres `tasks` table with `FOR UPDATE SKIP LOCKED`   |

### 2.3 Deferred until customer pull demands it

- Distributed mode (`ygg-skuld`). Single-region, multi-pod is enough.
- Custom memory fabric (`grep_mem.md` design). Postgres covers it.
- Conformance test suite at full coverage. Keep the specs as documentation.
- Plugin marketplace. YAML-declared tools only.
- Self-hosted / on-prem delivery mode. Cloud-only.
- Custom authn/authz. Use Clerk or Auth0.

---

## 3. High-Level Architecture

```
                        ┌───────────────────────────────┐
                        │     Client (Web / API)        │
                        └──────────────┬────────────────┘
                                       │ HTTPS + JWT
                                       ▼
        ┌──────────────────────────────────────────────────────────┐
        │                  mimird  (stateless pods)                │
        │                                                          │
        │   Ingress ─► Core Loop ─► Egress                         │
        │     │            │           │                           │
        │     │            ├─► Context Assembler                   │
        │     │            ├─► Model Provider (OpenAI/Anthropic)   │
        │     │            ├─► Tool Executor                       │
        │     │            └─► Valkyrie Observer (inline)          │
        │     │                                                    │
        │     └─► EventBus ─► OTLP tracing + logs                 │
        └──────────────────────┬───────────────────────────────────┘
                               │
                   ┌───────────┴─────────────┐
                   │                         │
                   ▼                         ▼
          ┌────────────────┐      ┌───────────────────────┐
          │  Postgres      │      │    YMIR Worker(s)     │
          │  (Neon)        │◄────►│    (separate pods)    │
          │                │      │                       │
          │  • tenants     │      │  • Consumes wake      │
          │  • events      │      │    events             │
          │  • conversa-   │      │  • Reads observations │
          │    tions       │      │  • Writes facts,      │
          │  • messages    │      │    notes, proposals   │
          │  • memories    │      │  • Respects budgets   │
          │    (+ vector)  │      │                       │
          │  • observations│      └───────────────────────┘
          │  • facts       │
          │  • notes       │
          │  • proposals   │
          │  • audit_log   │
          │  • tasks (queue)│
          └────────┬───────┘
                   │
                   ▼
          ┌────────────────┐
          │   R2 / S3      │
          │  (cold tier)   │
          │                │
          │  • archived    │
          │    events      │
          │  • large tool  │
          │    outputs     │
          │  • attachments │
          └────────────────┘
```

### 3.1 Key architectural rules

1. **Pods are stateless.** Anything durable lives in Postgres or R2. Horizontal
   scaling is adding pods, nothing else.
2. **Postgres is the single source of truth for live state.** Events, memories,
   observations, facts, notes — all in one database with one backup story.
3. **R2 is the cold tier.** Events older than N days get archived; attachments go
   here. Nothing in R2 is required for live operation.
4. **YMIR runs in its own pods.** The reflection loop is deliberately decoupled from
   request-response latency.
5. **Every query is tenant-scoped.** Postgres row-level security enforces this at the
   database layer, not just the application layer.

---

## 4. Crate Layout

Mimir is a Rust workspace with ten crates, mirroring Yggdrasil's pattern but leaner.

```
crates/
├── mimir-types/       # IDs, errors, contracts, event constants
├── mimir-core/        # Orchestrator, 7-site loop, trait definitions
├── mimir-ingress/     # Request normalization, validation
├── mimir-egress/      # Durable output queue (Postgres-backed)
├── mimir-context/     # Context assembly with semantic retrieval
├── mimir-model/       # ModelProvider trait + OpenAI + Anthropic impls
├── mimir-tools/       # Tool registry + HTTP tool executor
├── mimir-memory/      # Postgres/pgvector-backed MemoryStore
├── mimir-valkyrie/    # Observer — buffers, budgets, circuit breakers
├── mimir-ymir/        # Reflector — consolidation, facts, proposals
└── mimir-api/         # Axum HTTP server binary (mimird)
```

Total target LOC: ~6,000–8,000 lines of Rust. Build time under 2 minutes on a laptop.

---

## 5. Memory Model

The memory model is the biggest simplification from Yggdrasil. Instead of four
storage layers (in-memory cache, WAL, graph, Parquet), Mimir has **two**: Postgres
for live state, R2 for cold archive.

### 5.1 Storage tiers

**Hot tier — Postgres (Neon serverless)**

Every piece of live state is a row in Postgres. MVCC gives us crash-safe mutable
state for free. pgvector gives us semantic search in the same query engine as
metadata filters. Row-level security gives us tenant isolation at the database.

**Cold tier — R2 (optional, only when volume demands)**

Events older than 90 days get rolled up into daily Parquet files in R2. Large tool
outputs (>100KB) are stored in R2 with a reference held in Postgres. This is pure
cost optimization; the system works without it.

### 5.2 Postgres schema

All tables are tenant-scoped and protected by row-level security policies keyed to
the `tenant_id` JWT claim. Timestamps are `TIMESTAMPTZ`. IDs are ULIDs stored as
`TEXT` with prefix (`tsk_`, `msg_`, `obs_`, `fct_` etc.).

```sql
-- Core tenancy
CREATE TABLE tenants (
  tenant_id       TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  plan            TEXT NOT NULL DEFAULT 'free',
  policy          JSONB NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Conversations
CREATE TABLE conversations (
  conversation_id TEXT PRIMARY KEY,
  tenant_id       TEXT NOT NULL REFERENCES tenants,
  session_id      TEXT NOT NULL,
  title           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_active_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON conversations (tenant_id, last_active_at DESC);

-- Messages (both user and assistant turns)
CREATE TABLE messages (
  message_id      TEXT PRIMARY KEY,
  tenant_id       TEXT NOT NULL,
  conversation_id TEXT NOT NULL REFERENCES conversations,
  role            TEXT NOT NULL CHECK (role IN ('user','assistant','tool','system')),
  content         TEXT NOT NULL,
  tool_calls      JSONB,
  tool_result     JSONB,
  token_count     INT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON messages (tenant_id, conversation_id, created_at);

-- Memories — the unified semantic retrieval target
CREATE TABLE memories (
  memory_id       TEXT PRIMARY KEY,
  tenant_id       TEXT NOT NULL,
  kind            TEXT NOT NULL,  -- 'message' | 'fact' | 'note' | 'observation'
  source_id       TEXT,           -- points back to original
  content         TEXT NOT NULL,
  embedding       vector(1536),
  metadata        JSONB NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX memories_hnsw_idx
  ON memories USING hnsw (embedding vector_cosine_ops);
CREATE INDEX ON memories (tenant_id, kind, updated_at DESC);
CREATE INDEX ON memories USING GIN (metadata jsonb_path_ops);

-- Valkyrie raw observations (mutable — may be promoted or dropped)
CREATE TABLE observations (
  observation_id  TEXT PRIMARY KEY,
  tenant_id       TEXT NOT NULL,
  session_id      TEXT NOT NULL,
  buffer_id       TEXT NOT NULL,
  category        TEXT NOT NULL,    -- StateChange|Preference|Intent|Context
  text            TEXT NOT NULL,
  confidence      REAL NOT NULL,
  source_message_ids TEXT[] NOT NULL,
  observer_model  TEXT NOT NULL,
  reflection_status TEXT NOT NULL DEFAULT 'unreflected',
  start_seq       BIGINT,
  end_seq         BIGINT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON observations (tenant_id, reflection_status, created_at);
CREATE INDEX ON observations (tenant_id, session_id, created_at);

-- YMIR-consolidated facts (editable — edges of a knowledge graph, flattened)
CREATE TABLE facts (
  fact_id         TEXT PRIMARY KEY,
  tenant_id       TEXT NOT NULL,
  subject         TEXT NOT NULL,
  predicate       TEXT NOT NULL,
  object          TEXT NOT NULL,
  confidence      REAL NOT NULL,
  source_observations TEXT[] NOT NULL,
  contradictions  TEXT[] DEFAULT '{}',
  last_seen_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, subject, predicate, object)
);
CREATE INDEX ON facts (tenant_id, subject);
CREATE INDEX ON facts (tenant_id, predicate);

-- YMIR free-form notes (editable living documents)
CREATE TABLE notes (
  note_id         TEXT PRIMARY KEY,
  tenant_id       TEXT NOT NULL,
  topic           TEXT NOT NULL,
  title           TEXT NOT NULL,
  body            TEXT NOT NULL,
  embedding       vector(1536),
  tags            TEXT[] DEFAULT '{}',
  refs            JSONB NOT NULL DEFAULT '[]',
  version         INT NOT NULL DEFAULT 1,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX notes_hnsw_idx ON notes USING hnsw (embedding vector_cosine_ops);
CREATE INDEX ON notes (tenant_id, topic, updated_at DESC);
CREATE INDEX ON notes USING GIN (tags);

-- YMIR proposals (suggested actions awaiting review/execution)
CREATE TABLE proposals (
  proposal_id     TEXT PRIMARY KEY,
  tenant_id       TEXT NOT NULL,
  kind            TEXT NOT NULL,
  source          TEXT NOT NULL DEFAULT 'ymir',
  content         JSONB NOT NULL,
  confidence      REAL NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending',
  decided_by      TEXT,
  decided_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON proposals (tenant_id, status, created_at DESC);

-- Append-only event log (core loop + valkyrie + ymir emit here)
CREATE TABLE events (
  event_id        TEXT PRIMARY KEY,
  tenant_id       TEXT NOT NULL,
  event_type      TEXT NOT NULL,
  trace_id        TEXT NOT NULL,
  span_id         TEXT,
  actor_type      TEXT NOT NULL,
  component       TEXT NOT NULL,
  data            JSONB NOT NULL,
  occurred_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON events (tenant_id, occurred_at DESC);
CREATE INDEX ON events (trace_id);
CREATE INDEX ON events (tenant_id, event_type, occurred_at DESC);

-- Durable output queue (replaces InMemoryEgressSink)
CREATE TABLE outputs (
  output_id       TEXT PRIMARY KEY,
  task_id         TEXT NOT NULL,
  tenant_id       TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  message_type    TEXT NOT NULL,
  payload         JSONB NOT NULL,
  channel         TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'queued',
  attempts        INT NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, idempotency_key)
);
CREATE INDEX ON outputs (status, next_attempt_at)
  WHERE status IN ('queued','retrying');

-- YMIR wake queue (replaces custom scheduler)
CREATE TABLE ymir_wakes (
  wake_id         TEXT PRIMARY KEY,
  tenant_id       TEXT NOT NULL,
  trigger         TEXT NOT NULL,
  job_type        TEXT NOT NULL,
  dedup_key       TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending',
  scheduled_for   TIMESTAMPTZ NOT NULL DEFAULT now(),
  attempts        INT NOT NULL DEFAULT 0,
  last_error      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, dedup_key)
);
CREATE INDEX ON ymir_wakes (status, scheduled_for)
  WHERE status IN ('pending','retrying');

-- Audit log (compliance)
CREATE TABLE audit_log (
  audit_id        TEXT PRIMARY KEY,
  tenant_id       TEXT NOT NULL,
  actor_id        TEXT NOT NULL,
  actor_type      TEXT NOT NULL,
  action          TEXT NOT NULL,
  target_type     TEXT,
  target_id       TEXT,
  metadata        JSONB NOT NULL DEFAULT '{}',
  ip_address      INET,
  occurred_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON audit_log (tenant_id, occurred_at DESC);
```

### 5.3 Why this schema captures the essence

- **Separation of raw vs. refined.** `messages` and `events` are immutable truth of
  record. `observations` are Valkyrie's raw takes. `facts` and `notes` are YMIR's
  refined, editable consolidations. Same separation as Yggdrasil's WAL vs. graph
  vs. reflection — just flattened into tables.
- **Mutable intelligence.** `facts`, `notes`, `proposals` are all updated in place
  via normal SQL `UPDATE`. This is YMIR's "living notes" — the thing that makes
  the system feel alive. Postgres MVCC handles the concurrency safely.
- **Unified semantic retrieval.** The `memories` table is the single pgvector
  target. Anything worth semantically retrieving gets a row here with an
  embedding: messages that matter, consolidated facts, notes, even observations
  that crossed a confidence threshold. `kind` tells you where it came from.
- **Event log is first-class.** The `events` table replaces Yggdrasil's JSONL WAL
  with identical semantics (append-only, tenant-scoped, trace-correlated).
- **Queues in Postgres.** `outputs` and `ymir_wakes` use `FOR UPDATE SKIP LOCKED`
  instead of adding Redis. Postgres handles 10k+ jobs/sec this way; you don't
  need a dedicated queue system at this stage.

### 5.4 Row-level security

Every tenant-scoped table gets policies like:

```sql
ALTER TABLE memories ENABLE ROW LEVEL SECURITY;
CREATE POLICY memories_tenant_isolation ON memories
  USING (tenant_id = current_setting('mimir.tenant_id'));
```

The application sets `SET LOCAL mimir.tenant_id = '<id>'` at the start of every
transaction from a JWT claim. Defense in depth — the database rejects cross-tenant
reads even if application code has a bug.

---

## 6. The Core Loop

The 7-site loop is preserved from Yggdrasil. One iteration of the loop per model
call. The loop suspends on permission denial, tool failure requiring human
intervention, or iteration-limit breach.

```
┌──────────────────────────────────────────────────────────────────┐
│                     Loop Iteration                               │
├──────────────────────────────────────────────────────────────────┤
│  0. Context Assembly                                             │
│     - fetch recent turns from `messages`                        │
│     - semantic retrieval from `memories` (pgvector)             │
│     - load relevant `facts` and `notes`                         │
│     - emit context.assembly.completed                           │
│                                                                  │
│  1. Model Inference                                              │
│     - OpenAI / Anthropic call                                   │
│     - emit model.inference.request / .response                  │
│                                                                  │
│  SITE 1. Permission Gate                                         │
│     - check tool call against allowed/denied capabilities       │
│     - check per-tenant rate/cost budgets                        │
│     - optionally hold for human approval (high-risk tools)      │
│                                                                  │
│  SITE 2. Tool Execution                                          │
│     - dispatch to HTTP tool executor                            │
│     - enforce timeout, retry, circuit breaker                   │
│     - emit tool.action.started / .completed / .failed           │
│                                                                  │
│  SITE 3. Memory Verification (v1 stub)                           │
│     - in Mimir v1 this is a pass-through                        │
│     - v2 will check tool result consistency against `facts`     │
│                                                                  │
│  SITE 4. Critic / Safety (v1 stub)                               │
│     - regex PII redaction on outputs                            │
│     - v2 adds model-based safety classifier                     │
│                                                                  │
│  SITE 5. Compaction Signal (active)                              │
│     - emits compaction signal when context > 75% of budget      │
│     - triggers summarization on next iteration                  │
│                                                                  │
│  SITE 6. Swarm Handoff (deferred)                                │
│                                                                  │
│  SITE 7. Output & Decision                                       │
│     - finalize or loop                                          │
│     - emit core.loop.iteration_completed                        │
│     - on final: write to `outputs`, mark task succeeded         │
│                                                                  │
│  SIDE EFFECT: Valkyrie inline observation of each message       │
│  SIDE EFFECT: YMIR wake emitted on memory write                 │
└──────────────────────────────────────────────────────────────────┘
```

### 6.1 Loop invariants

- Every iteration has a unique `iteration` counter starting at 1.
- Iteration limit defaults to 32 per task. Breach → `LoopIterationLimitExceeded`.
- Every iteration persists a checkpoint to Postgres so long-running tasks survive
  pod restarts.
- Every iteration emits a matched pair of `iteration_started` and
  `iteration_completed` events.

---

## 7. Valkyrie — The Observer

Valkyrie is the ambient intelligence that watches every conversation turn and
emits structured observations. It is the first half of what makes Mimir feel
sentient.

### 7.1 Responsibilities

1. **Inline observation.** On every assistant message, user message, and tool
   result, call the configured observer model on the buffered segment.
2. **Per-tenant/session buffering.** Maintain `ObservationBuffer` per
   `(tenant_id, session_id)` with size limits (512KB, 256 max active buffers,
   LRU eviction).
3. **Categorized output.** Emit observations tagged as `StateChange`, `Preference`,
   `Intent`, or `Context`. This taxonomy drives YMIR's consolidation rules.
4. **Budget enforcement.** Per-minute call budget, per-day token budget,
   circuit breaker (60-second cooldown on trip). Protects against runaway
   observer cost.
5. **Deterministic persistence.** Every accepted observation becomes a row in the
   `observations` table with `reflection_status = 'unreflected'`.
6. **Wake emission.** After N new observations, emit a `YmirWakeEvent` of type
   `Reflection` with `dedup_key = (tenant_id, buffer_id, end_seq)` to the
   `ymir_wakes` table.

### 7.2 Configuration

```rust
pub struct ObserverPolicy {
    pub enabled: bool,                  // default true
    pub observer_model: String,         // e.g. "gpt-4o-mini"
    pub max_active_buffers: usize,      // 256
    pub max_buffer_bytes: usize,        // 524_288
    pub flush_every_n_turns: u32,       // 4
    pub flush_token_budget: u64,        // 8192
    pub calls_per_minute_budget: u32,   // 60
    pub tokens_per_day_budget: u64,     // 2_000_000
    pub circuit_breaker_timeout_sec: u64, // 60
}
```

### 7.3 Flush triggers

A buffer flushes (calls the observer model) when any trigger fires:

- `flush_every_n_turns` messages have been appended
- Buffer token count exceeds `flush_token_budget`
- Buffer memory exceeds `max_buffer_bytes`
- A tool result was just appended (tool results often represent state changes
  and are high-signal)
- The conversation session explicitly ended
- An upstream caller invoked `force_flush()`

### 7.4 Observation lifecycle

```
created (status=unreflected)
   ├─ picked up by YMIR wake
   │     ├─ consolidated into facts/notes (status=promoted)
   │     └─ judged low-signal (status=dropped)
   └─ stale for > retention window (status=archived, moved to R2)
```

---

## 8. YMIR — The Reflector

YMIR is the background intelligence that wakes periodically, reads Valkyrie's
observations, and consolidates them into facts, notes, and actionable proposals.
It is what gives Mimir its sense of continuity across conversations.

### 8.1 Run model

YMIR runs in **separate worker pods** from the HTTP API. This is deliberate:

- Reflection is latency-insensitive, cost-sensitive — different scaling shape
  than request-response.
- Reflection can run heavier models (e.g. Claude Opus for deep analysis) without
  blocking user-facing traffic.
- Isolated failure domain — if YMIR crashes, the core loop keeps serving.

Workers poll `ymir_wakes` with `FOR UPDATE SKIP LOCKED`:

```sql
UPDATE ymir_wakes
   SET status = 'running', attempts = attempts + 1
 WHERE wake_id = (
   SELECT wake_id FROM ymir_wakes
    WHERE status = 'pending' AND scheduled_for <= now()
    ORDER BY scheduled_for
    LIMIT 1 FOR UPDATE SKIP LOCKED
 )
RETURNING *;
```

### 8.2 Wake types

| Job type      | Trigger                                  | What it does                          |
|---------------|------------------------------------------|---------------------------------------|
| `Reflection`  | Valkyrie emitted N new observations      | Consolidate → facts + notes           |
| `Maintenance` | Scheduled (every 5 min per active tenant)| Compact, archive, refresh embeddings  |
| `Proactive`   | External webhook or manual trigger       | Propose follow-up actions             |

### 8.3 Reflection pipeline

```
1. Fetch unreflected observations for (tenant_id, wake.dedup_key)
   ORDER BY created_at ASC LIMIT max_reflection_items_per_tick (100)

2. Group by (session_id, category)

3. For each group, call reflector model with prompt:
   "Given these raw observations about the user, produce:
    - facts in (subject, predicate, object) form with confidence
    - notes as short living documents by topic
    - proposals for actions the system might take
    Mark any observations that conflict with existing facts."

4. Upsert facts:
   INSERT INTO facts (...) VALUES (...)
   ON CONFLICT (tenant_id, subject, predicate, object) DO UPDATE
     SET confidence = GREATEST(excluded.confidence, facts.confidence),
         last_seen_at = now(),
         source_observations = array_cat(facts.source_observations,
                                         excluded.source_observations);

5. Upsert notes (by topic), bumping version:
   UPDATE notes SET body = $new_body, version = version + 1,
                     updated_at = now()
   WHERE tenant_id = $1 AND topic = $2;

6. Insert proposals with status='pending' for any action items.

7. Update observations.reflection_status = 'promoted' or 'dropped'.

8. Re-embed any updated notes into the `memories` table so they become
   semantically retrievable.

9. Emit ymir.reflection.completed event with counts.
```

### 8.4 Budget and safety

- **Max wall time per wake:** 30s (default). Exceed → mark `ymir_wakes.status =
  'degraded'`, preserve partial progress.
- **Max tool calls per wake:** 8. YMIR can call tools (e.g. to verify facts),
  but bounded.
- **Max proactive tasks per wake:** 3. Caps runaway proposal generation.
- **Dedup window:** 300s. Repeated wakes with the same `dedup_key` coalesce.
- **Tenant scope check:** before every action, YMIR verifies it is operating on
  the tenant it was woken for. Cross-tenant read attempts are a bug and kill the
  worker.

### 8.5 Why YMIR makes the system feel alive

Valkyrie alone gives you "the system notices things." That is just a log.

YMIR gives you **continuity**:

- It consolidates — "the user said they prefer dark mode three times now; that's
  a fact, not three observations."
- It contradicts — "the user said they use Windows last week; now they mentioned
  Linux. Update the fact with both possibilities, flag for disambiguation."
- It writes notes — "running summary of what I know about Tenant A's refund
  policy, updated every few days."
- It proposes — "based on patterns across conversations, suggest we add a new
  response template for billing questions."

That consolidation and persistence across time is the felt sense of a living
memory. A stateless LLM cannot do this on its own. A WAL cannot do this. Only
a reflection loop against mutable, editable state can. That is YMIR.

---

## 9. Context Assembly

When the core loop needs context for the next model call, it builds a
`ContextPackage` with tokens budgeted by priority.

```
Assembly order (highest priority first):
  1. System prompt (task-specific)               ~200 tokens
  2. Active tool definitions                     ~400 tokens
  3. Most recent N turns in this conversation    ~2000 tokens
  4. Top-K semantic matches from memories        ~1500 tokens
     (SELECT content FROM memories
        WHERE tenant_id=$1
        ORDER BY embedding <=> $query_embedding
        LIMIT 10)
  5. Relevant facts (subject-matched)            ~500 tokens
  6. Relevant notes (topic-matched or semantic)  ~800 tokens
  7. Conversation summary (if compacted)         ~400 tokens

Target total budget: 6000–16000 tokens depending on model.
```

### 9.1 Hybrid retrieval query

The semantic retrieval query combines vector similarity with metadata filters,
which is why pgvector-in-Postgres wins over a pure vector DB:

```sql
SELECT memory_id, content, kind, metadata,
       1 - (embedding <=> $1::vector) AS similarity
  FROM memories
 WHERE tenant_id = $2
   AND (metadata->>'session_id' = $3 OR kind IN ('fact','note'))
   AND created_at > now() - interval '90 days'
 ORDER BY embedding <=> $1::vector
 LIMIT 10;
```

One query, metadata-aware, RLS-enforced, HNSW-accelerated.

### 9.2 Compaction signal

When assembled context crosses 75% of the target budget, the assembler emits
`context.assembly.compaction_signal_emitted`. On the next iteration, the loop
asks the model to produce a running summary, stores it as a `note` with topic
`summary.<conversation_id>`, and subsequent assemblies use the summary in place
of older turns.

---

## 10. Tool System

### 10.1 Tool definition (YAML-first, Rust-optional)

```yaml
id: stripe.refund
version: 1.0.0
description: "Issue a refund on a Stripe payment"
capability: commerce.refund
risk_level: high          # triggers human approval
parameters:
  type: object
  properties:
    payment_intent_id: { type: string }
    amount_cents: { type: integer, minimum: 1 }
    reason: { type: string, enum: [duplicate, fraudulent, requested_by_customer] }
  required: [payment_intent_id]
executor:
  kind: http
  method: POST
  url_template: "https://api.stripe.com/v1/refunds"
  auth:
    kind: bearer_env
    env_var: STRIPE_API_KEY_{tenant_id}
  timeout_ms: 15000
  retries:
    max: 2
    on: [5xx, 429]
  response:
    success: 200
    error_mapping:
      400: tool.call.invalid_input
      402: tool.call.payment_failed
```

Tools are registered at startup from a YAML directory and from per-tenant custom
tool definitions in the `tools` table (future). No plugin marketplace in Mimir v1.

### 10.2 HTTP tool executor

Replaces Yggdrasil's `MockToolExecutor`. Responsibilities:

- Template URL and body from parameters
- Resolve auth per-tenant from secrets store
- Enforce timeout and retry schedule
- Map HTTP errors to `ErrorCode` values
- Validate response against JSON schema (if declared)
- Record full request/response (redacted) to the `events` table
- Circuit-break per `(tool_id, tenant_id)` after N consecutive failures

### 10.3 Permission gate

Before Site 2 executes a tool call:

1. Check `ExecutionPolicy.allowed_capabilities` / `denied_capabilities`
2. Check `tenant.policy` for tool allowlist
3. Check per-tenant per-day budget for this tool's `capability`
4. If `risk_level = 'high'`, insert a `proposals` row of kind `tool_approval`
   with status `pending`, suspend the task, notify via webhook. Task resumes
   when approval row flips to `approved`.

---

## 11. API Surface

Mimir exposes a narrow HTTP API via the `mimird` binary.

```
POST   /v1/tasks/execute           # one-shot task execution
POST   /v1/conversations/{id}/messages  # append a message, return assistant reply
GET    /v1/conversations/{id}      # fetch conversation history
GET    /v1/conversations/{id}/stream    # SSE streaming for assistant replies
GET    /v1/memories/search         # semantic memory search (internal/admin)
GET    /v1/observations            # Valkyrie observation browser (admin)
GET    /v1/facts                   # YMIR-consolidated facts (admin)
GET    /v1/notes                   # YMIR notes (admin)
GET    /v1/proposals               # YMIR proposals
POST   /v1/proposals/{id}/decide   # approve/deny a proposal
GET    /v1/audit                   # audit log
GET    /v1/usage                   # tenant usage + cost
GET    /health                     # liveness
GET    /readyz                     # readiness (db reachable, etc.)
GET    /metrics                    # Prometheus metrics
```

All endpoints except `/health`, `/readyz`, `/metrics` require a JWT with a
`tenant_id` claim. JWTs are issued by Clerk/Auth0 and validated with JWKS on
every request.

---

## 12. Data Contracts

The essential types, ported directly from `ygg-types` with minimal renaming:

```rust
pub enum TaskState {
  Pending, Running, Suspended, Succeeded, Failed, Cancelled, Expired, Compacting
}

pub enum LoopDecision { Continue, Finalize, Suspend(SuspensionReason) }

pub enum ChunkCategory {
  SystemPrompt, ToolDefinitions, RecentTurn, Query,
  SemanticRecall, Fact, Note, Summary
}

pub struct ContextPackage {
  pub schema_version: String,
  pub metadata: ContextMetadata,
  pub chunks: Vec<ContextChunk>,
  pub compaction_signals: CompactionSignals,
}

pub struct ModelResponse {
  pub final_answer: Option<String>,
  pub tool_calls: Vec<ToolCall>,
  pub usage: TokenUsage,
  pub finish_reason: FinishReason,
  pub provider_metadata: ProviderMetadata,
}

pub struct Observation {
  pub observation_id: String,
  pub tenant_id: String,
  pub session_id: String,
  pub category: ObservationCategory,
  pub text: String,
  pub confidence: f64,
  pub source_message_ids: Vec<String>,
  pub observer_model: String,
  pub reflection_status: ReflectionStatus,
  /* ... */
}

pub struct Fact {
  pub fact_id: String,
  pub tenant_id: String,
  pub subject: String,
  pub predicate: String,
  pub object: String,
  pub confidence: f64,
  pub source_observations: Vec<String>,
  pub contradictions: Vec<String>,
  pub last_seen_at: DateTime<Utc>,
}

pub struct Note {
  pub note_id: String,
  pub tenant_id: String,
  pub topic: String,
  pub title: String,
  pub body: String,
  pub tags: Vec<String>,
  pub version: u32,
  pub refs: serde_json::Value,
}

pub struct Proposal {
  pub proposal_id: String,
  pub tenant_id: String,
  pub kind: String,
  pub content: serde_json::Value,
  pub confidence: f64,
  pub status: ProposalStatus,   // pending | approved | denied | executed
}
```

Error hierarchy is imported wholesale from Yggdrasil; the 60+ `ErrorCode` variants
cover everything Mimir needs.

---

## 13. Observability

Every stage of the loop, every Valkyrie buffer flush, every YMIR wake emits
structured events. Events flow two ways:

1. **To the `events` table** for durable query and replay.
2. **To OTLP** via the `tracing` crate's OpenTelemetry subscriber, exported to
   Axiom or a hosted OTLP collector.

### 13.1 Essential metrics (Prometheus)

```
mimir_task_iterations_total{tenant, outcome}
mimir_task_duration_seconds{tenant}
mimir_model_tokens_total{tenant, provider, kind}   # kind=input|output
mimir_model_cost_usd_total{tenant, provider}
mimir_tool_calls_total{tenant, tool_id, outcome}
mimir_tool_duration_seconds{tenant, tool_id}
mimir_valkyrie_observations_total{tenant, category}
mimir_valkyrie_circuit_opens_total{tenant}
mimir_ymir_wakes_total{tenant, job_type, outcome}
mimir_ymir_facts_upserted_total{tenant}
mimir_ymir_notes_updated_total{tenant}
mimir_ymir_proposals_created_total{tenant, kind}
mimir_memory_retrieval_latency_seconds{tenant}
mimir_errors_total{tenant, code}
```

### 13.2 Traces

Every task gets a trace. Every iteration is a span. Every tool call is a span.
Every model call is a span. Every Valkyrie flush is a span. Every YMIR wake is a
trace of its own, correlated back to the observations' trace IDs via
`span_link`.

### 13.3 Audit

Every tenant-visible action (tool call, proposal decision, memory write by
YMIR, admin override) writes a row to `audit_log`. This is what enterprise
buyers ask for in security reviews.

---

## 14. Deployment

### 14.1 Managed services (canonical choices)

| Concern | Service | Rationale |
|---------|---------|-----------|
| Compute | **Fly.io** | Simple Rust deploys, regional, per-second billing |
| Postgres + pgvector | **Neon** | Serverless, branch-per-env, scale-to-zero |
| Object storage | **Cloudflare R2** | Free egress, S3-compatible |
| LLM | **OpenAI + Anthropic** | Both wired behind `ModelProvider` |
| Auth | **Clerk** | Tenant + user model ready-made |
| Secrets | **Doppler** or Fly secrets | Centralized rotation |
| Observability | **Axiom** (logs + traces) + **Sentry** (errors) | Free tiers cover MVP |
| Email / webhooks | **Resend** / **Svix** | As-needed |

### 14.2 Topology

- **1–3 `mimird` pods** (HTTP API) behind Fly's load balancer, autoscale 0–10.
- **1–2 `mimir-ymir-worker` pods** consuming `ymir_wakes`. Autoscale by queue
  depth.
- **1 `mimir-egress-worker` pod** consuming `outputs` for webhook delivery.
- **1 Neon project** per environment (dev / staging / prod), one database per
  environment, branches for testing schema migrations.
- **1 R2 bucket** per environment.

### 14.3 Cost envelope at launch

| Tier | Monthly cost | Capacity |
|------|--------------|----------|
| Idle / dev | ~$0 (free tiers) | 1 dev tenant, 1000 tasks/mo |
| Early customers | ~$80 | 10 tenants, 100k tasks/mo |
| Design partners | ~$300 | 50 tenants, 1M tasks/mo |
| Growth | ~$1200 | 200 tenants, 10M tasks/mo |

LLM token cost is separate and scales with usage — pass-through metered to
customers.

### 14.4 Rollout plan

Weeks 1–2: schema + core loop + OpenAI provider + HTTP server on Fly.
Weeks 3–4: Valkyrie inline observation, YMIR worker skeleton, three real tools.
Weeks 5–6: streaming, admin dashboard, audit log, rate limiting, billing.
Weeks 7–8: three design-partner pilots, iterate.

---

## 15. What Gets Preserved From Yggdrasil's Spirit

The point of Mimir is not to water Yggdrasil down. The point is to keep
everything that makes Yggdrasil *feel* right — and defer everything that costs
months of engineering without customer pull.

Preserved:

- The **discipline of separation**: ingress, core, memory, model, tool, egress,
  observer, reflector are different crates. You can still read the code and
  tell what lives where.
- The **loop as the backbone**: every task is orchestrated; every iteration is
  bounded; every site is instrumented. This is how you stay sane.
- **Valkyrie and YMIR as first-class sentient loops**: the system watches
  itself, reflects on itself, and writes down what it learns. This is the soul.
- **Multi-tenant as an invariant**: not an afterthought. RLS, tenant-prefixed
  IDs, tenant-scoped quotas everywhere.
- **Event-first design**: every interesting thing emits a structured event.
  Observability is not bolted on.
- **Typed contracts + error codes**: 60+ error variants, ULID IDs, schema
  versioning on every envelope. Professional feel from day one.

Deferred (not deleted — reserved for Yggdrasil proper once the business earns
it):

- Custom memory fabric (Greptime-inspired tiered storage)
- Distributed mode and Skuld placement engine
- Full conformance test suite
- Plugin marketplace + manifest signatures
- Self-hosted / on-prem distribution
- Custom WAL with Parquet snapshots

---

## 16. Graduation Criteria

Stop building Mimir and start building Yggdrasil proper when **any** of these
are true:

- **Revenue:** $100k+ ARR with ≥ 5 paying customers
- **Postgres cost:** > $1000/mo sustained on Neon
- **Vector scale:** any single tenant has > 20M memories
- **Latency:** p95 task latency > 1s blamed on Postgres
- **Sovereignty demand:** paying customer requires on-prem/self-hosted
- **Regional demand:** need to serve from 3+ regions

Until then: every feature ships on Mimir. Every engineering hour goes into
customer value, not infrastructure ambition.

---

## 17. Mythological Coherence

Yggdrasil is the world-tree. Ratatoskr is the squirrel that runs up and down it.
Mímir is the being who guards the well of wisdom at the base — **memory
personified**. Valkyries are the watchers of the battlefield who decide whose
deeds get remembered. Ymir is the primordial giant from whose body the world was
shaped — **the source material that gets reflected into form**.

Names line up. The system's story line up.

- **Mimir** — the well of memory (the platform name)
- **Valkyrie** — the watchers (the observers)
- **YMIR** — the raw body being shaped (the reflector consolidating primordial
  observations into formed facts and notes)

Mimir is built today. Yggdrasil is built when the tree has earned its roots.
