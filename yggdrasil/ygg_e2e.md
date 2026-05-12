This is the full, working, end-to-end description of Yggdrasil as a production-grade Rust agentic system, directly derived from the ygg_v1.md spec we’ve locked together.
I’m giving you exactly what you asked for:

How the entire system works from the moment a message arrives until the final answer is sent (and everything in between).
The exact Cargo workspace + crate structure I recommend.
What each major crate does individually.
How they all fit together as one cohesive, scalable system.

1. The End-to-End Flow (One Complete Task Lifecycle)
Here’s what happens when a user sends a message (e.g. “update my order to shipped and notify me on WhatsApp”):

Ingress (Inway) → receives raw HTTP/terminal input, validates schema/MIME/limits, persists binary uploads to blob storage, normalizes to TaskRequest, durably acks, and forwards to Orchestrator.
Orchestrator Core → creates task, reads cancellation flag, calls Context Assembly.
Context Assembly → loads Context Packs → pulls memory/graph/domain snapshots → discovers relevant tools → runs Self-Evaluation criteria derivation → builds ContextPackage (with provenance on every chunk).
Model Runtime → calls the configured LLM (plug-and-play) with the assembled prompt.
Parser → extracts <thinking>, <tool_call>, or <final_answer>.
7 Continue Sites Loop (the nervous system):
Site 1: Permission Gate (risk + scopes check)
Site 2: Tool Execution (sync or async via Tool Bus)
Site 3: Memory Verification (skeptical check)
Site 4: Critic Safety Review (optional)
Site 5: Compaction Check
Site 6: Swarm Handoff (if sub-agents needed)
Site 7: Output + Loop Decision + Self-Evaluation verdict

Self-Evaluation (inside Site 7) → checks SuccessCriteria, emits verdict, injects hint if stuck.
Egress (Outway) → receives OutputEnvelope, enqueues, streams via SSE (or terminal), handles retries/idempotency/redaction.
Background (YMIR + Valkyrie):
YMIR wakes on ticks/webhooks → runs maintenance/reflection/proactive tasks.
Valkyrie Observer (post-iteration) extracts observations → Reflector (inside YMIR) consolidates them.

Memory Fabric → all durable writes (WAL, checkpoints, observations, graph edges) happen here. Everything is tenant-scoped and replayable.

If the task suspends (permission, async tool, swarm), it checkpoints and resumes later. Everything is traceable, auditable, and resumable across restarts/nodes.
That is the full loop. It is deterministic, contract-driven, and self-healing.
2. Recommended Cargo Workspace Crate Structure
toml# yggdrasil/Cargo.toml
[workspace]
members = [
  "ygg-core",
  "ygg-ingress",
  "ygg-egress",
  "ygg-memory",
  "ygg-toolbus",
  "ygg-model",
  "ygg-context",
  "ygg-ymir",
  "ygg-valkyrie",
  "ygg-skuld",          # control plane (distributed mode)
  "ygg-types",          # shared types, schemas, ULID prefixes, error codes
  "ygg-proto",          # protobuf/gRPC definitions (Tool Bus, Mailbox, etc.)
]
Key shared dependencies (in ygg-types + root):

tokio + tokio-util + tokio-stream
redb or sled (for local KV in monolith) + parquet + arrow (for WAL/snapshots)
petgraph + dashmap (live graph)
ulid + uuid
serde + serde_json + json-schema validation
tracing + opentelemetry
tonic / prost (gRPC for Tool Bus + Mailbox)
axum (HTTP ingress/egress)
tower (middleware, circuit breaker, retry)
async-trait, thiserror, anyhow (with tracing)

3. How Each Major Crate Works Individually + Together







































































