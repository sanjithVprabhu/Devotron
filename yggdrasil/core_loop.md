# Yggdrasil Core Loop Specification (Domain-Agnostic, Hardened V1)

## 1. Purpose

This document defines the canonical orchestrator runtime loop for Yggdrasil.

It is inspired by modern agent runtimes, but this spec is not tied to coding workflows.
Git/worktrees/shell behaviors are adapter concerns, not core-loop requirements.

## 2. Scope and Non-Goals

This spec covers:

1. loop control flow
2. routing by `message_kind`
3. continue-site contracts
4. durability/resume behavior
5. cancellation and termination semantics
6. invariants and conformance criteria

This spec does not define:

1. provider-specific prompt syntax
2. coding-specific execution behavior
3. domain-specific tool payload internals

## 3. Core Model

The orchestrator is one async loop with seven continue sites.

Design principle:

1. states stay compact
2. logic lives in loop code
3. durable persistence only at selected boundaries

Context Assembly is a function called at iteration start, not a continue site.

## 4. Lifecycle States (Locked)

Pre-loop:

1. `accepted`
2. `queued`

Active:

1. `running`

Durable suspend:

1. `suspended_at_permission`
2. `suspended_at_external`
3. `suspended_at_swarm`
4. `suspended_at_critic` (optional)

Terminal:

1. `succeeded`
2. `failed`
3. `cancelled`
4. `expired`

## 5. Routing Matrix (`message_kind -> entry path`)

1. `user_prompt`: new task, enter `running` at Context Assembly.
2. `tool_callback`: resume parent task at Site 2 or Site 6 merge boundary only after validating `parent_request_id`, callback token, tenant ownership, and single-use callback semantics.
3. `system_event`: deterministic system handler; may enter loop if policy allows.
4. `webhook_event`: tenant-filtered event handler; usually enters loop as new task.
5. `admin`: privileged deterministic flow with handler-table dispatch (no 7-site loop by default; model bypass unless explicitly enabled by policy).

## 6. Loop Skeleton (Normative)

```ts
while (!terminal) {
  cancel_signal = readDurableCancellationFlag(task_id)
  enforceGuardrails(task, cancel_signal)
  if (cancel_signal.is_cancelled) {
    decision = runSite7OutputAndDecision(context, "cancel", cancel_signal.reason)
    terminal = "cancelled"
    continue
  }

  iteration_timer = startIterationTimer()

  context = assembleContext(task, memory, recent_results)
  model_response = callModel(context)
  parsed = parseStructured(model_response)

  if (parsed.invalid) {
    context = injectParserFailure(context, parsed.errors)
    decision = runSite7OutputAndDecision(context)
    continue
  }

  if (parsed.has_final_answer && parsed.has_actions) {
    context = injectProtocolViolation(context, "MODEL_OUTPUT_AMBIGUOUS")
    decision = runSite7OutputAndDecision(context, "fail")
    terminal = "failed"
    continue
  }

  if (parsed.has_actions) {
    permission = runSite1PermissionGate(parsed.actions)
    if (permission.needs_human) suspend("suspended_at_permission")
    if (permission.denied) {
      context = injectDeniedResults(context, permission)
      runSite7OutputAndDecision(context)
      continue
    }

    exec = runSite2ActionExecution(parsed.actions)
    if (exec.has_async_pending) suspend("suspended_at_external")
    context = mergeActionResultsDeterministically(context, exec.results)
    if (exec.outcome == "all_failed" && !exec.batch_policy.all_or_nothing_override) {
      decision = runSite7OutputAndDecision(context, "fail", "ITERATION_ALL_ACTIONS_FAILED")
      terminal = "failed"
      continue
    }

    context = runSite3MemoryVerification(context, exec.results)
    critic = runSite4CriticSafetyReview(context, exec.results)
    if (critic.outcome == "escalate") {
      context = injectCriticEscalation(context, critic)
      decision = runSite7OutputAndDecision(context, "fail")
      terminal = "failed"
      continue
    }
    if (critic.outcome == "revise") {
      context = applyCriticRevision(context, critic)
    }
    context = runSite5CompactionCheck(context)

    if (shouldSpawnSubworkers(context, exec.results)) {
      if (task.swarm_depth + 1 > limits.max_swarm_depth) {
        decision = runSite7OutputAndDecision(context, "fail", "LOOP_MAX_SWARM_DEPTH")
        terminal = "failed"
        continue
      }
      context = runSite6SwarmHandoff(context)
      suspend("suspended_at_swarm")
    }
  }

  if (parsed.has_final_answer) {
    context = attachFinalAnswer(context, parsed.final_answer)
    decision = runSite7OutputAndDecision(context, "finalize")
    terminal = "succeeded"
    continue
  }

  if (iterationTimerExceeded(iteration_timer, limits.max_iteration_wall_time_ms)) {
    decision = runSite7OutputAndDecision(context, "fail", "ITERATION_DEADLINE_EXCEEDED")
    terminal = "failed"
    continue
  }

  decision = runSite7OutputAndDecision(context)
  if (decision == "iterate") continue
  if (decision == "finalize") terminal = "succeeded"
  if (decision == "fail") terminal = "failed"
  if (decision == "cancel") terminal = "cancelled"
  if (decision == "expire") terminal = "expired"
}
```

