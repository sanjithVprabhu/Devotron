# YMIR Runtime Specification (V1 Locked)

## 1. Role and Deployment

YMIR is a subsystem of the Yggdrasil runtime, not a separate service.

Rules (MUST):

1. Physical deployment MAY be:
   1. co-located with orchestrator in monolith mode
   2. scaled as YMIR-role workers in distributed mode
2. In both modes, YMIR MUST use the same internal contracts, schemas, and event envelopes.
3. There is no separate YMIR protocol surface.
4. YMIR MUST NOT bypass ingress/orchestrator/tool/egress contracts.

## 2. Canonical Responsibilities

1. Tenant-scoped wake processing (interval + event-driven).
2. Proposal generation for memory/graph consolidation (`kind=proposal`, `source=ymir`).
3. Reflection job execution over unreflected observations (`job_type=reflection`).
4. Proactive opportunity detection and task enqueue.
5. Context maintenance signals for downstream context assembly.

Out of scope in V1:

1. Direct channel delivery.
2. Direct external I/O bypassing Tool Bus.
3. Cross-tenant intelligence.
4. Per-iteration low-latency observation extraction (owned by Valkyrie Observer, not YMIR).

## 3. Trigger Contract

1. Wakes are scheduled (`interval`) or event-driven (`ingress_activity|memory_write|tool_result|webhook|manual`).
2. Wake envelope MUST conform to `schemas/v1/ymir_wake_event.schema.json`.
3. Wake dedup scope key is `(tenant_id, dedup_key)`.
4. Duplicate wakes in dedup window MUST be dropped and emitted as `ymir.wake.deduped`.
5. YMIR job types are: `maintenance | proactive | reflection`.

Default cadence:

1. active tenants: `60s`
2. idle tenants: `300s` (5 minutes)

## 4. Ingress Mapping (Public Contract Stability)

No new public `message_kind` is introduced in V1.

Allowed mappings:

1. maintenance/proactive-analysis -> `message_kind=system_event`, `principal_type=daemon`, `triggering_cause` required
2. user-facing proactive -> `message_kind=user_prompt`, `principal_type=daemon`, `on_behalf_of` + `triggering_cause` required

Forbidden mappings:

1. YMIR MUST NOT emit `message_kind=tool_callback`.
2. YMIR MUST NOT emit `message_kind=admin`.

## 5. Isolation Policy (Hard Lock)

1. YMIR reads and writes are tenant-scoped.
2. Cross-tenant raw or aggregate intelligence is forbidden in V1.
3. Any scope breach MUST fail with `YMIR_TENANT_SCOPE_VIOLATION`.
4. Cross-tenant aggregate patterns are deferred to V1.1 under explicit tenant opt-in and audit controls.

## 6. Memory Authority (Hard Lock)

1. YMIR MUST NOT write directly to conversation logs, `edges_history`, or live graph.
2. YMIR writes only to dedicated partition `ymir_system_context`.
3. YMIR outputs are proposals only: `kind=proposal`, `source=ymir`.
4. Promotion of proposals into durable memory MUST go through normal orchestrator write path.
5. `ymir_system_context` retention default is `90d` (tenant-overridable).
6. `ymir_system_context` IDs use prefix `ysc_` with ULID format.

## 7. Idempotency, Retry, and Cancellation

Idempotency:

1. `ymir_idempotency_key = sha256(tenant_id || "\\x1f" || task_type || "\\x1f" || canonical_json(input))`
2. canonical JSON format is RFC 8785 JCS.

Retry policy:

1. Proactive task emission is strict at-most-once.
2. No automatic retry on immediate failure.
3. Re-attempt only on next wake and only if input still applies.
4. Failure emits `ymir.proactive.failed`.

Cancellation propagation:

1. Cancelling a YMIR wake MUST cancel all child tasks created by that wake.
2. Cancellation path is deterministic: `wake_id -> task_id set -> per-task cancel flag`.
3. Child cancellation grace uses `cancellation_grace_ms=5000`.
4. Emit `ymir.wake.cancelled` and per-task `core.loop.cancelled`.

## 8. Egress Interaction

1. YMIR does not emit `OutputEnvelope` directly in V1.
2. User-visible output is emitted only by orchestrator Site 7.
3. YMIR-triggered tasks inherit V1 egress scope (`terminal|http_stream`).

## 9. Guardrails

Per-tenant defaults:

1. `max_concurrent_ymir_jobs = 1`
2. `max_ymir_wall_time_ms = 30000`
3. `max_ymir_tool_calls_per_wake = 8`
4. `max_ymir_proactive_tasks_per_wake = 3`
5. `max_ymir_reflection_items_per_tick = 100`

Overflow handling:

1. Emit degraded outcome.
2. Defer residual work.
3. Emit `YMIR_JOB_BUDGET_EXCEEDED` when applicable.

## 10. Required Events

1. `ymir.wake.received`
2. `ymir.wake.deduped`
3. `ymir.tick.started`
4. `ymir.tick.completed`
5. `ymir.autodream.started`
6. `ymir.autodream.completed`
7. `ymir.proactive.detected`
8. `ymir.proactive.failed`
9. `ymir.task.enqueued`
10. `ymir.task.enqueue_failed`
11. `ymir.policy.blocked`
12. `ymir.wake.cancelled`
13. `ymir.error`
14. `ymir.reflection.started`
15. `ymir.reflection.completed`
16. `ymir.reflection.promoted`
17. `ymir.reflection.dropped`
18. `ymir.reflection.trigger_emitted`

All events MUST include: `tenant_id`, `trace_id`, `wake_id`, timestamps.

## 11. Error Families (`YMIR_*` and `REFLECTION_*`)

1. `YMIR_TRIGGER_INVALID`
2. `YMIR_TENANT_SCOPE_VIOLATION`
3. `YMIR_POLICY_BLOCKED`
4. `YMIR_JOB_BUDGET_EXCEEDED`
5. `YMIR_MEMORY_CONSOLIDATION_FAILED`
6. `YMIR_PROACTIVE_TASK_CREATION_FAILED`
7. `YMIR_TASK_ENQUEUE_FAILED`
8. `REFLECTION_PROMOTION_CONFLICT`
9. `REFLECTION_TRIGGER_DEDUPED` (informational code)

## 12. Conformance (CI Gate)

Required roots:

1. `conformance/v1/ymir/accept/`
2. `conformance/v1/ymir/degraded/`
3. `conformance/v1/ymir/reject/`
4. `conformance/v1/ymir/replay/`

Minimum vectors:

1. wake dedup
2. daemon ingress mapping
3. strict tenant isolation rejection
4. budget degradation
5. proactive task creation + enqueue success/failure
6. wake-level cancellation fan-out