CrateResponsibility (alone)Key Traits/EnumsHow it integrates with othersygg-coreThe nervous system. Owns the 7-continue-site async loop, task lifecycle, checkpoints, self-evaluation.ContinueSite, TaskState, LoopDecision, SuccessCriteriaCentral hub. Calls Context Assembly, Model Runtime, Tool Bus, Egress, Memory. Receives callbacks from Ingress.ygg-ingressAdapters (terminal, http), normalization, upload handling, validation, rate limiting.IngressMessage, TaskRequest, PartProduces TaskRequest → sends to ygg-core via in-memory channel or gRPC (distributed). Emits ingress events.ygg-egressOutway adapters, SSE streaming, output queuing, redaction, retry.OutputEnvelope, StreamFrameReceives OutputEnvelope from ygg-core Site 7. Handles client streams. Emits egress events.ygg-memoryMemory Fabric: WAL, Parquet logs, petgraph live view, snapshots, reconciliation, Observation WAL.WALRecord, Graph, Observation, SnapshotMetaUsed by Context Assembly (read), Orchestrator (checkpoint/terminal), YMIR/Valkyrie (write proposals/observations), Self-Evaluation.ygg-toolbusTool Registry (cache + discovery) + client to Tool Execution service.ToolRef, ToolCallRequest, ToolCallResponseContext Assembly calls discovery. Orchestrator Site 1/2 calls execution. YMIR uses for proactive tools.ygg-modelPlug-and-play LLM layer. Handles routing, fallback, token budgeting, streaming.ModelRequest, ModelResponse, ModelProvider traitCalled by ygg-core (W7) and critic/self-evaluation. Uses context pack routing policy.ygg-contextContext Assembly pipeline (intent resolver → memory resolver → tool resolver → ranker → assembler).ContextPackage, Chunk (with provenance)Called by ygg-core at top of every iteration. Reads from Memory, Toolbus, Context Packs.ygg-ymirBackground intelligence (ticks, maintenance, proactive tasks, Reflector).YmirWakeEvent, JobTypeRuns as Tokio task pool or worker role. Injects tasks via Ingress mapping. Writes proposals to Memory.ygg-valkyrieObserver (post-iteration extraction) + buffer management.ObservationBuffer, ObserverHookAsync hook from ygg-core Site 7. Writes to Observation WAL → feeds Reflector in YMIR.ygg-skuldControl plane (leader election, placement, mailbox, configuration) — only in distributed mode.MailboxEnvelope, PlacementDecisionCoordinates workers in distributed mode. ygg-core and others talk via mailbox.
4. How Everything Wires Together (The Glue)

Monolith mode: Everything runs in one process. Communication is in-memory Tokio channels + DashMap for shared state (registry cache, graph).
Distributed mode: Skuld runs as a 3-node cluster. Workers (orchestrator, frontend, tool_exec, ymir, observer) communicate via gRPC + Mailbox (control plane) for placement/heartbeats. Data-plane (tools, memory) uses shared object store + per-node WAL.
Durability: All critical state (tasks, checkpoints, WAL, observations) goes through ygg-memory. Nothing important lives only in RAM.
Observability: Every crate emits tracing events with the same trace_id / request_id. Events are unified (see Appendix A in spec).
Error handling: thiserror + eyre with context. All public APIs return Result<T, YggError> where YggError carries machine-readable codes from the taxonomy.
Pluggability: LLM providers and tools implement traits. Context Packs drive runtime behaviour.

5. Build & Run Flow (Practical)
Bashcargo run --bin yggd --features monolith   # single binary
# or
cargo run --bin yggd --features distributed -- --mode distributed
The binary starts:

Loads runtime config → decides monolith/distributed.
Starts Skuld (if distributed).
Starts all subsystems in parallel (Tokio tasks or worker roles).
Registers health endpoints and mailbox listeners.
Begins accepting ingress.

6. Next Steps (Implementation Order)

ygg-types + schemas + error taxonomy (foundation).
ygg-core (the 7-site loop + task lifecycle) — this is the heart.
ygg-memory (WAL + graph) — because everything depends on it.
ygg-context + ygg-model (the brain).
ygg-ingress + ygg-egress (I/O).
Tool Bus, YMIR, Valkyrie.
Skuld + distributed mode last.

Phase 0: Final Spec Cleanup 
Do this before any code.