Cancellation flag producers:

1. Ingress admin/API `cancel_task` operation.
2. Outway disconnect handling (`client_disconnected`) for interactive streams.
3. Parent task cancellation propagation to swarm children (`parent_cancelled`).

Iteration definition:

1. One iteration is one pass from loop top to Site 7 decision.
2. Suspend/resume mid-iteration does not increment iteration count.
3. Iteration counter increments only after Site 7 completes.

Resume entry table (normative):

1. `suspended_at_permission`: re-enter Site 1 with cached action set and external decision payload.
2. `suspended_at_external`: re-enter Site 2 at merge phase; inject callback result into pending slot by `parent_request_id`.
3. `suspended_at_swarm`: re-enter Site 6 at aggregation phase; load all child result slots.
4. `suspended_at_critic`: re-enter Site 4 at verdict-apply phase.

## 7. Continue Sites (Backbone Contract)

### Site 1: Permission Gate

When:

1. before every action dispatch

Inputs:

1. action descriptor
2. `risk_level`
3. required scopes
4. principal context
5. tenant policy

Outputs:

1. `granted`
2. `denied`
3. `needs_human`

Durable suspend:

1. yes, only for `needs_human`

Rules:

1. default deny on uncertainty
2. no action can bypass Site 1
3. approval cache key is `(session_id, action_signature)` where `action_signature = hash(tool_id, version, canonical_input)`.
4. cached approval applies only to identical signature; any parameter drift requires new approval.
5. tenant policy MAY set `permission_cache=none` for high-security mode.
6. approval cache is in-memory only and is empty after process restart/resume.

### Site 2: Action Execution

When:

1. after Site 1 grants approval

Inputs:

1. approved actions
2. action envelope (`request_id`, `trace_id`, `tenant_id`, timeout, idempotency where required)

Outputs:

1. sync results
2. async-pending handles
3. structured failures

Durable suspend:

1. yes, when any action returns async callback mode

Rules:

1. bounded parallelism
2. cancellation propagation is mandatory
3. retries follow action-class policy only
4. parallel result merge order MUST be deterministic: `action_index` ascending, then `action_request_id` ascending.
5. side-effecting actions MUST use a durable action journal to prevent duplicate dispatch across crash/retry.
6. callback completion MUST validate callback token single-use, expiry window, and parent ownership before applying results.
7. per-action failures are isolated and injected as structured error results for next-turn reasoning.
8. iteration continues when at least one action succeeded unless batch policy is explicitly `all_or_nothing`.
9. if all actions fail in a non-idempotent batch, Site 7 receives `fail` with reason `ITERATION_ALL_ACTIONS_FAILED`.
10. `side_effect_uncertain=true` is scoped to the affected action result only; it does not automatically fail the whole iteration.
11. callbacks for terminal tasks are rejected with `CALLBACK_TASK_TERMINAL`.
12. callbacks for non-waiting running tasks are queued for 30 seconds; on TTL expiry reject with `CALLBACK_TASK_NOT_WAITING`.
13. streaming async callbacks are allowed with `sequence_num`; merge boundary closes only on `is_final=true`.
14. retry policy table is owned by Tool Bus spec (`ygg_v1.md` Section `5.3`); core loop invokes policy outcomes without reinterpretation.

