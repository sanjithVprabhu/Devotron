# Egress Layer Specification (V1 Locked)

## 1. Purpose and Isolation

The Egress Layer (`Outway`) is responsible for delivering orchestrator outputs to user-facing transports.

Isolation rules (MUST):

1. The orchestrator emits structured `OutputEnvelope` objects and MUST NOT call channel/provider APIs directly.
2. Egress consumes `OutputEnvelope` objects and MUST NOT invoke the core loop directly.
3. Egress feedback returns as events persisted to memory/event streams; it does not mutate core-loop state in-process.

## 2. V1 Channel Scope

V1 channels are locked to:

1. `terminal`
2. `http_stream` (SSE over POST, per `ygg_v1.md` Section 4.7)

Out of scope for V1 (deferred to V1.1): `whatsapp`, `telegram`, `rcs`, `sms`, `email`, `slack`, and other external messaging channels.

## 3. Canonical Orchestrator -> Egress Contract

Contract name is locked as `OutputEnvelope`.

Schema source of truth:

1. `schemas/v1/output_envelope.schema.json`
2. Referenced by both core-loop and egress implementations

`OutputEnvelope` fields (normative):

1. `schema_version`
2. `output_id`
3. `task_id`
4. `request_id`
5. `trace_id`
6. `tenant_id`
7. `session_id` (nullable)
8. `channel` (`terminal|http_stream` in V1)
9. `message_type` (`progress|final|error|proactive`)
10. `idempotency_key` (derived from `tenant_id + output_id + channel` by orchestrator)
11. `payload` (text/structured metadata)
12. `priority`
13. `expires_at` (optional)
14. `created_at`

## 4. Acknowledgement and Durability Semantics

Ack point is locked to durable queue persistence.

Rules (MUST):

1. Egress ACK to orchestrator is emitted only after durable enqueue succeeds.
2. ACK MUST NOT wait for provider acceptance, delivery, or read receipts.
3. Provider acceptance and later delivery/read status are separate async events.
4. If durable enqueue fails, egress returns an `EGRESS_*` failure envelope and no ACK.

## 5. Streaming Alignment (HTTP SSE)

For `http_stream`, egress MUST follow Section 4.7 frame rules.

Rules (MUST):

1. Per connection, first frame is exactly one `ack`.
2. Zero or more intermediate frames (`delta`, tool/memory events, heartbeat) may follow.
3. Last frame is exactly one `final` or `error`.
4. No frames may be emitted after `final` or `error`.
5. `tool_callback` is merge-only and MUST NOT create a new standalone `ack/final` pair.

## 6. Retry Policy by Message Type

Locked delivery semantics:

1. `progress`: at-most-once (no retry)
2. `final`: at-least-once, max 3 retries with exponential backoff
3. `error`: at-least-once, max 5 retries with longer backoff
4. `proactive`: at-most-once

Terminal retries (`final`, `error`) MUST use idempotent send semantics keyed by `idempotency_key`.

## 7. Idempotency Contract

Orchestrator generates idempotency key as:

`(tenant_id, output_id, channel)`

Egress rules (MUST):

1. Maintain dedup index on `(tenant_id, output_id, channel)`.
2. Duplicate send with same key returns prior send outcome (or no-op with success).
3. Duplicate with same key but incompatible payload returns `IDEMPOTENCY_VIOLATION`.

## 8. Templates and Fallback Policy Sources

Locked source of truth is Context Packs.

Rules:

1. Template definitions are stored as signed, versioned assets in Context Packs.
2. Fallback order policy is read from tenant pack key `egress.fallback_order`.
3. In V1, since channel set is `terminal/http_stream`, fallback is effectively transport/path fallback within those two channels.
4. Multi-channel external fallback chains are deferred to V1.1.

## 9. Security and Compliance

Rules (MUST):

1. Outbound redaction is enforced in egress before provider send.
2. Per-tenant keying is mandatory for encrypted at-rest artifacts and credential material.
3. Channel credentials are tenant-isolated and retrieved by secure references only.
4. Secret values MUST NOT appear in logs, traces, events, or envelopes.

## 10. Error Family (EGRESS_*)

The egress layer adds and uses these codes:

1. `EGRESS_QUEUE_FULL`
2. `EGRESS_CHANNEL_UNAVAILABLE`
3. `EGRESS_TEMPLATE_RENDER_FAILED`
4. `EGRESS_DELIVERY_FAILED`
5. `EGRESS_RATE_LIMITED`

These codes map through the global `ErrorEnvelope` contract.

## 11. Observability Events (required)

Egress MUST emit structured events with `tenant_id`, `request_id`, `trace_id`, `output_id`, `channel`.

Required events:

1. `egress.output.queued`
2. `egress.output.acknowledged`
3. `egress.output.send_attempted`
4. `egress.output.sent`
5. `egress.output.failed`
6. `egress.output.deduplicated`
7. `egress.output.rate_limited`
8. `egress.output.delivery.reported`
9. `egress.output.read.reported`
10. `egress.queue.full`

## 12. V1.1 Deferred Items

Deferred explicitly:

1. External messaging channels (WhatsApp/Telegram/RCS/SMS/Email/Slack)
2. Rich media template matrices per channel
3. Provider-specific receipt normalization differences
4. Cross-channel fallback orchestration beyond `terminal/http_stream`

## 13. Conformance Vectors (CI Gate)

The following vectors are mandatory and block merge on failure:

Accept vectors:

1. `conformance/v1/egress/accept/output_envelope_progress_terminal_http_stream.json`
2. `conformance/v1/egress/accept/output_envelope_final_scope_enforcement_and_delivery.json`
3. `conformance/v1/egress/accept/output_envelope_error_default_fallback_channel.json`

Failure vectors:

1. `conformance/v1/egress/failure/egress_queue_full.json`
2. `conformance/v1/egress/failure/egress_channel_unavailable_with_v1_fallback.json`
3. `conformance/v1/egress/failure/egress_template_render_failed_plaintext_degrade.json`
4. `conformance/v1/egress/failure/egress_rate_limited_eventual_delivery_no_duplicates.json`
5. `conformance/v1/egress/failure/egress_delivery_failed_after_retries_and_fallbacks.json`