Lock the 7 Continue Sites contracts (most critical missing piece)
I will draft a new section 5.1.3.1 – 5.1.3.7 with exact input/output types, schemas referenced, events emitted, and failure modes for each site.
You review + approve.
Add one full end-to-end happy-path sequence (text + diagram) in a new subsection 5.13.6.
This becomes the "source of truth" for how all crates talk.

Once these two are locked, the spec is ready for code.
Phase 1: Foundation Crates (Week 1–2)
Goal: Build the shared types and memory layer first (everything depends on them).
Week 1 – ygg-types + ygg-memory

Create workspace:Bashcargo new yggdrasil --bin
cd yggdrasil
cargo generate-workspace   # or manually edit Cargo.toml
Crates to create this week:
ygg-types (ULIDs, error taxonomy, common schemas, traits)
ygg-memory (WAL, Parquet, petgraph live view, snapshots, Observation WAL)


What each should contain:

ygg-types: YggError, ULID newtypes with prefixes, TraceId, TenantId, TaskId, shared enums (MessageKind, ContinueSite, RiskLevel, etc.), JSON Schema helpers.
ygg-memory: WALWriter, WALReader, GraphStore (petgraph + DashMap), SnapshotManager, ObservationBuffer, recovery logic.

Milestone end of Week 1:
You can write a test that appends 1000 events to WAL, takes a snapshot, crashes, restarts, and recovers correctly with correct seq ordering.
Week 2 – ygg-core skeleton

Implement the async loop skeleton with the 7 continue sites as an enum + match.
Task state machine (TaskState enum).
Checkpoint / resume logic (using ygg-memory).
Self-Evaluation stub (just the verdict enum for now).

Milestone: A #[tokio::test] that runs one full dummy iteration (no real model/tool calls yet) and hits all 7 sites.
Phase 2: Core Intelligence (Week 3–5)
Week 3: ygg-context + ygg-model

Context Assembly pipeline (the 5-stage DAG you defined).
Prompt assembler that produces coherent system + user messages.
Model Runtime trait + dummy provider (for testing).

Week 4: ygg-toolbus

Registry cache + discovery (embeddings later via fastembed-rs).
Tool execution client (gRPC stub for now).

Week 5: Integrate Context Assembly + Model + Tool Bus into the core loop.
First real end-to-end test: user prompt → context → model call → parse → Site 1–7 → final answer (no real tools yet).
Phase 3: I/O and Background (Week 6–7)
Week 6:

ygg-ingress (HTTP + SSE)
ygg-egress (SSE output)

Week 7:

ygg-ymir + ygg-valkyrie (Observer hook + Reflector)
Basic YMIR tick scheduler

Phase 4: Distributed & Polish (Week 8)

ygg-skuld + mailbox
Monolith vs distributed mode switch
Full conformance vector runner (start with 10 critical vectors)
Logging, tracing, health checks

Recommended Development Rules (to keep it clean)

Never write business logic before the type is defined in ygg-types.
Every public function returns Result<T, YggError> with a machine-readable code.
All cross-crate communication goes through defined contracts (no pub(crate) shortcuts that leak).
Every major flow must have a #[tokio::test] that can run in CI.
Use tracing::instrument on every public async fn.
Write the test first for the happy path of each crate.

This is the exact blueprint you can start coding from tomorrow.
I kept it tight, actionable, and faithful to the ygg_v1.md spec we built together.
Overall Workspace Structure (Copy-Paste Ready)
toml# yggdrasil/Cargo.toml
[workspace]
resolver = "2"
members = [
    "ygg-types",
    "ygg-memory",
    "ygg-core",
    "ygg-context",
    "ygg-model",
    "ygg-toolbus",
    "ygg-ingress",
    "ygg-egress",
    "ygg-ymir",
    "ygg-valkyrie",
    "ygg-skuld",      # only used in distributed mode
]
default-members = ["ygg-core"]