### Site 3: Memory Verification (Skeptical Check)

When:

1. before trusting critical memory claims

Inputs:

1. candidate memory items
2. referenced artifacts/state

Outputs:

1. `confirmed`
2. `stale`
3. `suppressed`

Durable suspend:

1. no

Rules:

1. memory is optimization, not source of truth
2. stale/conflicting claims must emit correction metadata

### Site 4: Critic Safety Review

When:

1. after execution results, before next iteration

Inputs:

1. current intent
2. recent model output
3. action results
4. policy context

Outputs:

1. `continue`
2. `revise`
3. `escalate`

Durable suspend:

1. optional, only if critic is delegated and long-running

Rules:

1. critic infra failure must degrade safely, not deadlock
2. `revise` rewrites context with critic directives and loops back to next model turn without terminating.

### Site 5: Context Budget and Compaction

When:

1. when context exceeds threshold (default 75% window)

Inputs:

1. transcript/context bundle
2. compaction policy
3. token budget plan

Outputs:

1. compacted context
2. deterministic truncation fallback

Durable suspend:

1. no

Rules:

1. pinned/safety blocks are never dropped
2. compaction must preserve causality and references

### Site 6: Swarm Handoff (Parallel Delegation)

When:

1. task decomposition requires sub-workers

Inputs:

1. child task definitions
2. parent constraints and policy

Outputs:

1. aggregated child outcomes with provenance

Durable suspend:

1. yes, while waiting on children

Rules:

1. sub-workers inherit parent permission boundaries
2. no core dependency on git/worktree semantics
3. each child writes a terminal `task_result_envelope` to slot key `(parent_task_id, child_task_id)`.
4. parent aggregates as `swarm_results: { child_id -> result_envelope }` and injects as synthetic action result.
5. partial swarm success is valid; parent receives all child outcomes (success/fail/cancel/expire).

### Site 7: Output and Loop Decision

When:

1. end of every iteration

Inputs:

1. latest model/action outcomes
2. guardrail counters
3. deadline/cancellation signals

Outputs:

1. `iterate`
2. `finalize`
3. `fail`
4. `cancel`
5. `expire`

Decision payload MUST include a reason code:

1. `finalize`: `model_emitted_final_answer|iteration_budget_reached_with_answer`
2. `fail`: `parser_error|all_actions_failed|critic_escalated|model_refused|internal_error|iteration_deadline_exceeded`
3. `expire`: `wall_time_exceeded|iteration_cap|action_cap|swarm_depth_cap|no_progress_cap`
4. `cancel`: `user_cancelled|admin_cancelled|parent_cancelled|client_disconnected`

Durable suspend:

1. no

Rules:

1. final terminal reason must be explicit and machine-readable
2. stream frames must obey outway contract ordering

## 8. Selective Invocation Rules

Not all sites run on every iteration.

1. No-action model turn: Site 1-6 are skipped, Site 7 decides next step.
2. Pure final-answer turn: Site 7 finalizes directly.
3. Tool-callback resume: iteration may start at Site 2/6 merge path, then continue to Site 3+.

Tool-callback merge semantics:

1. callback for terminal task state is rejected with `CALLBACK_TASK_TERMINAL`.
2. callback for `running` but non-waiting task is buffered for 30 seconds; unresolved buffer expires as `CALLBACK_TASK_NOT_WAITING`.
3. callback for `suspended_at_external` merges by `parent_request_id` into pending slot.
4. suspension resolves only when all `pending_refs` are resolved (or failure policy fires).

Site enablement policy (for Sites 3, 4, 5):

1. policy precedence is `message override > task class policy > tenant default > system default`.
2. system defaults: memory verification `on`, compaction `on`, critic `off`.
3. admin policies may force-enable critic for regulated/high-risk tenants.

## 9. Guardrails and Hard Limits (V1 Defaults)