[workspace.dependencies]
tokio = { version = "1.44", features = ["full"] }
tracing = "0.1"
thiserror = "2"
serde = { version = "1.0", features = ["derive"] }
ulid = { version = "1.2", features = ["serde"] }
redb = "2"
parquet = { version = "54", features = ["arrow"] }
petgraph = "0.7"
dashmap = "6"
axum = "0.8"
tower = "0.5"
tonic = "0.12"
prost = "0.13"
1. ygg-types (Shared Foundation)
Purpose: Single source of truth for all IDs, errors, enums, and schemas. No business logic.
Key contents:

All prefixed ULIDs (TaskId, TraceId, RequestId, TenantId, ObservationId, etc.)
YggError enum with all codes from the taxonomy (with retryable, severity)
Enums: MessageKind, ContinueSite, RiskLevel, VerificationType, EvaluationVerdict, LoopDecision
Traits: Provenance, Idempotent
Common types: ContextPackage, OutputEnvelope, SuccessCriteria, EvaluationHint

How it works with others: Every crate depends on ygg-types. No crate invents its own ID or error type.
2. ygg-memory (The Circulatory System)
Purpose: All durable storage — WAL, Parquet logs, live petgraph, snapshots, Observation WAL.
Public API highlights:
Rustpub struct MemoryFabric { ... }

impl MemoryFabric {
    pub async fn append(&self, record: WALRecord) -> Result<Seq, YggError>;
    pub async fn snapshot(&self) -> Result<SnapshotMeta, YggError>;
    pub async fn retrieve(&self, query: RetrievalQuery) -> Result<Vec<Chunk>, YggError>;
    pub async fn rebuild_graph(&self) -> Result<(), YggError>;
    // Observation WAL methods
}
Internals:

WAL uses redb for fast append + group fsync (2ms / 64 entries).
Parquet for immutable logs + edges_history.
Live graph: petgraph::Graph inside DashMap for fast reads.
Snapshots are atomic (metadata rename pattern).

Integration:

Orchestrator writes checkpoints/terminal states here.
Context Assembly reads recent turns + graph here.
YMIR/Valkyrie write proposals/observations here.
Recovery on startup: load latest snapshot + replay WAL tail.

3. ygg-core (The Nervous System)
Purpose: Owns the single async loop with 7 continue sites.
Main struct:
Rustpub struct Orchestrator {
    memory: Arc<MemoryFabric>,
    context: Arc<ContextAssembler>,
    model: Arc<ModelRuntime>,
    toolbus: Arc<ToolBusClient>,
    egress: Arc<EgressSender>,
    // ...
}

impl Orchestrator {
    pub async fn run_task(&self, req: TaskRequest) -> Result<TaskResult, YggError> {
        let mut state = TaskState::new(req);
        while !state.is_terminal() {
            if self.is_cancelled(&state).await? { ... }
            let ctx = self.context.assemble(&state).await?;
            let response = self.model.call(&ctx).await?;
            let parsed = parse_model_response(response)?;
            self.run_continue_sites(&mut state, parsed).await?;
        }
        self.finalize(&state).await
    }
}
7 Continue Sites implemented as:
Rustenum ContinueSite {
    PermissionGate,
    ToolExecution,
    MemoryVerification,
    CriticSafety,
    CompactionCheck,
    SwarmHandoff,
    OutputAndDecision,
}
Each site is a method that takes &mut TaskState and returns SiteResult.
Integration: Central brain. Calls every other crate at the right moment.
4. ygg-context (Context Planner Pipeline)
Purpose: Builds the prompt every iteration.
Pipeline (5 stages):

IntentResolver
MemoryResolver + DomainSnapshotResolver + ToolResolver (parallel)
FreshnessVerifier
ContextRanker + Budgeter
PromptAssembler

Output: ContextPackage with provenance on every chunk.
Integration: Called by ygg-core at the top of every iteration. Reads from ygg-memory, ygg-toolbus, Context Packs.
5. ygg-model (Conscious Layer)
Purpose: Plug-and-play LLM abstraction.
Trait:
Rust#[async_trait]
pub trait ModelProvider: Send + Sync {
    async fn call(&self, req: ModelRequest) -> Result<ModelResponse, YggError>;
}
Implementations: Anthropic, OpenAI, Grok, local Ollama, etc. (via config from Context Pack).
Integration: Called by ygg-core (main loop) and critic/self-evaluation.
6. ygg-toolbus (Circulatory System)
Two parts:

Registry (in-memory cache + Skuld-backed)
Execution Client (gRPC/HTTP to Tool Execution service)

Discovery: semantic + keyword hybrid (embeddings computed at registration).
Integration:

Context Assembly uses discovery.
Orchestrator Site 1 (permission) + Site 2 (execution) use the client.

7. ygg-ingress (Inway)
Purpose: HTTP + terminal adapters, normalization, upload handling.
Flow:
Raw request → validation → blob upload (pre-signed) → IngressMessage → TaskRequest → send to ygg-core.
Integration: Produces tasks for ygg-core.
8. ygg-egress (Outway)
Purpose: SSE streaming, redaction, queuing, retry.
Receives: OutputEnvelope from ygg-core Site 7.
Integration: Only receives from core. Never calls back into the loop (except via events).
9. ygg-ymir (Brain / Background Intelligence)
Purpose: Proactive ticks, maintenance, Reflector.
Runs as:

Dedicated Tokio task pool (monolith)
Worker role (distributed)

Integration: Injects tasks via ingress mapping (daemon principal). Writes proposals to ygg-memory.
10. ygg-valkyrie (Observer)
Purpose: Post-iteration observation extraction.
Runs:

Async hook after Site 7 (non-blocking).
Dedicated worker role in distributed mode.

Integration: Receives buffer from ygg-core → writes to Observation WAL → feeds Reflector in YMIR.
11. ygg-skuld (Control Plane – Distributed Only)
Purpose: Leader election, placement, mailbox transport, config distribution.
Integration: Workers talk to Skuld via mailbox for heartbeats, placement, config changes.
How All Crates Work Together (The Real Flow)
textIngress → ygg-core (TaskRequest)
    ↓
ygg-core calls ygg-context.assemble()
    ↓ (reads)
ygg-memory + ygg-toolbus + Context Packs
    ↓
ygg-core calls ygg-model.call()
    ↓
Parse → 7 Continue Sites loop
    ├── Site 1-2 → ygg-toolbus
    ├── Site 3   → ygg-memory verification
    ├── Site 7   → ygg-egress (OutputEnvelope) + Self-Evaluation
    └── Post-Site7 → ygg-valkyrie (async observer hook)
    
Background:
YMIR (ticks) → injects new TaskRequest via ingress path
Valkyrie Observer → writes observations → YMIR Reflector consolidates
All durable state goes through ygg-memory.
All control goes through ygg-core.
All I/O goes through ingress/egress.

What Yggdrasil Actually Is When Running
Yggdrasil is a self-contained, self-healing agent operating system that you deploy once (as a single binary or Kubernetes deployment) and then it runs forever.
It feels like:

A senior developer + operations analyst + proactive assistant all in one.
It remembers everything accurately (thanks to skeptical graph memory).
It thinks step-by-step, verifies facts, calls tools safely, evaluates its own progress, and keeps improving its own memory in the background.
It can handle both coding tasks and real business processes (WhatsApp orders, CRM updates, inventory, etc.) with the same core.

1. Startup Flow (What Happens When You Run It)

You run yggdrasil --mode monolith (or distributed).
It loads runtime config, decides monolith or distributed mode.
It boots Skuld (control plane — embedded in monolith, cluster in distributed).
All subsystems start in parallel:
Memory Fabric (WAL + petgraph + snapshots)
Tool Registry cache
Context Pack loader
YMIR background scheduler
Valkyrie Observer pool
Ingress listeners (HTTP + terminal)

It emits runtime.mode.started and becomes ready.
Health endpoints and mailbox (if distributed) are live.