1. `max_iterations = 32`
2. `max_actions_per_iteration = 16`
3. `max_total_actions = 256`
4. `max_swarm_depth = 3`
5. `max_wall_time_ms = ingress execution.deadline_ms (or tenant default)`
6. `max_no_progress_iterations = 4`
7. `max_iteration_wall_time_ms = 120000`

Progress signal (for no-progress detection) is any one of:

1. new action result materialized
2. context digest changed after assembly/compaction
3. checkpoint state advanced
4. stream output emitted to client

Hard-limit breach must terminate with explicit reason code:

1. `LOOP_MAX_ITERATIONS`
2. `LOOP_MAX_ACTIONS`
3. `LOOP_MAX_SWARM_DEPTH`
4. `TASK_DEADLINE_EXCEEDED`
5. `LOOP_NO_PROGRESS`
6. `ITERATION_DEADLINE_EXCEEDED`

## 10. Parser and Structured Response Contract

Model output must parse into a strict internal structure:

1. final answer segment (optional)
2. action call array (optional)
3. metadata (optional)

Schema reference:

1. parser output MUST conform to `schemas/v1/parsed_model_response.schema.json`.

Output exclusivity rule:

1. `final_answer` and `actions[]` MUST NOT both be present in the same model turn.
2. If both are present, orchestrator MUST fail the turn with `MODEL_OUTPUT_AMBIGUOUS` and execute no actions.

If parsing fails:

1. no action execution is allowed
2. system enters safe fallback path (Site 7 with parser error context)
3. event `core.loop.parse_failed` is emitted

Core observability events (mandatory):

1. `core.loop.task_accepted`
2. `core.loop.task_routed`
3. `core.loop.iteration_started`
4. `core.loop.site_entered`
5. `core.loop.site_completed`
6. `core.loop.suspended`
7. `core.loop.resumed`
8. `core.loop.parse_failed`
9. `core.loop.guardrail_breached`
10. `core.loop.cancelled`
11. `core.loop.iteration_completed`
12. `core.loop.task_terminated`
13. `core.loop.checkpoint_persisted`
14. `core.loop.checkpoint_load_failed`

Each event MUST include:

1. `task_id`
2. `request_id`
3. `trace_id`
4. `tenant_id`
5. `iteration`
6. `seq`

## 11. Durability and Resume

Mandatory durable writes:

1. admission checkpoint (task accepted/routed)
2. action-journal checkpoint for side-effecting action dispatch lifecycle
3. suspend checkpoint (only suspendable sites)
4. terminal checkpoint (completed outcome)

Checkpoint minimum envelope:

```json
{
  "task_id": "tsk_01JY...",
  "checkpoint_id": "ckp_01JY...",
  "state": "suspended_at_external",
  "suspension_point": "site_2_action_execution",
  "iteration": 4,
  "last_emitted_seq": 104,
  "action_count_total": 11,
  "deadline_at": "2026-04-09T09:00:00Z",
  "action_journal_ref": "blob://checkpoints/tsk_01JY/actions-4.json",
  "pending_refs": ["callback:cbt_01JY..."],
  "context_ref": "blob://checkpoints/tsk_01JY/iter-4.json",
  "request_id": "req_01JY...",
  "trace_id": "trc_01JY...",
  "tenant_id": "tenant_42"
}
```

Resume rules:

1. resume starts at the recorded suspension point only
2. counters and lineage IDs are preserved
3. unknown/invalid checkpoint fails closed with auditable error
4. action journal state governs replay: terminal action states are never re-dispatched.
5. resume event emission continues with `last_emitted_seq + 1`.

Context blob lifecycle (`context_ref`):

1. context blobs are written by checkpoint writer at suspend boundaries to `ygg-blob://` storage.
2. context blobs use tenant encryption policy (same per-tenant KMS model as memory/checkpoint artifacts).
3. retention is terminal state + 7 days, then garbage collected.
4. schema is `schemas/v1/core_loop_context_bundle.schema.json`.
5. missing/corrupt `context_ref` on resume MUST fail task with `CHECKPOINT_CONTEXT_LOST`.

Action journal contract (required for side-effecting actions):

1. each action has immutable `action_request_id` and idempotency material hash.
2. durable states: `prepared -> dispatched -> callback_pending|completed|failed|cancelled`.
3. only `prepared` actions may be dispatched.
4. `dispatched` or `callback_pending` actions on resume require reconciliation before any retry.
5. `completed` actions are immutable and must be reused, never re-executed.

Terminal checkpoint schema (required):

```json
{
  "task_id": "tsk_01JY...",
  "checkpoint_id": "ckp_01JY_terminal",
  "state": "succeeded",
  "final_reason": "model_emitted_final_answer",
  "iterations_used": 7,
  "actions_used": 23,
  "duration_ms": 4231,
  "result_envelope_ref": "ygg-blob://results/tsk_01JY/final.json",
  "request_id": "req_01JY...",
  "trace_id": "trc_01JY...",
  "tenant_id": "tenant_42",
  "final_seq": 188,
  "terminated_at": "2026-04-09T09:02:11Z"
}
```

## 12. Cancellation and Timeout Semantics

1. cancellation may be user-driven or system-driven
2. cancellation must propagate to in-flight actions and sub-workers
3. cancellation does not guarantee rollback of external side effects
4. if side-effect certainty is unknown, result must carry `side_effect_uncertain=true`
5. cancellation reason MUST be one of `user_cancelled|admin_cancelled|parent_cancelled|client_disconnected`.

Timeout handling:

1. per-action timeout enforced at Site 2
2. task wall-time timeout enforced at Site 7
3. iteration wall-time timeout enforced per iteration (`max_iteration_wall_time_ms`).
4. timeout reasons are explicit codes, not generic failures

## 13. Streaming Coupling

If streaming is enabled:

1. each streaming connection emits exactly one initial `ack`.
2. loop may emit progress/delta/action frames during iteration.
3. each streaming connection emits exactly one terminal frame: `final` or `error`.
4. no frames are allowed after terminal frame on that connection.
5. `tool_callback` ingress is merge-only and does not itself create a streaming `ack/final` pair.
6. if parent stream is closed, merged callback result lands in task envelope and is read on reconnect (`Last-Event-ID` contract).

Core loop is transport-agnostic; SSE specifics are outway-layer concerns.

## 14. Runtime Invariants (Foolproof Rules)

1. every task keeps immutable lineage ids: `request_id`, `trace_id`, `tenant_id`
2. no action dispatch before Site 1 allow
3. no terminal success without terminal checkpoint persistence
4. deterministic replay is defined by persisted checkpoints plus sequence-ordered events
5. memory hints never override verified authoritative state
6. unknown action schema or unknown enum values are rejected, never coerced
7. permission denial is represented as structured result, not silent drop
8. callback acceptance requires token validity, tenant ownership, and single-use guarantee
9. no side-effecting action may execute twice for the same `action_request_id`
10. no-progress streak beyond configured limit must terminate with `LOOP_NO_PROGRESS`
11. model turn contract is exclusive: a single turn cannot contain both `final_answer` and `actions[]`

## 15. Conformance Checklist (Definition of Done)

The loop is lock-ready only if these tests pass:

1. deterministic replay from checkpoint
2. parser-malformed output safe path (no actions executed)
3. permission-denied path does not execute actions
4. async callback resume correctness
5. cancellation propagation to action workers
6. swarm child isolation and permission inheritance
7. compaction correctness under budget pressure
8. deadline expiry deterministic termination
9. streaming frame order invariant
10. mixed model output (`final_answer + actions`) rejection path
11. crash-after-dispatch replay does not duplicate side-effecting actions
12. callback token replay/reuse rejection
13. deterministic parallel result merge order
14. no-progress breaker triggers at configured threshold
15. suspend/resume re-entry table correctness per suspend state
16. callback for terminal task returns `CALLBACK_TASK_TERMINAL`
17. missing/corrupt `context_ref` fails with `CHECKPOINT_CONTEXT_LOST`
18. permission cache hit/miss semantics by action signature
19. iteration timeout path triggers `ITERATION_DEADLINE_EXCEEDED`

## 16. Final Statement

Yggdrasil Core Loop is a site-driven orchestration runtime for multi-domain agents and automations.

It intentionally reuses proven loop ideas while removing coding-agent-only assumptions, so the same runtime can serve commerce, support, operations, analytics, and coding as just one optional vertical.