Yggdrasil is now “awake” and waiting for work.
2. Main User Request Flow (What Happens on Every Message)
This is the core heartbeat — the 7-continue-site loop you asked about from the very beginning.
Step-by-step when a user sends a message (e.g. “Update my order #4782 to shipped and tell me on WhatsApp”):

Ingress (Inway) receives the raw request (HTTP or terminal).
Validates schema, MIME types, limits, auth, idempotency.
Uploads any images/files to blob storage (pre-signed URLs).
Normalizes everything into a clean TaskRequest.
Durably acks the user and forwards the task to the Orchestrator Core.
Orchestrator Core creates a new task (or resumes an existing one).
Reads cancellation flag.
Calls Context Assembly.
Context Assembly builds a perfect prompt for this exact turn:
Loads rules from Context Packs (global → org → project → session).
Pulls recent conversation, long-term memory, graph relationships.
Runs Freshness Verifier (skeptical check on any claimed facts).
Discovers only the relevant tools (semantic + keyword).
Runs Self-Evaluation criteria derivation.
Budgets tokens, ranks chunks, assembles final ContextPackage with provenance on every piece.
(If context is too big → signals compaction for Site 5.)

Model Runtime calls the LLM (any provider you configured — plug-and-play).
Gets structured response (<thinking>, <tool_call>, or <final_answer>).
Parser turns the raw model output into structured data.
The 7 Continue Sites Loop (the real magic — this is the “agent OS” part):
Site 1 – Permission Gate: Checks risk level + scopes. Approves, denies, or asks for human approval (suspends if needed).
Site 2 – Tool Execution: Runs approved tools (sync or async). Handles parallel calls deterministically. If async, suspends and waits for callback.
Site 3 – Memory Verification: Skeptically checks any memory claims against live data (Tool Bus read). Marks stale if needed.
Site 4 – Critic Safety Review (optional): Reviews output + tools for safety/quality. Can revise or escalate.
Site 5 – Compaction Check: If context budget is high, compacts transcript.
Site 6 – Swarm Handoff (if needed): Spawns isolated child tasks, waits for results, aggregates.
Site 7 – Output + Loop Decision + Self-Evaluation:
Runs Self-Evaluation against Success Criteria.
Decides: iterate, finalize, fail, cancel, or expire.
Emits OutputEnvelope to Egress if needed.
Triggers async Observer hook for Valkyrie.

Egress (Outway) receives the OutputEnvelope.
Redacts secrets, queues, streams via SSE (or terminal), handles retries/idempotency.
User sees the response.
Task ends (or loops back to step 3 if iterate).

Every iteration is fully traceable, checkpointed, and resumable across crashes or node restarts.
3. Background Intelligence (What Keeps Yggdrasil “Alive” and Smart)
While the main loop handles user requests, the background systems run continuously:

YMIR (the Brain):
Wakes every 60 seconds (active tenants) or 5 minutes (idle).
Runs maintenance, consolidation, and proactive tasks.
Can inject new tasks (e.g. “Customer has abandoned cart — should I send a reminder?”).
Reflector job consolidates observations from Valkyrie into clean proposals.
Valkyrie Observer:
Fires after every few turns (or on tool results).
Extracts atomic observations from the raw conversation.
Stores them durably.
Feeds Reflector for long-term memory cleanup.
Memory Fabric Self-Healing:
Continuously reconciles graph, takes snapshots, garbage-collects old data, verifies freshness.

This is what makes Yggdrasil feel agentic and proactive instead of purely reactive like most simple agents.
4. What It Feels Like to Use

As a developer (coding agent): You point it at a Rust codebase. It understands the full graph of files/functions, makes precise changes with Tree-sitter safety, verifies before/after, and keeps memory of past refactors.
As a business user (commerce agent): You message it on WhatsApp. It updates your order in the CRM, checks inventory, sends confirmation, and proactively follows up if something is delayed.
As an admin: You deploy once, add tools via registry, define rules in Context Packs, and watch it scale across tenants.

It is self-hosted, tenant-isolated, graph-aware, skeptical about memory, and always improving its own knowledge in the background.
5. Monolith vs Distributed Mode (Same Behavior, Different Scale)

Monolith: Everything in one process. Super simple to run locally or on a single VM. Perfect for development and small teams.
Distributed: Skuld cluster coordinates multiple worker nodes. Same exact contracts and flows — just scaled horizontally. Used for high-traffic production.

Both modes use the exact same code and contracts — only the transport (in-memory channels vs mailbox) changes.

This is how Yggdrasil actually works when it is alive.
It is no longer a collection of ideas — it is a tight, self-healing loop with proactive intelligence running in the background.

High-Level Picture — What Yggdrasil Actually Is
Yggdrasil is a production-grade agent operating system — a single unified runtime that turns any LLM into a long-running, self-healing, proactive, multi-tenant agent.

It runs forever (monolith binary or Kubernetes deployment).
It handles both coding agents and business agents (WhatsApp/Telegram commerce, CRM, internal tools) with the same core.
It never forgets context accurately (graph + skeptical memory + continuous consolidation).
It thinks step-by-step, verifies facts before acting, evaluates its own progress, and improves its own memory in the background.
It is fully resumable across crashes, node restarts, or even mode switches (monolith ↔ distributed).
Every action is traceable, auditable, permission-checked, and idempotent.

Think of it as Claude Code’s tight loop + Managed Agents’ orchestration + your custom distributed memory + proactive background intelligence, all written in clean Rust.
2. Startup (What Happens When You Run yggdrasil)

Binary starts → reads runtime_config (monolith or distributed).
Skuld (control plane) boots:
Monolith: embedded single-leader.
Distributed: joins 3-node cluster (or unsafe single-node for dev).

All subsystems initialize in parallel (Tokio tasks or worker roles):
Memory Fabric (WAL + petgraph + snapshots ready).
Tool Registry cache warmed from Skuld.
Context Packs loaded.
YMIR scheduler starts ticking.
Valkyrie Observer pool ready.
Ingress listeners (HTTP + terminal) open.

Emits runtime.mode.started + health endpoints live.
Yggdrasil is now “awake” and ready to accept work.

3. Main User Request Lifecycle (The Core Heartbeat)
This is the while(true) loop you asked about since the Claude Code leak. Every user message (or YMIR proactive task) goes through this exact path.
Step-by-step for a real example (“Update order #4782 to shipped and notify me on WhatsApp”):

Ingress (Inway)
Receives raw HTTP/terminal payload.
Validates schema, MIME, size, auth, rate limits, idempotency.
Uploads images/files to blob storage (pre-signed URLs).
Normalizes → canonical TaskRequest.
Durably persists to ingress log + idempotency index.
Emits ingress.request.accepted and forwards to Orchestrator Core.

Orchestrator Core creates/resumes task.
Reads durable cancellation flag.
Calls Context Assembly (top of every iteration).

Context Assembly (Brain’s Prompt Builder)
Loads Context Packs (global → org → project → session, last-write-wins).
Intent Resolver parses trigger + derives SuccessCriteria.
Parallel: MemoryResolver (recent turns + graph subgraph) + DomainSnapshotResolver + ToolResolver (semantic + keyword discovery).
Freshness Verifier runs skeptical checks on concrete claims.
Ranker + Budgeter trims to fit model window (40% system, 25% memory/graph, 20% domain, 10% tools, 5% provenance).
Prompt Assembler builds coherent system + user messages.
Emits ContextPackage with provenance on every chunk.
If budget high → emits compaction signal for Site 5.

Model Runtime calls the LLM (plug-and-play, any provider via Context Pack policy).
Gets raw response.
Parser extracts <thinking>, zero-or-more <tool_call>, optional <final_answer>.

The 7 Continue Sites (the actual orchestration engine)
Site 1 – Permission Gate
Reads risk_level + scopes from Tool Registry cache.
Decides: granted | denied | needs_human.
If needs_human → durable suspend (suspended_at_permission). Resume via callback.
Site 2 – Tool Execution
Dispatches approved tool calls via Tool Bus (permission already passed).
Handles sync (immediate) or async (returns pending_callback + token).
Parallel calls merged deterministically by tool_call_index.
Side-effecting calls journaled to prevent replay duplicates.
If async → durable suspend (suspended_at_external). Resume via tool_callback message.
Site 3 – Memory Verification
For any memory claim about external reality, calls Tool Bus read-only verification (freshness=live).
Compares claimed vs live values → confirmed | stale | suppressed | unverified.
Emits verification events. No suspend.
Site 4 – Critic Safety Review (policy-controlled)
Optional model call reviewing output + tools.
Can return continue | revise | escalate.
Revise → rewrites context and loops.
Optional durable suspend if external critic used.
Site 5 – Compaction Check
If context > 75% of model window → compacts transcript (deterministic truncation fallback if fails).
No suspend.
Site 6 – Swarm Handoff
If model requested sub-agents → spawns child tasks with isolated context.
Parent suspends (suspended_at_swarm).
Children run full loops. Results aggregated deterministically by (parent_task_id, child_task_id).
Resume when all children terminal or timeout reached.
Site 7 – Output + Loop Decision + Self-Evaluation
Runs Self-Evaluation against SuccessCriteria (see section 4 below).
Decides: iterate | finalize | fail | cancel | expire (with explicit reason code).
If finalize/progress → builds OutputEnvelope and sends to Egress.
Triggers async Valkyrie Observer hook (non-blocking).
If suspend needed → writes checkpoint to Memory Fabric WAL.
If terminal → writes final checkpoint + terminal state.

Egress (Outway)
Receives OutputEnvelope.
Redacts secrets, queues durably, streams via SSE (terminal or HTTP).
Handles retries/idempotency per message_type.
Emits delivery events.
Loop back to step 3 unless Site 7 decided terminal.

Resume anywhere: On crash/restart, Orchestrator loads latest checkpoint from Memory Fabric and resumes from the exact suspension point (permission, external callback, swarm, critic).
4. Self-Evaluation (How It Knows When It Is Actually Done)
Inside Site 7 (before final decision):

Loads SuccessCriteria (explicit from user or derived by Intent Resolver).
For each objective:
tool_check → dispatches read-only Tool Bus call and compares result.
output_match → pattern matches accumulated state.
model_assessed → uses evaluation hint in next prompt.

Computes completion score based on policy (all_required / any_required / percentage).
Verdict: done | progress | stuck | failed.
Injects evaluation_hint chunk into next context if stuck/progress.
Feeds verdict directly into Site 7 loop decision (e.g. success_criteria_met → finalize).

This is what makes Yggdrasil actually reliable instead of just “the model stopped talking”.
5. Background Intelligence (What Makes It Proactive)
While the main loop runs:

Valkyrie Observer (async hook after Site 7):
Extracts atomic observations from the last few turns/tool results.
Writes to dedicated Observation WAL (separate from main WAL).
Buffers until full or idle timeout → flushes.
YMIR (the Brain):
Wakes on schedule (60s active / 5min idle) or event (webhook, memory change).
Runs Reflector job: groups observations, deduplicates, resolves contradictions, produces clean proposals.
Writes proposals to ymir_system_context (never mutates user memory directly).
Can create proactive tasks (e.g. “follow up on order”) that enter the main loop as daemon principal.
Memory Fabric Self-Healing:
Continuous reconciliation (every 60s), snapshot creation, graph rebuilds, quota enforcement, stale data cleanup.

6. Durability, Resume, and Safety Guarantees

All state is WAL-first (fsync group commit every 2ms or 64 entries).
Checkpoints written only at suspend points.
Resume always restarts from exact suspension_point with preserved counters.
Idempotency everywhere (24h window for ingress, single-use callback tokens, action journals for tools).
Tenant isolation at every boundary.
Self-evaluation + critic + permission gates prevent runaway behavior.

7. Monolith vs Distributed Mode

Monolith: All crates in one process, in-memory channels, embedded Skuld. Perfect for dev and small scale.
Distributed: Skuld cluster coordinates placement, mailbox for control messages, workers scale independently. Same exact contracts and flows — just different transport.

Both modes use identical code; only the runtime mode flag changes the wiring.

That is exactly how Yggdrasil works in full depth — from the moment you start it until it has been running for weeks, handling thousands of tasks, continuously improving its memory, and proactively helping users.
