# Yggdrasil V1 - Architecture and Protocol Specification

Status: Draft 1 (spec-first, no implementation yet)  
Scope: Define contracts, syntax, module boundaries, and uniform standards before writing code.

## 1. Why "strict plugin protocol now" is a critical decision

If we delay protocol design, the marketplace breaks later in predictable ways:

1. Incompatible extensions: each partner invents their own request/response shape.
2. Security gaps: no uniform permissions, auth, or audit guarantees.
3. Operational chaos: no shared health checks, retries, timeouts, or error model.
4. Vendor lock by accident: integrations become one-off custom adapters.
5. Monetization friction: billing and usage events are inconsistent.

So protocol-first is not optional for Yggdrasil. It is the foundation for scale.

## 2. System Lexicon (canonical names)

1. Nervous System -> Orchestrator Core
2. Circulatory System -> Tool Bus
3. Inway -> Ingress Adapters
4. Outway -> Egress Adapters
5. Brain -> Daemon Runtime
6. Memory -> Memory Fabric
7. Conscious -> Model Runtime
8. Context File -> Context Packs

## 3. V1 Non-negotiable Principles

1. Contract-first: every module interaction defined by schema.
2. Default deny: no capability or scope granted implicitly.
3. Deterministic envelopes: requests, responses, errors, events are standardized.
4. Backward compatibility: SemVer + explicit deprecation lifecycle.
5. Idempotency everywhere: safe retries for distributed failures.
6. Full observability: trace IDs and audit events on every critical path.

## 4. Protocol Layer (normative)

The words MUST, SHOULD, MAY are normative.

### 4.1 Manifest Contract (install-time identity + capability declaration)

Every extension MUST ship a signed `manifest.json`.

```json
{
  "schema_version": "1.0.0",
  "plugin_id": "com.acme.crm_hubspot",
  "display_name": "HubSpot CRM Adapter",
  "version": "1.2.0",
  "kind": "inway",
  "description": "Ingress adapter for HubSpot events",
  "entrypoint": {
    "transport": "http",
    "url": "https://adapter.acme.com/ygg/v1"
  },
  "compatibility": {
    "ygg_core_min": "1.0.0",
    "ygg_core_max": "1.x"
  },
  "capabilities": [
    {
      "name": "crm.contact",
      "version": "1.0.0",
      "actions": ["crm.contact.get", "crm.contact.search"],
      "events": ["crm.contact.created", "crm.contact.updated"]
    }
  ],
  "scopes": ["crm.contact.read", "crm.contact.write"],
  "auth": {
    "type": "oauth2_client_credentials",
    "token_url": "https://auth.acme.com/oauth/token",
    "audience": "yggdrasil-core"
  },
  "limits": {
    "default_timeout_ms": 10000,
    "max_timeout_ms": 60000,
    "max_concurrency": 20,
    "max_payload_kb": 512
  },
  "ingress_limits": {
    "max_parts": 32,
    "max_file_size_mb": 25,
    "max_total_payload_mb": 100,
    "text": {
      "max_chars": 100000
    },
    "image": {
      "max_count": 8,
      "max_dimension": 4096
    },
    "audio": {
      "max_duration_ms": 600000
    },
    "file": {
      "max_size_mb": 25
    }
  },
  "signature": {
    "algorithm": "ed25519",
    "key_id": "acme-prod-2026-01",
    "value": "BASE64_SIGNATURE"
  }
}
```

Manifest rules:

1. `plugin_id` MUST be globally unique (reverse-DNS style).
2. `version` MUST follow SemVer.
3. `capabilities` MUST enumerate every exposed action/event.
4. `scopes` MUST be least-privilege and install-granted explicitly.
5. Unsigned manifests MUST be rejected in marketplace mode.
6. For `kind=inway`, `ingress_limits` MUST be declared as adapter-supported maximums.
7. Runtime tenant limits MUST stay within both core hard ceilings and adapter-supported maximums.

### 4.2 Handshake Contract (runtime negotiation)

Handshake sequence:

1. `HELLO` (plugin identity + build info)
2. `CAPABILITIES` (declared runtime features)
3. `NEGOTIATE` (core sends accepted versions and limits)
4. `READY` (plugin confirms)
5. `HEALTH` periodic checks

Minimal handshake payload:

```json
{
  "protocol_version": "1.0.0",
  "plugin_id": "com.acme.crm_hubspot",
  "plugin_version": "1.2.0",
  "trace_id": "trc_01JY...",
  "nonce": "n-1843",
  "timestamp": "2026-04-08T08:00:00Z"
}
```

Handshake rules:

1. If `protocol_version` is incompatible, connection MUST fail fast.
2. Core MUST compute capability intersection, not blind trust.
3. Readiness MUST fail if auth/token bootstrap fails.
4. Health MUST expose `liveness`, `readiness`, `degraded_reason`.

Protocol support advertisement (health/version surface):

```json
{
  "protocol": "ygg-ingress",
  "current": "1.2.0",
  "supported_range": ">=1.0.0 <2.0.0",
  "deprecated_versions": ["1.0.x"],
  "deprecation_sunset": "2026-09-01T00:00:00Z"
}
```

### 4.3 Action Contract (invocation semantics)

Every action call MUST use the same envelope.

```json
{
  "request_id": "req_01JY...",
  "trace_id": "trc_01JY...",
  "idempotency_key": "idem_abc123",
  "tenant_id": "tenant_42",
  "plugin_id": "com.acme.crm_hubspot",
  "action": "crm.contact.search",
  "timeout_ms": 8000,
  "input": {
    "email": "user@example.com"
  },
  "metadata": {
    "initiator": "daemon",
    "priority": "normal"
  }
}
```

Standard response envelope:

```json
{
  "request_id": "req_01JY...",
  "trace_id": "trc_01JY...",
  "status": "succeeded",
  "duration_ms": 153,
  "output": {
    "contacts": []
  },
  "usage": {
    "compute_ms": 120,
    "billable_units": 1
  }
}
```

Standard error envelope:

```json
{
  "request_id": "req_01JY...",
  "trace_id": "trc_01JY...",
  "server": {
    "protocol_version": "1.2.1",
    "supported_range": ">=1.0.0 <2.0.0"
  },
  "status": "failed",
  "error": {
    "code": "AUTH_INVALID_TOKEN",
    "message": "Access token is expired",
    "retryable": true,
    "retry_after_ms": 1000
  }
}
```

Action rules:

1. `request_id` and `trace_id` MUST be present.
2. `idempotency_key` MUST be required for non-read actions.
3. Timeout behavior MUST return `TIMED_OUT` (not silent failure).
4. Error `code` MUST be machine-parseable and stable.
5. Responses MUST include `server.protocol_version` and `server.supported_range` metadata.

### 4.4 Permission Model (least privilege)

Permission dimensions:

1. Principal: `user`, `daemon`, `system`, `plugin`.
2. Resource: `domain.resource` (example: `crm.contact`).
3. Verb: `read`, `write`, `delete`, `execute`, `admin`.
4. Scope syntax: `domain.resource.verb` (example: `crm.contact.read`).

Policy model:

1. Install-time grants: admin approves requested scopes.
2. Runtime guard: each action rechecked against principal + tenant + environment.
3. Optional interactive approval for high-risk scopes.
4. Denials MUST emit audit events.

### 4.5 Event Model (observability + billing + audit)

Yggdrasil event envelope (CloudEvents-inspired):

```json
{
  "event_id": "evt_01JY...",
  "event_type": "tool.action.completed",
  "event_version": "1.0.0",
  "occurred_at": "2026-04-08T08:01:00Z",
  "trace_id": "trc_01JY...",
  "span_id": "spn_01JY...",
  "causation_id": "req_01JY...",
  "correlation_id": "corr_01JY...",
  "tenant_id": "tenant_42",
  "actor": {
    "type": "daemon",
    "id": "brain_main"
  },
  "source": {
    "component": "tool_bus",
    "plugin_id": "com.acme.crm_hubspot"
  },
  "data": {},
  "billing": {
    "billable_units": 1,
    "meter_key": "tool_invocation"
  }
}
```

Mandatory event families for V1:

1. `ingress.*` (accepted/rejected/normalized/uploaded)
2. `security.*` (grant/deny/escalation)
3. `tool.action.*` (started/completed/failed)
4. `model.inference.*` (request/response/errors)
5. `memory.*` (read/write/verify/conflict)
6. `daemon.tick.*` (tick decision and outcomes)
7. `marketplace.*` (install/update/uninstall/signature-check)

Ingress upload lifecycle events (required in V1):

1. `ingress.upload.requested`
2. `ingress.upload.committed`
3. `ingress.upload.verification_failed`
4. `ingress.upload.expired`
5. `ingress.upload.referenced`
6. `ingress.upload.orphaned`

### 4.6 Ingress Contract (two-step normalization)

V1 decision:

1. Use multimodal `parts[]`, not single `data_type`.
2. Use storage references for binary inputs in production (`storage_ref`), not inline base64.
3. Use two-step model: `IngressMessage` (adapter-facing) -> canonical `TaskRequest` (orchestrator-facing).

#### 4.6.1 Adapter-facing envelope: `IngressMessage`

Each inway adapter (`terminal`, `http`, later `grpc`) MAY accept channel-native input, but MUST normalize into:

```json
{
  "schema_version": "1.0.0",
  "message_kind": "user_prompt",
  "message_id": "msg_01JY...",
  "request_id": "req_01JY...",
  "trace_id": "trc_01JY...",
  "idempotency_key": "idem_01JY...",
  "tenant_id": "tenant_42",
  "user_id": "usr_123",
  "conversation_session_id": "ses_abc",
  "parent_message_id": null,
  "source": {
    "adapter": "http",
    "adapter_version": "1.0.0",
    "reply_to": null,
    "client": {
      "user_agent": "ygg-web/2.4.1",
      "ip": "203.0.113.10",
      "device_id": "dev_901",
      "client_version": "web-2.4.1"
    }
  },
  "auth": {
    "principal_type": "user",
    "token_ref": "tok_...",
    "granted_scopes": ["chat.send", "tool.read"],
    "authenticated_at": "2026-04-08T08:00:00Z"
  },
  "parts": [
    {
      "type": "text",
      "text": "what's wrong with this screenshot?"
    },
    {
      "type": "image",
      "mime_type": "image/png",
      "name": "screenshot.png",
      "size_bytes": 184320,
      "sha256": "abc...",
      "storage_ref": "blob://ingress/2026/04/08/abc.png",
      "width": 1920,
      "height": 1080
    },
    {
      "type": "audio",
      "mime_type": "audio/wav",
      "name": "note.wav",
      "size_bytes": 882000,
      "sha256": "def...",
      "storage_ref": "blob://ingress/2026/04/08/clip.wav",
      "duration_ms": 5000,
      "sample_rate_hz": 44100,
      "channels": 1,
      "transcription_hint": "auto"
    },
    {
      "type": "file",
      "mime_type": "application/pdf",
      "name": "report.pdf",
      "size_bytes": 2048000,
      "sha256": "xyz...",
      "storage_ref": "blob://ingress/2026/04/08/report.pdf"
    }
  ],
  "response_preferences": {
    "stream": true,
    "format": "markdown",
    "locale": "en-US"
  },
  "execution": {
    "priority": "normal",
    "deadline_ms": 30000,
    "allowed_capabilities": null,
    "denied_capabilities": null
  },
  "client_sent_at": "2026-04-08T08:00:00.000Z",
  "received_at": "2026-04-08T08:00:00.040Z"
}
```

#### 4.6.2 Canonical orchestrator envelope: `TaskRequest`

`TaskRequest` is the internal contract consumed by the Orchestrator Core.

```json
{
  "schema_version": "1.0.0",
  "message_kind": "user_prompt",
  "request_id": "req_01JY...",
  "trace_id": "trc_01JY...",
  "idempotency_key": "idem_01JY...",
  "tenant_id": "tenant_42",
  "actor": {
    "principal_type": "user",
    "principal_id": "usr_123",
    "granted_scopes": ["chat.send", "tool.read"]
  },
  "conversation": {
    "conversation_session_id": "ses_abc",
    "message_id": "msg_01JY...",
    "parent_message_id": null
  },
  "input": {
    "parts": [
      {
        "type": "text",
        "text": "what's wrong with this screenshot?"
      }
    ]
  },
  "routing": {
    "source_adapter": "http",
    "reply_to": null
  },
  "preferences": {
    "stream": true,
    "format": "markdown",
    "locale": "en-US"
  },
  "execution": {
    "priority": "normal",
    "deadline_ms": 30000,
    "allowed_capabilities": null,
    "denied_capabilities": null
  },
  "timing": {
    "client_sent_at": "2026-04-08T08:00:00.000Z",
    "received_at": "2026-04-08T08:00:00.040Z"
  }
}
```

#### 4.6.3 `parts[]` schema

Part types for V1:

1. `text`
2. `image`
3. `audio`
4. `file`
5. `tool_callback_result` (control part; valid only when `message_kind=tool_callback`)

Base attachment fields (`image|audio|file`):

1. `mime_type` (required)
2. `size_bytes` (required)
3. `sha256` (required in production)
4. `storage_ref` (required in production)
5. `name` (optional, but recommended)

Image-specific optional fields:

1. `width`
2. `height`

Audio-specific optional fields:

1. `duration_ms`
2. `sample_rate_hz`
3. `channels`
4. `transcription_hint` (`auto|force|skip`)

`tool_callback_result` required fields:

1. `parent_request_id`
2. `tool_call_index`
3. `callback_token`
4. `status` (`success|failed|cancelled`)
5. `sequence_num` (required for streamed callbacks)
6. `is_final_fragment` (required for streamed callbacks)

`tool_callback_result` optional fields:

1. `result` (present on success)
2. `error` (present on failed)

#### 4.6.4 Validation and policy rules

Accepted `message_kind` enum:

1. `user_prompt`
2. `tool_callback`
3. `system_event`
4. `webhook_event`
5. `admin`

Requiredness matrix:

1. MUST include `schema_version`, `message_kind`, `message_id`, `request_id`, `trace_id`, `tenant_id`, `source.adapter`, `auth.principal_type`, `parts`, `received_at`.
2. MUST include `user_id` and `conversation_session_id` when `message_kind=user_prompt`.
3. MUST include `idempotency_key` for mutating or non-read workflows; SHOULD be present for all ingress traffic.
4. SHOULD include `client_sent_at` and `parent_message_id` when available.
5. MAY include `response_preferences`, `execution`, and optional `source.client.*` metadata.
6. If `response_preferences.stream=true`, response MUST follow Section `4.7` streaming contract.

Minimum-content rules:

1. `parts` MUST contain at least 1 element; empty arrays MUST return `VALIDATION_EMPTY_MESSAGE`.
2. Text parts MUST contain non-empty `text` after trim; empty text MUST return `VALIDATION_EMPTY_TEXT_PART`.
3. Binary parts (`image|audio|file`) MUST include a resolvable `storage_ref`; missing reference MUST return `VALIDATION_MISSING_STORAGE_REF`.
4. `tool_callback_result` parts MUST only appear when `message_kind=tool_callback`; otherwise reject `VALIDATION_UNSUPPORTED_PART_TYPE`.
5. `tool_callback` messages MUST include exactly one `tool_callback_result` part in `parts[0]` for V1.

Field caps and patterns:

1. `tenant_id`, `user_id`, `conversation_session_id` max length 128, pattern `^[a-zA-Z0-9_-]+$`.
2. `message_id`, `request_id`, `trace_id` max length 64 and MUST keep expected prefix (`msg_`, `req_`, `trc_`).
3. `name` (filename) max length 255.
4. `mime_type` max length 127.
5. `response_preferences.locale` max length 35 and SHOULD follow BCP 47.
6. `storage_ref` max length 1024.

Encoding and parser hardening:

1. Wire format MUST be `application/json; charset=utf-8`.
2. Strings MUST be UTF-8, NFC-normalized, and MUST NOT contain null bytes.
3. C0 control chars are disallowed except tab/newline/carriage return.
4. Max JSON nesting depth is 32.
5. Max raw request size MUST be `max_total_payload_mb + 16KB` envelope overhead.

Unknown fields policy:

1. Unknown top-level fields MUST be ignored for forward compatibility and SHOULD emit `schema.forward_compat.unknown_field`.
2. Unknown fields inside `parts[*]` MUST be rejected as `VALIDATION_UNKNOWN_FIELD`.
3. Unknown fields inside `auth.*` MUST be rejected as `VALIDATION_UNKNOWN_FIELD`.
4. Unknown enum values in known fields MUST be rejected as `VALIDATION_FIELD_PATTERN`.

Timestamp and clock rules:

1. MUST use RFC3339 UTC for `client_sent_at`, `received_at`, `authenticated_at`.
2. `client_sent_at` > +5 minutes in the future MUST return `VALIDATION_CLOCK_SKEW`.
3. `client_sent_at` older than 24 hours MUST return `VALIDATION_CLOCK_SKEW`.
4. Server ordering and audit MUST rely on `received_at`, not `client_sent_at`.

Security rules:

1. Inline base64 payloads MUST be rejected in production mode.
2. `token_ref` MUST be redacted from logs.
3. Payloads exceeding effective ingress limits MUST be rejected.

#### 4.6.5 Normalization flow

1. Adapter receives native input and authenticates principal.
2. Binary uploads are persisted to blob/object storage.
3. Adapter computes metadata (`size_bytes`, `sha256`, media dimensions where available).
4. Adapter emits `IngressMessage`.
5. Inway normalizer maps `IngressMessage` -> `TaskRequest`.
6. Inway emits `ingress.request.accepted` (or `ingress.request.rejected`).

#### 4.6.6 V1 ingress limits (core ceilings)

V1 uses a three-level limit model so limits can vary by client/plan:

1. `core_hard_max`: absolute platform safety boundary.
2. `core_default_profile`: default limits for new tenants.
3. `tenant_effective_limits`: resolved per tenant/plan at request time.
4. If `core_hard_max` is not explicitly configured, it defaults to `core_default_profile`.

`core_default_profile` for V1:

```json
{
  "max_parts": 32,
  "max_file_size_mb": 25,
  "max_total_payload_mb": 100,
  "text": {
    "max_chars": 100000
  },
  "image": {
    "max_count": 8,
    "max_dimension": 4096
  },
  "audio": {
    "max_duration_ms": 600000
  },
  "file": {
    "max_size_mb": 25
  }
}
```

Per-tenant configurability:

1. Every tenant MUST be assigned a `limit_profile_id` (for example `starter`, `growth`, `enterprise`).
2. A tenant MAY have explicit `tenant_limit_overrides` for contracted plans.
3. Higher-paying plans MAY increase limits above `core_default_profile`.
4. No profile or override MAY exceed `core_hard_max`.
5. No profile or override MAY exceed adapter `ingress_limits` declared in manifest.

Limit enforcement rules:

1. Core hard ceilings MUST be enforced globally.
2. Inway adapter manifests MUST declare supported `ingress_limits`.
3. Tenant plans MAY tighten or raise limits relative to `core_default_profile`.
4. Runtime effective limit per field = `min(core_hard_max, adapter_ingress_limits, tenant_plan_or_override)`.
5. If tenant plan is missing, runtime MUST fallback to `core_default_profile`.
6. Violations MUST return `VALIDATION_LIMIT_EXCEEDED` and emit `ingress.request.rejected`.
7. `max_file_size_mb` is a convenience alias for `file.max_size_mb`; if both are set, values MUST match.

#### 4.6.7 Idempotency and replay policy (V1)

V1 decision:

1. Idempotency window is 24 hours.

Rules:

1. Ingress MUST persist `(tenant_id, idempotency_key)` for 24 hours from `received_at`.
2. Duplicate requests within the window MUST return the original result envelope (same `request_id` and status).
3. If original processing is still in-flight, duplicate requests MUST return `status=in_progress` with original `request_id`.
4. After 24 hours, the same `idempotency_key` MAY be treated as a new request.
5. If `idempotency_key` is absent, ingress MUST generate one before normalization.
6. Reuse of same `(tenant_id, idempotency_key)` with materially different payload inside window MUST return `VALIDATION_IDEMPOTENCY_KEY_REUSED`.

#### 4.6.8 MIME allowlist and attachment acceptance

Attachments are accepted only when `mime_type` is in the allowlist below.

`image` allowlist:

1. `image/png`
2. `image/jpeg`
3. `image/webp`
4. `image/gif`
5. `image/heic`

`audio` allowlist:

1. `audio/wav`
2. `audio/mpeg`
3. `audio/ogg`
4. `audio/flac`
5. `audio/mp4`
6. `audio/webm`

`file` allowlist:

1. `application/pdf`
2. `text/plain`
3. `text/markdown`
4. `text/csv`
5. `application/json`
6. `application/vnd.openxmlformats-officedocument.wordprocessingml.document`
7. `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`

Rejected by default in V1:

1. Archive formats (`application/zip`, `application/x-tar`, `application/x-7z-compressed`, etc.)
2. Executables and installer formats (`application/x-msdownload`, etc.)
3. Active scriptable document formats unless explicitly enabled by security policy.

Unsupported MIME handling:

1. Unsupported MIME MUST return `VALIDATION_UNSUPPORTED_MIME_TYPE`.

#### 4.6.9 Binary upload protocol (pre-signed URL only in V1)

V1 decision:

1. Binary data upload uses pre-signed URL flow only.
2. Inline binary bytes in ingress message are disallowed in production.

Endpoint contract:

`POST /v1/uploads`  
Headers: `Authorization`, `Content-Type: application/json`, optional `Idempotency-Key`

Request:

```json
{
  "tenant_id": "tenant_42",
  "intended_part_type": "image",
  "mime_type": "image/png",
  "size_bytes": 184320,
  "sha256": "abc123...",
  "filename": "screenshot.png"
}
```

Response:

```json
{
  "storage_ref": "ygg-blob:v1:tenant_42:01JY8K3M6N7P8Q9R0STUVWXYZAB",
  "upload": {
    "url": "https://blob.ygg.io/u/abc?sig=...",
    "method": "PUT",
    "headers": {
      "Content-Type": "image/png",
      "Content-Length": "184320",
      "X-Content-SHA256": "abc123..."
    }
  },
  "expires_at": "2026-04-08T08:15:00Z",
  "verification_deadline_ms": 60000,
  "max_upload_duration_ms": 60000
}
```

Flow:

1. Client allocates slot with `POST /v1/uploads`.
2. Client uploads bytes directly to blob storage using returned pre-signed URL.
3. Client sends `IngressMessage` referencing `storage_ref`.

Upload protocol rules:

1. Calling `/v1/uploads` MUST require `ingress.upload` scope.
2. `/v1/uploads` MUST validate `intended_part_type`, `mime_type`, and `size_bytes` against effective limits before issuing URL.
3. Pre-signed URL TTL default is 15 minutes and MUST NOT exceed 60 minutes.
4. Single-PUT max size is 25 MB in V1.
5. Upload slot cap is 16 concurrent pending/uploading slots per principal.
6. Slot allocation retries SHOULD use `Idempotency-Key`; retries in-window MUST return same slot.
7. On ingress receipt, system MUST verify `storage_ref` exists, belongs to same tenant, and checksum matches `sha256`.
8. Missing storage object MUST return `VALIDATION_STORAGE_REF_NOT_FOUND`.
9. Cross-tenant or unissued `storage_ref` MUST return `VALIDATION_STORAGE_REF_OWNERSHIP`.
10. Checksum mismatch MUST return `VALIDATION_STORAGE_REF_CHECKSUM`.
11. MIME sniff mismatch against declared `mime_type` MUST return `VALIDATION_MIME_TYPE_MISMATCH`.
12. Upload completion verification timeout is 60 seconds; timeout marks ref invalid.
13. Expired upload URLs MUST return `410 Gone` and the slot MUST be released.
14. Orphan uploads (uploaded but never referenced) MUST be garbage-collected after TTL + grace window.
15. `storage_ref` SHOULD follow `blob://<bucket>/<yyyy>/<mm>/<dd>/<object_key>` convention.
16. Referenced binary objects SHOULD have retention policy driven by tenant data policy.
17. Optional `GET /v1/uploads/{storage_ref}` MAY expose upload state for UX confirmation.
18. Slot-cap overflow MUST return `RATE_LIMIT_UPLOAD_SLOTS_EXHAUSTED` (`429`).
19. PUT payload larger than declared `size_bytes` MUST return `VALIDATION_UPLOAD_SIZE_DECLARED_MISMATCH`.

#### 4.6.10 Duplicate message and clock policies

`message_id` policy:

1. `message_id` uniqueness key is `(tenant_id, conversation_session_id, message_id)`.
2. Duplicate `message_id` MUST be handled separately from `idempotency_key`.
3. If duplicate `message_id` is received, ingress MUST return `409 Conflict` with `VALIDATION_DUPLICATE_MESSAGE_ID`.
4. Duplicate `message_id` response SHOULD include pointer to original `request_id` and MAY include replayed final response (or summary).
5. Duplicate `message_id` MUST NOT be merged into an existing conversation message.
6. Duplicate handling MUST emit a structured log/event correlated under `trace_id`.

Clock skew policy:

1. `client_sent_at` is metadata only and MUST NOT be used for authoritative ordering.
2. `client_sent_at` more than +5 minutes in future MUST return `VALIDATION_CLOCK_SKEW`.
3. `client_sent_at` older than 24 hours MUST return `VALIDATION_CLOCK_SKEW`.

#### 4.6.11 Acknowledgement and durability semantics

Ingress `200 OK` MUST mean message is durably accepted, not just syntax-valid.

Ack point for V1:

1. ACK only after durable persistence to ingress log/queue and idempotency index.

Retry semantics:

1. If ACK is not received by client, client MAY retry with same `idempotency_key`.
2. Duplicate retries inside window MUST deduplicate as defined in `4.6.7`.

#### 4.6.12 Ingress rejection envelope

Ingress rejections MUST use the same standard error envelope defined in `4.3`.

Example rejection:

```json
{
  "request_id": "req_01JY...",
  "trace_id": "trc_01JY...",
  "server": {
    "protocol_version": "1.2.1",
    "supported_range": ">=1.0.0 <2.0.0"
  },
  "status": "failed",
  "error": {
    "code": "VALIDATION_UNSUPPORTED_MIME_TYPE",
    "message": "mime_type application/zip is not allowed for part type file",
    "retryable": false,
    "retry_after_ms": 0
  }
}
```

#### 4.6.13 Deferred vs out-of-scope for ingress format

Deferred (target `1.1` or later):

1. Strict BCP 47 locale validation.
2. PII/retention hint fields (for example `privacy.retention_hint`).

Out-of-scope for ingress format layer:

1. Rate limiting algorithm details per user/tenant/IP (operations layer).
2. Malware or sensitive-content scanning pipelines on uploaded binaries (safety layer).
3. TLS/mTLS handshake and request-signing specifics (security baseline).
4. Authentication mechanism internals (identity layer); ingress only carries auth context.
5. Conversation tree resolution semantics for `parent_message_id` (memory/conversation layer).

#### 4.6.14 `schema_version` compatibility rules (locked)

Server MUST expose:

1. `protocol_version`
2. `supported_range` (example: `>=1.0.0 <2.0.0`)
3. `deprecated_versions`
4. `deprecation_sunset`

Decision rules (server on `1.2.x`):

1. Same major + client minor/patch less than or equal to server: ACCEPT.
2. Same major + client minor greater than server: ACCEPT with bounded forward-compat.
3. Different major or outside supported range: REJECT `VALIDATION_SCHEMA_VERSION_UNSUPPORTED`.
4. Deprecated version before sunset: ACCEPT and include `Ygg-Deprecation` header.
5. Deprecated version after sunset: REJECT `VALIDATION_SCHEMA_VERSION_UNSUPPORTED`.
6. Malformed version string: REJECT `VALIDATION_SCHEMA`.

Forward-compat zoning:

1. Unknown top-level fields: ignore (with forward-compat event).
2. Unknown fields in `parts[*]` or `auth.*`: reject `VALIDATION_UNKNOWN_FIELD`.
3. Unknown `parts[*].type`: reject `VALIDATION_UNSUPPORTED_PART_TYPE`.

#### 4.6.15 Auth matrix by `principal_type x message_kind` (locked)

General:

1. Any disallowed combination MUST return `VALIDATION_PRINCIPAL_NOT_ALLOWED`.
2. `parent_request_id` MUST reference known request context when required.
3. `on_behalf_of` is only allowed when principal is acting for a user context.

Allowed combinations and required fields:

1. `user + user_prompt`: requires base user auth fields (`user_id`, `token_ref`, `authenticated_at`).
2. `daemon + user_prompt`: requires `on_behalf_of`, `triggering_cause`.
3. `daemon + tool_callback`: requires `parent_request_id`, `triggering_cause`.
4. `daemon + system_event`: requires `triggering_cause`.
5. `system + admin`: requires `admin_role`, `change_ticket_ref`.
6. `system + system_event`: requires `originating_component`.
7. `system + tool_callback`: requires `parent_request_id`.
8. `system + webhook_event`: requires `external_event_id`, `external_source`.
9. `system + user_prompt`: requires `on_behalf_of`, `bootstrap_reason`.
10. `plugin + tool_callback`: requires `parent_request_id` owned by same plugin.
11. `plugin + webhook_event`: requires `external_event_id`, `external_source`.

Forbidden highlights:

1. `on_behalf_of` is forbidden for `system_event` and `admin`.
2. Plugin principals are forbidden for `user_prompt`.
3. User principals are forbidden for non-`user_prompt` message kinds in V1.

Auth-matrix validation codes:

1. Missing required `on_behalf_of`: `VALIDATION_MISSING_ON_BEHALF_OF`.
2. Forbidden `on_behalf_of` present: `VALIDATION_FORBIDDEN_ON_BEHALF_OF`.
3. Missing `parent_request_id`: `VALIDATION_PARENT_REQUEST_NOT_FOUND`.
4. Parent request ownership mismatch: `VALIDATION_PARENT_REQUEST_OWNERSHIP`.
5. Missing webhook dedup fields: `VALIDATION_MISSING_EXTERNAL_EVENT_ID`.
6. Missing daemon attribution: `VALIDATION_MISSING_TRIGGERING_CAUSE`.
7. Missing admin control fields: `VALIDATION_MISSING_ADMIN_FIELDS`.

Minimal text-only `IngressMessage`:

```json
{
  "schema_version": "1.0.0",
  "message_kind": "user_prompt",
  "message_id": "msg_01JY...",
  "request_id": "req_01JY...",
  "trace_id": "trc_01JY...",
  "idempotency_key": "idem_01JY...",
  "tenant_id": "tenant_42",
  "user_id": "usr_123",
  "conversation_session_id": "ses_abc",
  "source": {
    "adapter": "http"
  },
  "auth": {
    "principal_type": "user"
  },
  "parts": [
    {
      "type": "text",
      "text": "Create a weekly summary from memory."
    }
  ],
  "received_at": "2026-04-08T08:00:00.040Z"
}
```

### 4.7 Streaming Response Contract (SSE over POST, locked for V1)

V1 decision:

1. Streaming transport is Server-Sent Events (SSE) over `POST`.
2. Stream frame schema is canonicalized in `schemas/v1/stream_frame.schema.json`.

HTTP response headers:

1. `Content-Type: text/event-stream; charset=utf-8`
2. `Cache-Control: no-cache, no-transform`
3. `X-Accel-Buffering: no`

Frame envelope rules:

1. `event:` MUST equal `frame_type`.
2. `id:` MUST be monotonically increasing integer starting at `1`.
3. Each SSE event MUST contain exactly one single-line `data:` JSON object.
4. Per streaming connection, first frame MUST be `ack`.
5. Per streaming connection, last frame MUST be exactly one of `final` or `error`.
6. No frames are allowed after `final` or `error`.
7. If no traffic occurs for 15 seconds, server MUST send `heartbeat`.
8. `error` frame payload MUST conform to `schemas/v1/error_envelope.schema.json`.
9. `tool_callback` ingress messages are merge-only and do not create independent stream `ack/final` pairs.

Frame ordering invariant:

1. `ack -> (delta | tool_* | memory_* | heartbeat)* -> (final | error)`

Minimum frame types for V1:

1. `ack`
2. `delta` (`delta_type=text|tool_call_partial`)
3. `tool_started`
4. `tool_progress`
5. `tool_completed`
6. `memory_read` (optional; gated by verbosity)
7. `heartbeat`
8. `final`
9. `error`

Resume rules:

1. Client MAY reconnect with `Last-Event-ID`.
2. Server MUST maintain 60-second resumable frame buffer.
3. If resume id is available, stream continues from `N+1`.
4. If resume id is expired, server MUST emit `error` with `STREAM_RESUME_EXPIRED` and close.

Cancellation rules:

1. Client-side stream close MUST be treated as cancellation.
2. Server MUST emit internal telemetry with `STREAM_CANCELLED`.

Example stream frames:

```text
event: ack
id: 1
data: {"frame_type":"ack","request_id":"req_01JY...","trace_id":"trc_01JY...","server":{"protocol_version":"1.2.1","supported_range":"\u003e=1.0.0 \u003c2.0.0"}}

event: delta
id: 2
data: {"frame_type":"delta","delta_type":"text","text":"Hello"}

event: final
id: 3
data: {"frame_type":"final","status":"succeeded","output":{},"usage":{},"duration_ms":1234}
```

## 5. V1 Core Features by Subsystem

### 5.1 Orchestrator Core (Nervous System)

#### 5.1.1 Core Execution Model (locked)

1. Orchestrator is one async loop with 7 continue sites, not a heavy transition-matrix engine.
2. Context Assembly is a subroutine at the top of each loop iteration, not a continue site.
3. Durable suspension is allowed only at designated suspendable continue sites.
4. Each iteration reads a durable cancellation flag before execution; cancellation sources are user/admin request, stream disconnect policy, and parent-task propagation.

Reference loop shape:

```text
while not terminal:
  cancel_signal = read_cancellation_flag(task_id)
  if cancel_signal: terminate(cancelled)
  context = assemble_context(task, transcript, tool_results)
  model_response = call_model(context)
  if model_response has tool_calls:
    run_continue_site_1_permission_gate()
    run_continue_site_2_tool_execution()
    run_continue_site_3_memory_verification()
    run_continue_site_4_critic_safety_review()
    run_continue_site_5_compaction_check()
    run_continue_site_6_swarm_handoff()
  decision = run_continue_site_7_output_and_loop_decision()
  if decision == iterate: continue
  else: terminate
```

#### 5.1.2 Context Assembly Pipeline (locked)

Context Assembly runs at the top of each loop iteration before model invocation.

Hard boundaries:

1. No filesystem rule loading in core.
2. No direct external reads from assembler.
3. No internal LLM calls inside assembler.
4. Allowed I/O is limited to Context Packs, Memory Fabric, Tool Registry, and blob metadata for existing refs.

Pipeline DAG:

1. `intent_resolver`.
2. Parallel fan-out: `memory_resolver`, `domain_snapshot_resolver`, `tool_resolver`.
3. `freshness_verifier`.
4. `context_ranker_budgeter`.
5. `prompt_assembler`.

Stage failure policy:

1. Fail-closed: `intent_resolver`, `context_pack_loading`, `recent_turns`, `ranker_budgeter`, `prompt_assembler`.
2. Fail-open with degraded flags: long-term memory, graph, domain snapshot, tool discovery fallback, non-critical freshness verification.

Critical fact verification trigger:

1. Hybrid with policy override: `must_verify` (force), `never_verify` (suppress), model-inferred candidate only when policy is silent.

Tool ranking:

1. `final_score = 0.55*semantic + 0.25*keyword + 0.15*domain_match + 0.05*recency`.
2. Sort order: score descending, then `tool_id` ascending.
3. Tenant permission filtering MUST occur before ranking.

Assembler token budget split:

1. system instructions/personality: `40%`
2. memory+graph: `25%`
3. domain snapshot: `20%`
4. tools: `10%`
5. provenance overhead: `5%`

Context package and schema:

1. Assembler output MUST conform to `schemas/v1/context_package.schema.json`.
2. Every injected chunk MUST include provenance metadata.
3. Missing provenance on any injected chunk MUST fail-closed.

Compaction signal contract:

1. Assembler emits `needs_compaction`, `reason`, `recommended_strategy`, `severity`.
2. Site 5 consumes this signal in same iteration path.

Context Assembly events (required):

1. `context.assembly.started`
2. `context.assembly.stage_started`
3. `context.assembly.stage_completed`
4. `context.assembly.stage_degraded`
5. `context.assembly.stage_failed`
6. `context.assembly.freshness_verified`
7. `context.assembly.chunk_injected`
8. `context.assembly.budget_overflow`
9. `context.assembly.compaction_signal_emitted`
10. `context.assembly.completed`

All context assembly events MUST include: `task_id`, `request_id`, `trace_id`, `tenant_id`, `iteration`, `seq`.

#### 5.1.3 Seven Continue Sites (backbone contract)

Site 1: Permission Gate

1. Fires before each tool dispatch.
2. Inputs: tool call, risk level, tenant policy, prior approvals.
3. Outputs: `granted|denied|needs_human`.
4. Durable suspend: YES only for `needs_human`.
5. Resume trigger: permission decision callback.
6. Failure mode: timeout -> `expired`; deny -> return denial result to loop.
7. Approval cache key: `(session_id, action_signature)` where `action_signature = hash(tool_id, version, canonical_input)`.
8. Cached approval applies only to identical signature; cache can be disabled per tenant (`permission_cache=none`).

Site 2: Tool Execution

1. Fires after permission grant.
2. Inputs: approved tool calls + execution context.
3. Outputs: tool results or async-pending handles.
4. Durable suspend: YES only when any tool returns async callback contract.
5. Resume trigger: `tool_callback` correlated by `parent_request_id`.
6. Failure mode: retry per action class, else return tool error to loop.
7. Parallel result merge order MUST be deterministic (`tool_call_index`, then `tool_request_id`).
8. Side-effecting calls MUST use durable action-journal states to prevent duplicate dispatch after crash/replay.
9. Callback completion MUST validate token single-use + expiry + ownership before result application.
10. Per-action failures are isolated and injected as structured error results.
11. If all calls fail in a non-idempotent batch, Site 7 receives `fail` with reason `ITERATION_ALL_ACTIONS_FAILED`.
12. Callback to terminal task -> reject `CALLBACK_TASK_TERMINAL`.
13. Callback while task is running but not waiting -> queue for 30 seconds then reject `CALLBACK_TASK_NOT_WAITING`.
14. Partial async callback streams require `sequence_num`; merge completes only on final fragment.

Site 3: Memory Verification (skeptical check)

1. Fires before using memory claims about concrete artifacts.
2. Inputs: memory entry + artifact reference.
3. Procedure:
   1. if artifact reference exists, perform Tool Bus read-only verification call with `freshness=live`
   2. compare memory-claimed values to live read values
4. Outputs: `confirmed|stale|suppressed|unverified`.
5. Durable suspend: NO.
6. Resume trigger: N/A.
7. Failure mode: stale memory downgraded; conflict event emitted.
8. Event outputs:
   1. `memory.verification.confirmed`
   2. `memory.verification.stale`
   3. `memory.verification.suppressed`
   4. `memory.verification.unverified`

Site 4: Critic Safety Review

1. Fires after tools and before next model turn (policy-controlled).
2. Inputs: recent model output, tool results, original intent.
3. Outputs: `continue|revise|escalate`.
4. Durable suspend: optional (only if delegated external critic call is used).
5. Resume trigger: critic verdict return.
6. Failure mode: critic infra failure degrades to warning and loop continues.
7. `revise` outcome rewrites context directives and loops to next model turn.

Site 5: Compaction Check

1. Fires when context budget crosses threshold (default 75% of window).
2. Inputs: transcript + compaction policy.
3. Outputs: compacted transcript or degraded truncation fallback.
4. Durable suspend: NO.
5. Resume trigger: N/A.
6. Failure mode: fallback to deterministic truncation + compaction event.
7. Threshold formula:
   `current_tokens >= 0.75 * (effective_context_window_tokens - system_reserve_tokens)`.
8. `effective_context_window_tokens` MUST come from Model Runtime for currently pinned `(provider, model_ref)`.
9. `system_reserve_tokens` default is `2048`, tenant-overridable via Context Pack policy.

Site 6: Swarm Handoff

1. Fires when sub-agent spawn call is approved.
2. Inputs: child task definitions + parent context.
3. Outputs: aggregated child results.
4. Durable suspend: YES while child tasks run.
5. Resume trigger: all required child tasks terminal or timeout policy reached.
6. Failure mode: partial child failure surfaced to parent loop with provenance.
7. Child tasks write result envelopes keyed by `(parent_task_id, child_task_id)` for deterministic aggregation.
8. Parent injects `swarm_results: { child_id -> result_envelope }` as synthetic action result.

Site 7: Output and Loop Decision

1. Fires at end of each iteration.
2. Inputs: latest model/tool outcomes + guardrail counters + cancellation/deadline flags + self-evaluation verdict (Section 5.12).
3. Outputs: `iterate|finalize|fail|cancel|expire`.
4. Durable suspend: NO.
5. Resume trigger: N/A.
6. Failure mode: deterministic fallback is `iterate` unless hard guardrail hit.
7. Site 7 decisions MUST carry reason codes:
   `finalize=model_emitted_final_answer|iteration_budget_reached_with_answer|success_criteria_met`,
   `fail=parser_error|all_actions_failed|critic_escalated|model_refused|internal_error|iteration_deadline_exceeded|success_criteria_failed`,
   `expire=wall_time_exceeded|iteration_cap|action_cap|swarm_depth_cap|no_progress_cap`,
   `cancel=user_cancelled|admin_cancelled|parent_cancelled|client_disconnected`.
8. After Site 7 decision is emitted, runtime MAY enqueue a post-iteration Observer hook asynchronously; core loop MUST NOT block on Observer execution.
9. When self-evaluation is active (`evaluation.mode != off`), self-evaluation verdict (Section 5.12.4) MUST be computed before the loop decision. The verdict feeds directly into the reason code selection.

Site policy precedence (Sites 3/4/5):

1. `message override > task class policy > tenant default > system default`.
2. system defaults: verification `on`, compaction `on`, critic `off`.

#### 5.1.4 Lifecycle States (compact)

Pre-loop:

1. `accepted`
2. `queued`

Active:

1. `running`

Durable suspension:

1. `suspended_at_permission`
2. `suspended_at_external`
3. `suspended_at_swarm`
4. `suspended_at_critic` (optional; only when critic is delegated and long-running)

Terminal:

1. `succeeded`
2. `failed`
3. `cancelled`
4. `expired`

#### 5.1.5 Loop Guard Rails (V1 defaults)

1. `max_iterations = 32`
2. `max_tool_calls_per_iteration = 16`
3. `max_total_tool_calls = 256`
4. `max_swarm_depth = 3`
5. `max_wall_time_ms` inherited from ingress `execution.deadline_ms` (or tenant default).
6. `max_no_progress_iterations = 4`.
7. `max_iteration_wall_time_ms = 120000`.
8. Hitting any hard guard rail MUST terminate with explicit machine code (`LOOP_MAX_ITERATIONS`, `LOOP_MAX_TOOL_CALLS`, `TASK_DEADLINE_EXCEEDED`, `LOOP_NO_PROGRESS`, `ITERATION_DEADLINE_EXCEEDED`).
9. Iteration is defined as one loop pass from loop top to Site 7 decision; suspend/resume mid-pass does not increment iteration counter.

#### 5.1.6 Routing Matrix (`message_kind -> entry workflow`)

1. `user_prompt` -> start loop at `running` (`assemble_context` first).
2. `tool_callback` -> resume parent task at continue site `2`/`6` result-merge boundary only after callback token, `parent_request_id`, tenant ownership, and single-use validation.
3. `system_event` -> route to system handler; may start loop depending on event class.
4. `webhook_event` -> route to loop start as new top-level task (tenant policy dependent).
5. `admin` -> privileged deterministic handler-table dispatch (model bypass by default; no 7-site loop unless explicitly enabled by policy).

#### 5.1.7 Retry Policy Contract (action classes)

1. `read`: retryable, default `max_attempts=3`, exponential backoff with jitter.
2. `idempotent_write`: cautiously retryable, default `max_attempts=2`.
3. `non_idempotent_write`: no automatic retry unless explicit idempotency proof exists.
4. `external_side_effect`: no silent retry; requires explicit policy or human approval.

#### 5.1.8 Durability and Resume Rules

Persistence boundaries only:

1. Admission write: task accepted and routed.
2. Action-journal write: side-effecting call lifecycle (`prepared -> dispatched -> callback_pending|completed|failed|cancelled`).
3. Durable-suspend write: only at suspendable continue sites (`1`, `2` async, `6`, optional `4`).
4. Terminal write: final outcome envelope + close marker.

Checkpoint envelope (minimum fields):

```json
{
  "task_id": "tsk_01JY...",
  "checkpoint_id": "ckp_01JY...",
  "state": "suspended_at_swarm",
  "suspension_point": "site_6_swarm_handoff",
  "iteration": 5,
  "last_emitted_seq": 104,
  "tool_call_count": 19,
  "deadline_at": "2026-04-08T09:00:00Z",
  "transcript_ref": "blob://checkpoints/tsk_01JY/transcript-5.json",
  "pending_refs": [
    "child_task:tsk_child_1",
    "child_task:tsk_child_2"
  ],
  "trace_id": "trc_01JY..."
}
```

Resume rules:

1. Resume MUST restart from `suspension_point` with preserved counters and transcript snapshot.
2. Resume from unknown/invalid checkpoint MUST fail closed with auditable error.
3. Resume MUST preserve original `request_id`/`trace_id` lineage.
4. Action journal governs replay; terminal tool states are never re-dispatched.
5. Resume event emission sequence MUST continue from `last_emitted_seq + 1`.

Resume entry table (normative):

1. `suspended_at_permission` -> re-enter Site 1 with cached action set + external decision.
2. `suspended_at_external` -> re-enter Site 2 merge phase and inject callback by `parent_request_id`.
3. `suspended_at_swarm` -> re-enter Site 6 aggregation phase.
4. `suspended_at_critic` -> re-enter Site 4 verdict-apply phase.

Checkpoint context blob lifecycle:

1. `context_ref` uses `ygg-blob://` storage with tenant encryption policy.
2. Retention is terminal state + 7 days, then garbage collected.
3. Schema is `schemas/v1/core_loop_context_bundle.schema.json`.
4. Missing/corrupt context blob on resume MUST fail with `CHECKPOINT_CONTEXT_LOST`.

#### 5.1.9 Result Contract

1. Final result MUST map to one terminal state: `succeeded|failed|cancelled|expired`.
2. Partial progress MUST stream through Section `4.7` frames during `running`.
3. Terminal write MUST include reason code, duration, usage, last checkpoint reference, and `evaluation_summary` (when self-evaluation is active).
4. Site 7 orchestrator -> egress emission MUST use `OutputEnvelope` (`schemas/v1/output_envelope.schema.json`).

Terminal checkpoint schema (minimum):

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

#### 5.1.10 Model Output Contract Hardening

1. Parsed model turn MAY contain `final_answer` or `tool_calls`, but MUST NOT contain both in one turn.
2. If both are present, orchestrator MUST fail the turn with `MODEL_OUTPUT_AMBIGUOUS`.
3. On `MODEL_OUTPUT_AMBIGUOUS`, no tool call may execute.
4. Parser output MUST conform to `schemas/v1/parsed_model_response.schema.json`.

#### 5.1.11 Core Loop Observability Events (mandatory)

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

All events MUST include: `task_id`, `request_id`, `trace_id`, `tenant_id`, `iteration`, `seq`.

#### 5.1.12 Graceful Shutdown and Task Drain

1. On shutdown signal, orchestrator MUST stop accepting new tasks.
2. In-flight tasks MUST be allowed to reach the next suspendable continue site or terminal state within `orchestrator_drain_timeout_ms = 60000`.
3. Tasks that cannot reach a safe point within drain timeout MUST be checkpointed at current state with `checkpoint_reason=drain` and marked `suspended_at_drain`.
4. `suspended_at_drain` tasks MUST be resumable on another node (distributed mode) or on restart (monolith mode).
5. Drain MUST emit `core.loop.drain.started` with count of in-flight tasks.
6. Drain MUST emit `core.loop.drain.completed` with counts of `{terminated, checkpointed, force_stopped}`.
7. Force-stopped tasks (drain timeout exceeded with no safe checkpoint possible) MUST emit `core.loop.drain.force_stopped` and terminal state `failed` with reason `DRAIN_TIMEOUT`.
8. During drain, orchestrator MUST continue processing callbacks for suspended tasks (W25) to avoid callback loss.

#### 5.1.13 Admission Control and Backpressure

1. Orchestrator MUST enforce a per-node task concurrency limit: `max_concurrent_tasks_per_node = 64` (default, configurable).
2. When at capacity, new task admissions MUST be queued with bounded depth `orchestrator_admission_queue = 256`.
3. Queue overflow MUST reject with `ORCHESTRATOR_ADMISSION_FULL` and emit `core.loop.admission_rejected`.
4. Orchestrator MUST expose current load as `{active_tasks, queued_tasks, suspended_tasks}` via health endpoint and `worker.load_report` (W29).
5. In distributed mode, Skuld placement (W28) routes new tasks to the least-loaded orchestrator; overloaded nodes MUST NOT receive new placements.

#### 5.1.14 Operational Hardening

1. Task state MUST be recoverable from WAL + checkpoints alone; in-memory task state is reconstructible and MUST NOT be the sole copy.
2. Orchestrator MUST support rolling restart with zero task loss: drain node A, resume tasks on node B, then restart A.
3. Transcript blob storage MUST have tenant-scoped retention enforcement aligned with Memory Fabric retention (5.5.6).
4. Action journal entries MUST be garbage-collected after task terminal state + `action_journal_gc_delay = 7d`.
5. Orchestrator health endpoint MUST report `{active_tasks, queued_tasks, suspended_tasks, iteration_rate_1m, error_rate_1m}`.
6. Long-running tasks exceeding `max_wall_time_ms` MUST be forcibly expired with `TASK_DEADLINE_EXCEEDED`, not left indefinitely.
7. Checkpoint storage MUST enforce per-tenant quota: `max_checkpoint_storage_mb` (default `512`). Quota breach MUST reject new suspensions with `CHECKPOINT_STORAGE_QUOTA_EXCEEDED` and emit alert.

### 5.2 Ingress Adapters (Inway)

#### 5.2.1 Scope

1. V1 adapters: `terminal`, `http`.
2. Adapter SDK for future `grpc`, `webhook`, `queue`.
3. Input normalization into canonical `TaskRequest` schema defined in `4.6`.
4. Pre-signed upload endpoint (`/v1/uploads`) and storage reference verification.
5. Ingress validation middleware (schema, MIME, size, auth, tenant, rate limits).
6. Durable acceptance ACK contract (ack after persistence, not after syntax check only).
7. Normative source of ingress contract is Section `4.6`; adapters MUST NOT redefine envelope semantics.

#### 5.2.2 Rate Limiting (V1)

1. Rate limiting is enforced per `(tenant_id, principal_id)` at the ingress boundary before any durable write.
2. Default rate limit profiles:
   1. `starter`: `60` requests/minute, `10` concurrent requests.
   2. `growth`: `300` requests/minute, `50` concurrent requests.
   3. `enterprise`: `1000` requests/minute, `200` concurrent requests.
3. Rate limit algorithm: sliding window counter (V1). Token bucket deferred to V1.1.
4. Rate limit state is tenant-local; no cross-node coordination required in V1.
5. Burst: up to `2x` burst within any 1-second window is allowed; sustained over-rate MUST reject.
6. Rate-limited requests MUST return `429` with `Retry-After` header and `RATE_LIMIT_EXCEEDED`.
7. Rate limit decisions MUST emit `ingress.rate_limited` event with `tenant_id`, `principal_id`, `limit_profile_id`.
8. Admin override: `rate_limit.bypass=true` in tenant policy bypasses rate limiting (audit-logged).

#### 5.2.3 Admission Backpressure

1. Ingress MUST maintain an admission queue with bounded capacity.
2. Default queue capacity: `1024` pending requests per node.
3. Queue overflow MUST return `503 Service Unavailable` with `INGRESS_ADMISSION_QUEUE_FULL`.
4. Queue depth MUST be emitted as a metric: `ingress.admission_queue.depth`.
5. High-water mark (`75%` capacity) MUST emit `ingress.admission_queue.high_water`.
6. Admission queue is per-node; no cross-node queue sharing in V1.

#### 5.2.4 Graceful Drain

1. On shutdown signal, ingress MUST stop accepting new connections.
2. In-flight requests MUST be allowed to complete within `ingress_drain_timeout_ms = 30000`.
3. After drain timeout, remaining in-flight requests MUST receive `503` with `INGRESS_SHUTTING_DOWN`.
4. Drain MUST emit `ingress.drain.started` and `ingress.drain.completed` events.
5. Drain completion MUST wait for all durable ACKs to be confirmed before process exit.

#### 5.2.5 Operational Hardening

1. TLS termination MUST occur at ingress boundary; plaintext internal traffic is allowed only within a single host in monolith mode.
2. Request body size enforcement MUST happen at the HTTP layer before JSON parsing to prevent memory exhaustion.
3. Connection limits: `max_concurrent_connections_per_ip = 100` (default, tenant-configurable).
4. Slowloris protection: `request_header_timeout_ms = 5000`, `request_body_timeout_ms = 60000`.
5. Ingress health endpoint (`/healthz`) MUST report `liveness`, `readiness`, `admission_queue_depth`, `active_connections`.
6. Ingress MUST log rejected requests with `trace_id` for correlation even when request is malformed.
7. Adapter-level conformance suites MUST validate normalization correctness from native format to `TaskRequest`.

### 5.3 Tool Bus (Circulatory)

#### 5.3.1 Architecture (locked)

1. Tool metadata is managed by Skuld (metadata/control-plane service) inside Yggdrasil.
2. Tool execution logic lives in a separate Tool Execution microservice.
3. Orchestrator performs permission checks first, then calls execution service via internal API.
4. Registry and execution are independently scalable and independently deployable.

#### 5.3.2 Registry Storage and Refresh (locked)

1. Registry backing store is a lightweight KV store in Yggdrasil.
2. On startup, orchestrator/context layers MUST load full tool definitions into in-memory cache.
3. Refresh policy: poll every 30 seconds (configurable).
4. Stale-read policy: up to 60 seconds for metadata reads.
5. `enabled=false` updates MUST invalidate cache immediately (fail-closed on disable).
6. Registry MAY emit change events to reduce poll delay.

#### 5.3.3 Tool Registry Schema (V1)

Each tool entry MUST include:

1. `tool_id` (unique)
2. `version` (SemVer)
3. `name`
4. `description`
5. `input_schema` (JSON Schema)
6. `output_schema` (JSON Schema)
7. `risk_level` (`read_only|write|external|high_risk|admin`)
8. `scopes` (string array)
9. `domain` (`coding|commerce|general|system|...`)
10. `handler_ref` (`grpc://...` or `https://...`)
11. `tenant_visibility` (`global|tenant_isolated|per_user`)
12. `enabled` (boolean)
13. `execution_mode` (`sync|async`)
14. `schema_hash` (hash of input/output schemas for cache drift detection)
15. `default_timeout_ms`
16. `max_result_size_kb` (default `256`)
17. `metadata` (free-form map)

Recommended optional fields:

1. `max_concurrency`
2. `rate_limit_per_minute`
3. `deprecated` (boolean)
4. `deprecated_at` (RFC3339)
5. `sunset_at` (RFC3339)
6. `replacement_tool_ref` (`tool_id@version`)
7. `billing` (`meter_key`, `units_per_call`, optional `units_per_kb_io`)
8. `response_streaming` (reserved for V1.1)

Canonical runtime reference:

1. `tool_ref = <tool_id>@<version>`

#### 5.3.4 Registry Mutation and Read APIs

1. `POST /v1/registry/tools` registers or updates tool entries (admin/marketplace process only).
2. `DELETE /v1/registry/tools/{tool_id}/{version}` performs soft-delete (`enabled=false`).
3. `GET /v1/registry/tools` lists tools.
4. `GET /v1/registry/tools/{tool_id}` returns tool versions.
5. Registration MUST meta-validate `input_schema` and `output_schema` as valid JSON Schema docs.
6. Marketplace registrations MUST verify manifest signature (Section `4.1`) before acceptance.

#### 5.3.5 Tool Discovery API (Context Assembly bridge)

`POST /v1/registry/tools/discover` request:

```json
{
  "tenant_id": "tenant_42",
  "intent_text": "refactor this rust module",
  "domain_hints": ["coding"],
  "max_results": 20,
  "include_descriptions": true
}
```

Response:

```json
{
  "tools": [
    {
      "tool_id": "read_file",
      "version": "1.4.0",
      "score": 0.87,
      "reason": "semantic"
    }
  ],
  "discovery_id": "dsc_01JY..."
}
```

Discovery rules:

1. Hard cap `max_results <= 50`.
2. Tenant/tool visibility filtering MUST happen before scoring.
3. Embeddings for tools MUST be computed at registration/update time, not query time.
4. Embedding model version MUST be pinned in registry config and auditable.

#### 5.3.6 Tool Call Envelope (Orchestrator -> Execution Service)

Request envelope:

```json
{
  "request_id": "req_tool_01JY...",
  "trace_id": "trc_01JY...",
  "tenant_id": "tenant_42",
  "session_id": "ses_abc",
  "tool_id": "update_order_status",
  "version": "1.2.3",
  "parameters": {},
  "timeout_ms": 8000,
  "idempotency_key": "idem_01JY...",
  "secret_refs": [
    {
      "name": "stripe_api_key",
      "ref": "sec://tenant_42/update_order_status/stripe_api_key"
    }
  ],
  "caller": "orchestrator-v1"
}
```

Response envelope:

```json
{
  "request_id": "req_tool_01JY...",
  "status": "success",
  "result": {},
  "result_storage_ref": null,
  "error": null,
  "callback_token": null,
  "side_effect_uncertain": false,
  "metadata": {
    "duration_ms": 121
  }
}
```

Response status enum:

1. `success`
2. `failed`
3. `pending_callback`
4. `cancelled`

#### 5.3.7 Schema Validation Enforcement Points

1. Input parameters MUST be validated orchestrator-side before dispatch.
2. Input parameters MUST be validated execution-side on receipt (defense in depth).
3. Input validation failure MUST return `VALIDATION_ERROR` and MUST NOT execute tool logic.
4. Output MUST be validated execution-side against `output_schema` before return.
5. Output schema violations MUST return `INTERNAL_EXECUTION_ERROR` with sub-code `OUTPUT_SCHEMA_VIOLATION`.
6. Schema-violating output MUST NOT be forwarded to the model loop.

#### 5.3.8 Sync vs Async Contract and Callback Security

1. `execution_mode=sync`: execution returns terminal response (`success|failed`) in request-response cycle.
2. `execution_mode=async`: execution returns `pending_callback` + `callback_token`.
3. Final async completion MUST return with same `request_id` (and `trace_id`) via internal callback channel.
4. `callback_token` MUST be orchestrator-generated, not execution-generated.
5. Token format MUST be `cbt_<ulid>.<hmac_signature>`.
6. Token TTL is 24 hours.
7. Token MUST be single-use; second use MUST return `CALLBACK_TOKEN_REUSED`.
8. Request/token mismatch MUST return `CALLBACK_TOKEN_MISMATCH`.
9. Async callbacks are ingested as `message_kind=tool_callback`.

#### 5.3.9 Retry, Idempotency, and Timeout Policy

Retry defaults by `risk_level`:

1. `read_only`: up to 3 retries (`100ms -> 400ms -> 1000ms`, exponential + jitter).
2. `write`: idempotency required, up to 2 retries, no retry for validation failures.
3. `external`: up to 5 retries with longer backoff and circuit-breaker awareness.
4. `high_risk` and `admin`: no automatic retries.

Idempotency rules:

1. Execution layer MUST honor idempotency for write-class tools.
2. Idempotency scope key is `(tenant_id, tool_ref, idempotency_key)`.
3. Idempotency violations MUST return `IDEMPOTENCY_VIOLATION`.

Timeout defaults by `risk_level`:

1. `read_only`: `5000` ms
2. `write`: `10000` ms
3. `external`: `30000` ms
4. `high_risk`: `30000` ms
5. `admin`: `60000` ms

Timeout ceiling:

1. `max_timeout_ms = 300000` (5 min).
2. Operations requiring longer than ceiling MUST use async mode.

#### 5.3.10 Result Size and Large Result Handling

1. Default `max_result_size_kb = 256` per tool call.
2. Tools MAY override cap per registry entry.
3. Oversized results MUST be written to blob storage and returned via `result_storage_ref`.
4. If oversized result cannot be externalized, return `VALIDATION_RESULT_TOO_LARGE`.
5. Orchestrator decides fetch/summarize/truncate strategy before model reinjection.

#### 5.3.11 Permission Coupling with Site 1

1. Site 1 reads `risk_level` and `scopes` from registry cache.
2. Decision function evaluates session scopes + tenant policy + risk policy.
3. Permission decision MUST be deterministic and auditable.
4. Denied tools return structured denial result to loop (not silent drop).

#### 5.3.12 Per-Tenant Secret Resolution

1. Secret references MUST live in separate Secret Reference Store, not registry metadata.
2. Secrets are keyed by `(tenant_id, tool_id, secret_name)`.
3. Requests carry secret references only; plaintext secrets are forbidden in envelopes/logs/events.
4. Execution service resolves refs at execution time over privileged channel.
5. Missing tenant secret configuration MUST return `SECRET_NOT_AVAILABLE`.

#### 5.3.13 Cancellation Propagation

1. gRPC calls MUST propagate cancellation via request context cancel/deadline.
2. HTTP fallback MUST support `POST /v1/cancel/{request_id}`.
3. On cancel, execution service SHOULD return `CANCELLED` within `cancellation_grace_ms=5000`.
4. Cancellation for side-effecting tools does not guarantee rollback.
5. Cancelled side-effecting responses MUST set `side_effect_uncertain=true`.

#### 5.3.14 Circuit Breaker and Endpoint Health

1. Orchestrator maintains breaker per `handler_ref`.
2. Open conditions: `>=5` consecutive failures OR `>30%` error rate over rolling 60 seconds (configurable).
3. Open breaker MUST fail fast with `EXECUTION_SERVICE_UNAVAILABLE`.
4. Breaker half-open retry and cooldown policy MUST be configured per endpoint class.

#### 5.3.15 Version Resolution, Deprecation, and Governance

1. Calls without explicit `version` MUST resolve to highest non-deprecated version.
2. Calls with explicit version require exact match; if absent, return `TOOL_VERSION_NOT_FOUND`.
3. Calls after `sunset_at` MUST return `TOOL_VERSION_SUNSET`.
4. Deprecated-but-active calls MUST emit deprecation telemetry/event.
5. Multiple concurrent versions per `tool_id` are supported.
6. Risk escalation (`risk_level` increase) MUST require major SemVer bump.
7. Scope expansion MUST require major SemVer bump.
8. Registration violating risk/scope major-bump rule MUST be rejected and emit `registry.tool.risk_escalation_attempted`.
9. Tenant grants are scoped to major version line (`tool_id@1.x` does not grant `2.x`).

#### 5.3.16 Observability Events (required)

1. `tool_registry.refresh`
2. `registry.tool.registered`
3. `registry.tool.deprecated`
4. `registry.tool.discovered`
5. `registry.tool.risk_escalation_attempted`
6. `tool.permission.denied`
7. `tool.secret.resolved`
8. `tool.async.callback_received`
9. `tool_call.requested`
10. `tool_call.executed`
11. `tool_call.failed`
12. `tool_call.cancelled`
13. `circuit_breaker.state_change`

Event rules:

1. Events MUST include `tenant_id`, `trace_id`, `tool_id`, and `request_id` where applicable.
2. Tool execution latency and status MUST be emitted as metrics.
3. `tool.secret.resolved` MUST include secret reference only; secret values are forbidden in telemetry.
4. `registry.tool.discovered` MUST include `discovery_id` for correlation.

#### 5.3.17 Explicit V1 Boundaries

1. Tool-to-tool composition is forbidden in V1 (composition belongs in orchestrator loop).
2. Multi-execution-service topology is supported via per-tool `handler_ref`.
3. Locale-localized tool descriptions are deferred to V1.1.

#### 5.3.18 Deferred (V1.1 candidates)

1. Strict per-tool/per-tenant concurrency quotas at registry level.
2. Result caching for idempotent read tools.
3. Streaming tool outputs (`response_streaming`) with frame protocol integration.

#### 5.3.19 Operational Hardening (implementation-critical)

1. Per-tool sandbox profiles MUST define filesystem/network/process limits for execution isolation.
2. Per-tenant and per-tool quotas SHOULD be enforced with bulkhead isolation to prevent noisy-neighbor starvation.
3. Orchestrator-to-execution service calls MUST use strong service auth (`mTLS` and signed caller identity).
4. Region-aware routing and failover policy MUST be defined for tool execution endpoints in distributed deployments.
5. Tool version rollout MUST support canary release and deterministic rollback.
6. Tool-level conformance suites MUST be added (schema + behavior vectors, not prose-only).
7. Registry KV and idempotency state MUST have backup/restore and migration procedures.
8. Billing meters MUST be enforced at execution-time, not only via emitted events.

### 5.4 Daemon Runtime (Brain)

1. Daemon Runtime is the lexicon name.
2. In V1, Daemon Runtime is realized exclusively by YMIR (Section `5.10`).

### 5.5 Memory Fabric

#### 5.5.1 Core Model

1. Memory storage is tenant-scoped and sequence-driven.
2. `logical_sequence` (`seq:u64`) is the only ordering truth source per tenant.
3. `event_time` is display/audit only and MUST NOT be used for ordering.
4. Source of truth is append-only history (`conversation logs` + `edges_history.parquet`).
5. Live in-memory graph is a derived materialized view and may be rebuilt at any time.
6. Verification rule remains: memory hints are not source of truth for external reality.

#### 5.5.2 Sequence and WAL Contract

1. Sequence allocation is owned by WAL; there is no separate sequence KV authority.
2. Each WAL record MUST include: `tenant_id`, `seq`, `event_type`, `payload`, `trace_id`, `request_id`, `timestamp`.
3. Write flow:
   1. Read cached last seq for tenant (cache warmed from WAL tail).
   2. Allocate `next_seq = last_seq + 1`.
   3. Append WAL record containing `next_seq` and payload.
4. A write is durable only after WAL group-commit `fsync` succeeds.
5. ACK MUST be returned only after `fsync` for the group containing that write.
6. No rewind is allowed; forward gaps are tolerated and MUST be logged.

#### 5.5.3 WAL Fsync Policy (V1 Default)

1. Group commit with bounded triggers:
   1. `fsync_interval_ms = 2`
   2. `fsync_batch_entries = 64`
2. `fsync` triggers on either condition, whichever happens first.
3. High-risk/admin writes MAY request `durability_mode=sync` (immediate fsync path).
4. Un-ACKed writes are retry-safe via idempotency keys.

#### 5.5.4 ID and Format Rules

1. Event IDs use prefixed ULID format: `^<prefix>_[0-9A-HJKMNP-TV-Z]{26}$`.
2. Memory prefixes:
   1. `mev_` memory event
   2. `edg_` edge event
   3. `snp_` snapshot
   4. `kbf_` knowledge file
   5. `chk_` knowledge chunk
   6. `rqy_` retrieval query
   7. `rec_` reconciliation run
   8. `ysc_` YMIR system-context record
   9. `obs_` observation record
   10. `obuf_` observation buffer
   11. `rft_` reflection run
   12. `rtr_` reflection trigger
   13. `owr_` observation WAL record
   14. `scr_` success criteria
   15. `obj_` evaluation objective
   16. `evl_` evaluation run
3. `trace_id` remains `trc_` as defined in ingress contracts.
4. `tenant_id` and `session_id` remain non-ULID patterned strings.

#### 5.5.5 Snapshot and Recovery Contract

1. Snapshot artifacts:
   1. `current_graph.parquet`
   2. `current_graph.meta.json`
2. Metadata MUST include:
   1. `schema_version`
   2. `snapshot_id`
   3. `tenant_id`
   4. `snapshot_seq`
   5. `created_at` (RFC3339 UTC)
   6. `created_by`
   7. `edge_count`
   8. `source_range`
   9. `parquet_file`
   10. `parquet_size_bytes`
   11. `parquet_sha256`
   12. `meta_sha256_self`
3. Snapshot commit signal is metadata rename last (atomic write pattern).
4. Recovery is deterministic:
   1. Load latest valid snapshot.
   2. Replay history from `snapshot_seq + 1` to current head.
   3. Rebuild live graph and caches.
5. No fixed-time replay windows are allowed.

#### 5.5.6 Consistency, Reconciliation, and Retention

1. Graph conflict policy: sequence-based last-write-wins on `(src, edge_type, dst)` with tombstones for delete.
2. Reconciliation cadence:
   1. every `60s` for active tenants
   2. max drift `5m`
   3. drift breach triggers full rebuild from history
3. Retention defaults:
   1. short-term logs `90d`
   2. long-term knowledge `indefinite`
   3. graph history `indefinite` (optional old-version compaction after `365d`)

#### 5.5.7 Security and Key Rotation

1. Encryption at rest: AES-256 for Parquet and persisted memory artifacts.
2. Encryption in transit: TLS 1.3 for all internal communication.
3. Per-tenant keying is mandatory.
4. Envelope encryption model (`KEK`/`DEK`) is REQUIRED.
5. Rotation defaults:
   1. KEK rotation monthly with 30-day rollback window
   2. DEK rotation yearly or admin-triggered
6. Tenant delete MUST support cryptoshred semantics by key destruction.
7. In-memory structures are not encrypted; isolation is enforced by process/node tenancy boundaries.

#### 5.5.8 Domain Snapshot Contract (locked)

1. Domain snapshots live under Memory Fabric partition `domain_snapshots`.
2. Key shape: `(tenant_id, domain, snapshot_type, snapshot_key)`.
3. Snapshot fields:
   1. `value`
   2. `last_refreshed_at`
   3. `ttl_ms`
   4. `source_tool_ref`
   5. `source_request_id`
   6. `schema_version`
4. Context Assembler is read-only for snapshots.
5. Snapshot refresh occurs as orchestrator Site 2 tool side-effect only.
6. Freshness rule: when `now - last_refreshed_at > ttl_ms`, mark snapshot stale and emit `context.assembly.domain_snapshot_stale`.
7. Snapshot schema is `schemas/v1/domain_snapshot.schema.json`.

#### 5.5.9 Observation WAL (separate from Memory Fabric WAL, locked)

1. Observation buffer state MUST use a dedicated WAL and MUST NOT be mixed into the strict Memory Fabric WAL.
2. Strict Memory Fabric WAL remains source of truth for durable observation records after extraction/promotion.
3. Observation WAL scope key is `(tenant_id, session_id)`.
4. Observation WAL record types:
   1. `buffer_append`
   2. `buffer_flush_started`
   3. `buffer_flush_completed`
   4. `buffer_flush_failed`
   5. `buffer_dropped`
5. Observation WAL durability tier defaults:
   1. `observation_fsync_interval_ms = 50`
   2. `observation_fsync_batch_entries = 256`
6. Observation WAL uses separate per-tenant operational sequence (`obs_buffer_seq:u64`) and MUST NOT be used as memory ordering truth.
7. Recovery priority is strict Memory WAL first, Observation WAL replay second (background).
8. Observation WAL failure MUST NOT block ingress/core-loop; pipeline degrades with warning events.
9. Observation WAL schema is `schemas/v1/observation_wal_record.schema.json`.
10. Required events:
    1. `memory.observation_wal.segment_created`
    2. `memory.observation_wal.segment_truncated`
    3. `memory.observation_wal.replay_started`
    4. `memory.observation_wal.replay_completed`
    5. `memory.observation_wal.segment_lost`
    6. `memory.observer.wal_unavailable`

#### 5.5.10 WAL Segment Management

1. WAL MUST be segmented into fixed-size files: `wal_segment_size_mb = 64` (default).
2. Active segment is the only writable segment; prior segments are immutable.
3. Segment rotation occurs when active segment reaches size limit or `wal_segment_max_age_ms = 3600000` (1 hour).
4. Segment rotation MUST emit `memory.wal.segment_rotated`.
5. Segments older than `wal_segment_retain_count = 16` (after snapshot) MAY be truncated.
6. Truncation MUST NOT remove segments needed for recovery (i.e., segments after latest valid snapshot).
7. Truncation MUST emit `memory.wal.segment_truncated`.
8. Corrupt segment detection MUST use per-record CRC32c checksums.
9. Corrupt records MUST be skipped during replay with `memory.wal.record_corrupt` event; forward gaps are tolerated per 5.5.2 item 6.

#### 5.5.11 Backup and Restore

1. Backup strategy: snapshot + WAL segments from `snapshot_seq` to head.
2. Backup MUST be tenant-scoped; cross-tenant backup bundles are forbidden.
3. Backup procedure:
   1. Create consistent snapshot (5.5.5).
   2. Copy snapshot pair + all WAL segments from `snapshot_seq` to current head.
   3. Validate snapshot checksums.
   4. Emit `memory.backup.completed` with `{tenant_id, snapshot_seq, head_seq, size_bytes}`.
4. Restore procedure:
   1. Validate backup checksums and tenant ownership.
   2. Load snapshot into recovery partition.
   3. Replay WAL segments from `snapshot_seq + 1`.
   4. Swap live partition atomically.
   5. Emit `memory.restore.completed`.
5. Restore MUST be admin-only and MUST NOT be triggered by automated processes in V1.
6. Backup frequency: tenant-configurable, default `daily` for active tenants.
7. Backup retention: `backup_retention_count = 7` (default).

#### 5.5.12 Capacity and Quota Management

1. Per-tenant storage quota: `memory_storage_quota_mb = 1024` (default, plan-configurable).
2. Quota enforcement MUST reject new WAL writes when quota is breached: `MEMORY_STORAGE_QUOTA_EXCEEDED`.
3. Quota check is pre-write (estimated) to avoid partial writes.
4. Quota usage MUST be emitted as metric: `memory.storage.used_bytes{tenant_id}`.
5. High-water mark (`90%` quota) MUST emit `memory.storage.quota_warning`.
6. Graph node and edge count limits per tenant: `max_graph_nodes = 100000`, `max_graph_edges = 500000` (default).
7. Graph limit breach MUST reject edge/node creation with `MEMORY_GRAPH_LIMIT_EXCEEDED`.

#### 5.5.13 Memory Fabric Events (required)

1. `memory.wal.write_completed`
2. `memory.wal.fsync_completed`
3. `memory.wal.segment_rotated`
4. `memory.wal.segment_truncated`
5. `memory.wal.record_corrupt`
6. `memory.wal.recovery_started`
7. `memory.wal.recovery_completed`
8. `memory.snapshot.created`
9. `memory.snapshot.validation_failed`
10. `memory.graph.reconciliation_started`
11. `memory.graph.reconciliation_completed`
12. `memory.graph.drift_detected`
13. `memory.graph.rebuild_triggered`
14. `memory.retrieval.completed`
15. `memory.retrieval.degraded`
16. `memory.sequence_gap`
17. `memory.backup.completed`
18. `memory.restore.completed`
19. `memory.storage.quota_warning`

All memory events MUST include: `tenant_id`, `trace_id`, `seq` (where applicable).

#### 5.5.14 Operational Hardening

1. WAL writes MUST be atomic per record; partial records MUST be detectable and skippable.
2. Snapshot creation MUST NOT block WAL writes; snapshots are created from immutable segment data.
3. Memory Fabric MUST support rolling restart: drain reads, flush pending writes, restart, replay from checkpoint.
4. In-memory graph rebuild MUST have bounded time: `max_graph_rebuild_ms = 60000`. If exceeded, node starts in degraded mode with stale graph and rebuilds in background.
5. Memory Fabric health endpoint MUST report `{wal_head_seq, snapshot_seq, graph_node_count, graph_edge_count, storage_used_bytes, reconciliation_last_at}`.
6. Parquet files MUST use Snappy compression (V1 default) for storage efficiency.
7. Memory Fabric MUST enforce per-tenant write rate limit: `max_wal_writes_per_second = 1000` (default) to prevent single-tenant WAL exhaustion.

### 5.6 Egress Adapters (Outway)

#### 5.6.1 V1 Scope (locked)

1. V1 egress channels are limited to `terminal` and `http_stream`.
2. Multi-channel external adapters (`whatsapp`, `telegram`, `rcs`, `sms`, `email`, `slack`) are deferred to V1.1.
3. All V1 streaming behavior MUST conform to Section `4.7`.

#### 5.6.2 Canonical Output Contract

1. Orchestrator -> egress contract name is `OutputEnvelope`.
2. `OutputEnvelope` MUST conform to `schemas/v1/output_envelope.schema.json`.
3. Egress ACK to orchestrator MUST be emitted only after durable enqueue/persistence succeeds.
4. ACK MUST NOT wait for downstream provider acceptance, delivery, or read receipts.
5. Provider acceptance and receipt updates are async observability events, not initial ACK semantics.

Minimum fields excerpt (normative subset):

```json
{
  "schema_version": "1.0.0",
  "output_id": "out_01JY...",
  "task_id": "tsk_01JY...",
  "request_id": "req_01JY...",
  "trace_id": "trc_01JY...",
  "tenant_id": "tenant_42",
  "channel": "terminal",
  "message_type": "final",
  "idempotency_key": "tenant_42:out_01JY...:terminal",
  "payload": { "text": "..." },
  "priority": "normal",
  "created_at": "2026-04-10T10:00:00Z"
}
```

#### 5.6.3 Retry and Idempotency Policy

1. `progress`: at-most-once delivery (no retry).
2. `final`: at-least-once delivery with max 3 retries and exponential backoff.
3. `error`: at-least-once delivery with max 5 retries and longer backoff.
4. `proactive`: at-most-once delivery.
5. Idempotency key scope for outbound send is `(tenant_id, output_id, channel)`.
6. Duplicate key with same payload MUST be deduplicated as success/no-op.
7. Duplicate key with conflicting payload MUST fail with `IDEMPOTENCY_VIOLATION`.

#### 5.6.4 Templates and Fallback Policy

1. Template source of truth is Context Packs (signed and versioned).
2. Fallback policy source is tenant Context Pack key `egress.fallback_order`.
3. In V1, fallback applies only within `terminal/http_stream` paths.
4. Cross-network channel fallback orchestration is deferred to V1.1.

#### 5.6.5 Security and Feedback

1. Egress MUST enforce outbound redaction before delivery.
2. Credential handling MUST be tenant-isolated and secret-ref based.
3. Secrets MUST NOT appear in logs, traces, events, or envelopes.
4. Egress MUST emit feedback events for send/delivery/read status for later loop awareness.
5. Required events include:
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

#### 5.6.6 Queue and Backpressure

1. Egress MUST maintain a durable outbound queue per channel.
2. Default queue capacity: `4096` messages per channel per node.
3. Queue overflow MUST return `EGRESS_QUEUE_FULL` to orchestrator and emit `egress.queue.full`.
4. Queue high-water mark (`75%`) MUST emit `egress.queue.high_water`.
5. Queue depth MUST be emitted as metric: `egress.queue.depth{channel}`.
6. Queue processing is FIFO within priority class; `final` and `error` messages have higher priority than `progress`.
7. Stale messages (older than `egress_message_ttl_ms = 300000`) MUST be discarded and emit `egress.output.expired`.

#### 5.6.7 Rate Limiting (Outbound)

1. Outbound rate limiting is per `(tenant_id, channel)`.
2. Default: `100` messages/minute per tenant per channel.
3. Burst: up to `3x` within any 1-second window.
4. Rate-limited outputs MUST be queued (not dropped) and deferred.
5. If deferred queue exceeds `egress_deferred_queue_max = 512`, oldest `progress` messages are dropped first.
6. `final` and `error` messages MUST NOT be dropped for rate limiting.
7. Rate limit breach MUST emit `egress.output.rate_limited`.

#### 5.6.8 Outbound Redaction Contract

1. Redaction MUST apply before any outbound delivery, including logging.
2. Redaction rules are sourced from Context Pack key `egress.redaction_rules`.
3. Default redaction patterns (V1):
   1. Secret references matching `sec://.*` MUST be replaced with `[REDACTED]`.
   2. Token references matching `tok_.*` MUST be replaced with `[REDACTED]`.
   3. Internal blob references matching `ygg-blob://.*` MUST be replaced with `[INTERNAL_REF]`.
4. Tenant-specific redaction patterns are additive (tenant rules + system rules).
5. Redaction failure (malformed rules) MUST block delivery and emit `egress.redaction.failed`.
6. Redacted content MUST NOT be recoverable from logs, events, or delivered payload.

#### 5.6.9 Delivery Tracking Lifecycle

1. Each output progresses through a lifecycle: `queued -> sending -> sent -> delivered -> read` (or `failed` at any stage).
2. `queued`: output durably enqueued.
3. `sending`: output dispatched to downstream transport.
4. `sent`: downstream transport accepted the message (e.g., HTTP 200 from client SSE endpoint).
5. `delivered`: downstream provider confirmed delivery (for channels that support delivery receipts).
6. `read`: downstream provider confirmed read (for channels that support read receipts).
7. `failed`: delivery failed after all retries exhausted.
8. V1 channels (`terminal`, `http_stream`) support `queued -> sending -> sent -> failed` only.
9. `delivered` and `read` states are reserved for V1.1 multi-channel adapters.
10. Lifecycle transitions MUST be logged with `output_id`, `channel`, `delivery_attempt`, `timestamp`.

#### 5.6.10 Graceful Drain

1. On shutdown signal, egress MUST stop accepting new outputs from orchestrator.
2. Queued outputs MUST be flushed within `egress_drain_timeout_ms = 30000`.
3. Outputs that cannot be delivered within drain timeout MUST be persisted to durable queue for pickup by replacement node.
4. Active SSE streams MUST be closed with `error` frame containing `EGRESS_SHUTTING_DOWN`.
5. Drain MUST emit `egress.drain.started` and `egress.drain.completed`.

#### 5.6.11 Operational Hardening

1. SSE connection management MUST enforce `max_sse_connections_per_tenant = 50` (default).
2. Idle SSE connections (no frames for `sse_idle_timeout_ms = 300000`) MUST be closed with `error` frame.
3. Egress MUST track per-tenant delivery success rate; sustained failure rate `>50%` over 5 minutes MUST emit `egress.tenant.delivery_degraded`.
4. Outbound payloads MUST be size-capped at `egress_max_payload_kb = 1024`; oversized payloads MUST be truncated with indicator and emit `egress.output.truncated`.
5. Egress health endpoint MUST report `{queue_depth, active_sse_connections, delivery_success_rate_1m, channels_available}`.
6. Channel-level circuit breaker: `>=5` consecutive delivery failures per channel MUST open breaker; emit `egress.channel.circuit_opened`.
7. Egress MUST support per-tenant output encryption at rest (queue persistence) using tenant KEK/DEK (5.5.7).
8. Billing meters for outbound messages MUST be enforced at send-time (not only via events).

### 5.7 Model Runtime (Conscious)

#### 5.7.1 Request/Response Contracts (locked)

1. Model request envelope MUST conform to `schemas/v1/model_request.schema.json`.
2. Model response envelope MUST conform to `schemas/v1/model_response.schema.json`.

`ModelRequest` minimum contract:

1. `model_ref`
2. `provider_hint` (optional)
3. `messages`
4. `tools` (optional)
5. `constraints`:
   1. `max_output_tokens`
   2. `stop`
   3. `temperature`
6. `response_format`

`ModelResponse` minimum contract:

1. `parsed_parts`
2. `usage` (`input_tokens`, `output_tokens`)
3. `finish_reason`
4. `provider_metadata`

#### 5.7.2 Routing, Fallback, and Precedence

1. Routing policy source is Context Packs: `task_class -> model_policy_ref`.
2. Fallback chain is ordered in Context Pack and exhausted only on:
   1. `PROVIDER_UNAVAILABLE`
   2. `PROVIDER_RATE_LIMITED`
   3. `PROVIDER_CONTEXT_OVERFLOW`
   4. `PROVIDER_FILTERED`
3. Prompt injection precedence:
   `system_pack > tenant_pack > project_pack > session_pack > user_message`.
4. Runtime MUST expose `effective_context_window_tokens` for selected `(provider, model_ref)` per iteration.
5. Site 5 compaction logic MUST consume `effective_context_window_tokens`.

#### 5.7.3 Model Runtime Error Codes (V1)

1. `PROVIDER_UNAVAILABLE`
2. `PROVIDER_RATE_LIMITED`
3. `PROVIDER_CONTEXT_OVERFLOW`
4. `PROVIDER_FILTERED`
5. `MODEL_REF_NOT_FOUND`
6. `MODEL_ROUTING_POLICY_MISSING`

#### 5.7.4 Provider Health and Rate Budget

1. Model Runtime MUST maintain per-provider health state: `healthy|degraded|unavailable`.
2. Health transitions are based on rolling error rate:
   1. `degraded`: `>10%` error rate over 60-second window.
   2. `unavailable`: `>50%` error rate over 60-second window OR `>=5` consecutive failures.
   3. `healthy`: error rate drops below `5%` for 30 seconds.
3. `degraded` providers remain in fallback chain but are deprioritized.
4. `unavailable` providers are skipped in fallback chain until recovery.
5. Provider health transitions MUST emit `model.provider.health_changed`.
6. Per-tenant token budget tracking:
   1. `max_input_tokens_per_minute` (default `500000`).
   2. `max_output_tokens_per_minute` (default `100000`).
   3. `max_requests_per_minute` (default `60`).
7. Budget breach MUST return `PROVIDER_RATE_LIMITED` to orchestrator with `retry_after_ms`.
8. Budget state is per `(tenant_id, provider)` and resets on sliding window.

#### 5.7.5 Model Call Timeout and Retry

1. Default model call timeout: `model_call_timeout_ms = 120000`.
2. Streaming model calls: first-token timeout `model_first_token_timeout_ms = 30000`.
3. Streaming inter-token timeout: `model_inter_token_timeout_ms = 15000`.
4. Timeout MUST trigger fallback to next provider in chain (not immediate failure).
5. Model calls are NOT retried to the same provider (non-idempotent due to token consumption).
6. Fallback to next provider IS the retry mechanism.
7. All fallbacks exhausted MUST fail with `PROVIDER_UNAVAILABLE`.

#### 5.7.6 Token Accounting

1. Every model call MUST record `input_tokens` and `output_tokens` from provider response.
2. Token counts MUST be emitted as `model.inference.usage` event with `tenant_id`, `model_ref`, `provider`.
3. Token counts MUST feed into billing meters at call completion time.
4. If provider does not return token counts, Model Runtime MUST estimate using tokenizer and flag `usage_estimated=true`.
5. Per-task cumulative token usage MUST be tracked and included in terminal checkpoint (5.1.9).

#### 5.7.7 Model Runtime Events (required)

1. `model.inference.requested` — model call initiated (includes `model_ref`, `provider`, `input_tokens_estimated`)
2. `model.inference.first_token` — first streaming token received
3. `model.inference.completed` — model call finished (includes `usage`, `finish_reason`, `duration_ms`)
4. `model.inference.failed` — model call failed (includes error code, provider)
5. `model.inference.fallback` — fallback to next provider triggered
6. `model.provider.health_changed` — provider health state transition
7. `model.token_budget.exceeded` — tenant token budget breached

All events MUST include: `task_id`, `request_id`, `trace_id`, `tenant_id`.

#### 5.7.8 Operational Hardening

1. Model Runtime MUST support provider credential rotation without restart (hot reload from secret store).
2. Provider API keys MUST be stored in Secret Reference Store (same as tool secrets, 5.3.12); plaintext keys MUST NOT appear in config, logs, or events.
3. Model Runtime MUST maintain a response cache for identical `(model_ref, messages_hash, constraints_hash)` with TTL `model_cache_ttl_ms = 0` (disabled by default; tenant-configurable).
4. Connection pooling to providers MUST be enforced with `max_connections_per_provider = 50` (default).
5. Model Runtime health endpoint MUST report `{providers: [{name, health, requests_1m, error_rate_1m, p95_latency_ms}]}`.
6. Model Runtime MUST support graceful drain: stop accepting new calls, allow in-flight calls to complete within `model_drain_timeout_ms = 120000`.

### 5.8 Context Packs

#### 5.8.1 Hierarchy and Source (locked)

1. Hierarchy: `global -> org -> project -> session`.
2. Context Assembler MUST load packs from pack storage APIs only.
3. Core runtime MUST NOT walk local filesystem paths for rule loading.

#### 5.8.2 Merge and Precedence

1. Merge order follows hierarchy.
2. Later layer overrides earlier layer for same key (last-write-wins).
3. Merge result MUST be deterministic and auditable.

#### 5.8.3 Governance and Isolation

1. Packs are tenant-scoped except signed system global packs.
2. Cross-tenant pack visibility is forbidden.
3. Production packs MUST be signed.
4. Pack version and signature metadata MUST be retained for replay/audit.
5. Pack schema contract is `schemas/v1/context_pack.schema.json`.
6. Pack versioning is SemVer and `pack_id` is immutable across versions.
7. Unsigned production packs MUST be rejected.

Context Pack required fields:

1. `pack_id`
2. `layer` (`global|org|project|session`)
3. `version` (SemVer)
4. `signature` (`algorithm`, `key_id`, `value`)
5. `scope_filters`
6. `rules`
7. `model_policy_refs`
8. `tool_policy_refs`
9. `critical_fact_tags`
10. `permission_cache_policy`
11. `egress_fallback_order`
12. `metadata`

Signing contract:

1. Pack signing uses Ed25519 (same baseline as manifest signing).
2. Verification failure MUST reject pack load in production paths.

#### 5.8.4 Policy Hooks for Context Assembly

1. Packs define critical fact policy tags (`must_verify`, `never_verify`).
2. Packs may configure `permission_cache` policy for high-security tenants.
3. Packs may set context assembly defaults (for example critic/default enablement).

Pack Store APIs:

1. `GET /v1/packs/{pack_id}`
2. `GET /v1/packs/{pack_id}/versions`
3. `POST /v1/packs` (admin only)

### 5.9 Marketplace Extensions

1. Signed manifest required.
2. Capability-based discovery and install-time policy review.
3. Version compatibility checks on update.
4. Metering hooks for usage-based billing.

### 5.10 YMIR Runtime (Background Intelligence, locked)

#### 5.10.1 Scope and Contract Boundaries

1. YMIR is a first-party background runtime inside Yggdrasil architecture boundaries.
2. YMIR is a subsystem of the Yggdrasil runtime, not a separate service.
3. Physical deployment MAY be co-located in monolith mode or scaled as YMIR-role workers in distributed mode.
4. In both modes, YMIR MUST use the same internal contracts, schemas, and event envelopes.
5. There is no separate YMIR protocol surface.
6. YMIR MUST NOT bypass ingress/orchestrator/tool/egress contracts.
7. YMIR MUST NOT introduce new public `message_kind` values in V1.
8. Observer runtime is not part of YMIR wake execution; Observer belongs to Valkyrie post-iteration pipeline (Section `5.11`).

#### 5.10.2 Trigger and Wake Contract

1. YMIR wakes on scheduled ticks and event-driven signals.
2. Wake envelope MUST conform to `schemas/v1/ymir_wake_event.schema.json`.
3. Wake dedup key is `(tenant_id, dedup_key)`.
4. Duplicate wake events inside dedup window MUST be dropped and emitted as `ymir.wake.deduped`.
5. Default scheduling:
   1. active tenant tick: `60s`
   2. idle tenant tick: `300s`
   3. heavy maintenance jobs: policy-driven (`hourly|nightly`)
6. YMIR job types are locked to `maintenance | proactive | reflection`.

#### 5.10.3 Ingress Mapping (No Drift from Section 4.6)

1. YMIR maintenance/proactive-analysis tasks map to `message_kind=system_event` with `principal_type=daemon`.
2. YMIR user-facing proactive tasks map to `message_kind=user_prompt` with `principal_type=daemon`.
3. Daemon-auth required fields from Section `4.6.15` MUST be present (`triggering_cause`, and `on_behalf_of` when required).
4. YMIR MUST NOT emit `message_kind=tool_callback`.
5. YMIR MUST NOT emit `message_kind=admin`.

#### 5.10.4 Isolation and Governance

1. YMIR reads and writes are tenant-scoped.
2. Cross-tenant raw or aggregate intelligence is forbidden in V1.
3. Any scope breach MUST fail with `YMIR_TENANT_SCOPE_VIOLATION`.
4. Cross-tenant aggregate patterns are deferred to V1.1 under explicit tenant-opt-in and audit controls.

#### 5.10.5 Memory and Tool Interaction

1. YMIR memory writes are append-only into `ymir_system_context` with provenance marker `source=ymir` and `kind=proposal`.
2. YMIR MUST NOT write directly to conversation logs, `edges_history`, or live graph.
3. Promotion of proposals into durable memory MUST pass through orchestrator write path.
4. `ymir_system_context` default retention is `90d` (tenant-overridable) and its own reconciliation cadence.
5. `ymir_system_context` IDs MUST use ULID prefix `ysc_`.
6. YMIR external I/O MUST use Tool Bus only.
7. YMIR tool actions MUST pass Site 1 permission and tenant policy checks.
8. YMIR-triggered user-visible output MUST still be produced by orchestrator Site 7 as `OutputEnvelope`.

#### 5.10.6 Idempotency, Retry, and Cancellation (locked)

Idempotency:

1. `ymir_idempotency_key = sha256(tenant_id || "\x1f" || task_type || "\x1f" || canonical_json(input))`.
2. `canonical_json(input)` MUST use RFC 8785 JCS normalization.

Retry:

1. Proactive task creation is strict at-most-once.
2. No automatic retry on immediate failure.
3. Re-attempt only on next scheduled wake and only if input still applies.
4. Failures MUST emit `ymir.proactive.failed`.

Cancellation propagation:

1. Cancelling a YMIR wake MUST cancel all child tasks created during that wake.
2. Cancellation mapping is deterministic: `wake_id -> task_id set -> per-task cancel flag`.
3. Child task cancellation grace is `cancellation_grace_ms=5000`.
4. Emit `ymir.wake.cancelled` and per-task `core.loop.cancelled`.

#### 5.10.7 Guardrails

Per-tenant defaults:

1. `max_concurrent_ymir_jobs = 1`
2. `max_ymir_wall_time_ms = 30000`
3. `max_ymir_tool_calls_per_wake = 8`
4. `max_ymir_proactive_tasks_per_wake = 3`
5. `max_ymir_reflection_items_per_tick = 100`

Budget overflow handling:

1. Overflow MUST emit degraded outcome and defer residual work.
2. Overflow SHOULD emit `YMIR_JOB_BUDGET_EXCEEDED`.

#### 5.10.8 Reflector Job Type (locked)

1. Reflector is a YMIR job type (`job_type=reflection`) and runs on scheduled/event-driven YMIR wakes.
2. Reflector input set: unreflected observations in tenant scope only.
3. Reflector procedure:
   1. group observations by entity/category
   2. deduplicate semantically equivalent observations
   3. resolve contradictions by recency + confidence while preserving audit trail
   4. produce consolidated proposals
4. Reflector writes proposals to `ymir_system_context` only.
5. Reflector MUST NOT directly mutate conversation logs, `edges_history`, or live graph.
6. Reflector-triggered actions are advisory-only and MUST route through normal orchestrator ingress/output paths.
7. Reflection trigger idempotency:
   `reflection_trigger_id = sha256(tenant_id || "\x1f" || trigger_reason || "\x1f" || canonical_json(source_observation_ids))`.
8. Duplicate reflection triggers inside configured dedup window MUST emit `REFLECTION_TRIGGER_DEDUPED`.

#### 5.10.9 YMIR Events (required)

1. `ymir.wake.received`
2. `ymir.wake.deduped`
3. `ymir.tick.started`
4. `ymir.tick.completed`
5. `ymir.autodream.started`
6. `ymir.autodream.completed`
7. `ymir.proactive.detected`
8. `ymir.task.enqueued`
9. `ymir.task.enqueue_failed`
10. `ymir.policy.blocked`
11. `ymir.proactive.failed`
12. `ymir.wake.cancelled`
13. `ymir.error`
14. `ymir.reflection.started`
15. `ymir.reflection.completed`
16. `ymir.reflection.promoted`
17. `ymir.reflection.dropped`
18. `ymir.reflection.trigger_emitted`

All YMIR events MUST include: `tenant_id`, `trace_id`, `wake_id`, timestamps.

#### 5.10.10 Scheduler Persistence and Wake Queue

1. YMIR scheduler state (next-tick times per tenant) MUST be persisted to Skuld metadata store.
2. On restart, scheduler MUST rebuild tick schedule from persisted state, not from scratch.
3. Wake queue capacity: `ymir_wake_queue_max = 1024` pending wakes per node.
4. Queue overflow MUST drop lowest-priority wakes (`idle tenant ticks` first) and emit `ymir.wake_queue.overflow`.
5. Wake dedup window: `ymir_wake_dedup_window_ms = 30000` (default).
6. Tick coalescing: if multiple ticks for the same `(tenant_id, job_type)` are pending, coalesce to single wake with latest inputs.
7. Coalesced wakes MUST emit `ymir.wake.coalesced`.

#### 5.10.11 Proposal Garbage Collection

1. `ymir_system_context` proposals with `status=promoted` MUST be retained for `ymir_proposal_promoted_retain_days = 30` after promotion, then garbage-collected.
2. Proposals with `status=dropped` or `status=expired` MUST be garbage-collected after `ymir_proposal_gc_days = 7`.
3. Proposals with `status=pending` older than `ymir_proposal_pending_max_days = 14` MUST be auto-expired and emit `ymir.proposal.auto_expired`.
4. Garbage collection runs as a YMIR `maintenance` job type.
5. GC MUST emit `ymir.gc.completed` with `{tenant_id, proposals_collected, storage_freed_bytes}`.

#### 5.10.12 Graceful Shutdown

1. On shutdown signal, YMIR MUST stop accepting new wakes.
2. In-flight YMIR jobs MUST be allowed to complete within `ymir_drain_timeout_ms = 30000`.
3. Jobs exceeding drain timeout MUST be cancelled with cancellation propagation (5.10.6).
4. Scheduler state MUST be persisted before process exit.
5. Drain MUST emit `ymir.drain.started` and `ymir.drain.completed`.

#### 5.10.13 Operational Hardening

1. YMIR MUST enforce per-tenant cost budget: `max_ymir_cost_per_day_cents` (default `100`). Budget breach MUST disable YMIR for that tenant until next day boundary and emit `ymir.budget.exceeded`.
2. YMIR MUST track cumulative model token usage from reflection and proactive calls separately from user-initiated calls.
3. YMIR wake processing MUST have per-wake wall-time enforcement: `max_ymir_wall_time_ms` (5.10.7). No wake may run indefinitely.
4. YMIR proposal storage MUST count against tenant Memory Fabric quota (5.5.12).
5. YMIR health endpoint MUST report `{active_wakes, pending_wakes, tenants_active, proposals_pending, reflection_backlog}`.
6. YMIR MUST support graceful tenant-level disable: `ymir.enabled=false` in tenant policy stops all YMIR activity for that tenant within one tick cycle.
7. Reflection backlog (unreflected observations exceeding `max_ymir_reflection_items_per_tick * 10`) MUST emit `ymir.reflection.backlog_warning` and prioritize oldest observations.

### 5.11 Valkyrie (Observer-Reflector System, locked)

#### 5.11.1 Boundaries and Ownership

1. System name is `Valkyrie`.
2. Observer and Reflector are separate components by execution shape:
   1. Observer: low-latency post-iteration extractor (outside YMIR wake loop).
   2. Reflector: batch consolidation job (`job_type=reflection`) inside YMIR.
3. Observer MUST NOT run inside YMIR wake runtime.
4. Reflector MUST NOT bypass orchestrator contracts.

#### 5.11.2 Observer Execution Model

1. Observer fires from an async post-iteration hook after Site 7 and MUST NOT block the main loop.
2. Monolith mode: Observer runs in dedicated async task pool.
3. Distributed mode: Observer runs as worker role `observer`, independently scalable.
4. Observer writes to `observations` partition only.
5. Observer outputs are `kind=observation`, `source=observer`.

#### 5.11.3 Observer Default Policy (V1)

1. Default is OFF; tenant opt-in only via Context Pack `memory.observer.enabled=true`.
2. When enabled, trigger policy is:
   1. every `N=3` turns
   2. OR if turn contains tool result
   3. OR if buffered tokens since last observer run exceed threshold
3. Observer model class MUST use low-cost routing policy (`observer_model_ref`), not main-loop model by default.
4. Hard tenant ceilings are required:
   1. `max_observer_calls_per_minute`
   2. `max_observer_tokens_per_day`
5. Budget breach MUST open observer circuit and degrade non-blockingly.

#### 5.11.4 Channel and Flush Contract

1. Observer channel key is `(tenant_id, session_id)` (never tenant-only).
2. Fill/flush triggers are OR-semantics:
   1. `max_buffer_messages = 20`
   2. `max_buffer_tokens = 4000`
   3. `max_buffer_idle_ms = 30000`
   4. `session_closed`
   5. `buffer_force_flush` admin action
3. Channel state is durable via Observation WAL (`5.5.9`).
4. Buffer overflow handling:
   1. force flush at `1.5 * max_buffer_messages`
   2. if still overloaded, drop oldest entries and emit `memory.observer.buffer_dropped`
5. Observer failure isolation: main conversation path continues unaffected.

#### 5.11.5 Wire and Storage Shapes

1. Observer LLM wire contract uses strict `<observation ...>...</observation>` tag format.
2. Parser is strict and per-observation isolated; malformed tags emit `memory.observer.parse_failed` and do not fail whole buffer.
3. Persisted observation record fields MUST include:
   1. `observation_id`
   2. `tenant_id`
   3. `session_id`
   4. `buffer_id`
   5. `start_timestamp`
   6. `end_timestamp`
   7. `start_seq`
   8. `end_seq`
   9. `text`
   10. `category`
   11. `confidence`
   12. `source_message_ids`
   13. `observer_model_ref`
   14. `observer_prompt_hash`
   15. `reflection_status`
4. Schemas:
   1. `schemas/v1/observation.schema.json`
   2. `schemas/v1/observation_buffer.schema.json`
   3. `schemas/v1/reflection_run.schema.json`
   4. `schemas/v1/reflection_trigger.schema.json`

#### 5.11.6 Promotion and Verification Flow

1. Observations stay in `observations` partition as `unreflected` until Reflector processes them.
2. Reflector writes consolidated proposals into `ymir_system_context`.
3. Promotion to durable memory/graph MUST go via orchestrator write path only.
4. Unpromoted observations are `freshness=unverified` if included in context.
5. Site 3 verification applies to promoted/proposal flow; unpromoted observations do not bypass verification rules.

#### 5.11.7 Valkyrie Events (required)

1. `memory.observer.started`
2. `memory.observer.buffer_flushed`
3. `memory.observer.completed`
4. `memory.observer.parse_failed`
5. `memory.observer.failed`
6. `memory.observer.buffer_dropped`
7. `memory.observer.circuit_opened`
8. `memory.observation_gap`

#### 5.11.8 Valkyrie Errors (required)

1. `OBSERVER_BUFFER_OVERFLOW`
2. `OBSERVER_PARSE_FAILED`
3. `OBSERVER_MODEL_UNAVAILABLE`
4. `OBSERVER_TENANT_SCOPE_VIOLATION`
5. `OBSERVER_CIRCUIT_OPEN`
6. `OBSERVATION_WAL_UNAVAILABLE`
7. `OBSERVATION_WAL_SEGMENT_CORRUPT`
8. `REFLECTION_PROMOTION_CONFLICT`
9. `REFLECTION_TRIGGER_DEDUPED` (informational)

#### 5.11.9 Operational Hardening

1. Observer pool sizing: monolith `observer_pool_size = 4` async tasks (default); distributed `observer_worker_min = 1`.
2. Observer memory budget per buffer: `max_observer_buffer_memory_kb = 512`. Buffer exceeding memory limit triggers immediate force flush.
3. Observer model call timeout: `observer_model_timeout_ms = 10000`. Timeout MUST fail the buffer extraction (not block), emit `memory.observer.failed`, and re-queue buffer for next attempt.
4. Observer MUST NOT accumulate unbounded buffers in memory; total active buffers per node MUST be capped at `max_active_observer_buffers = 256`. Overflow MUST evict oldest idle buffer with `memory.observer.buffer_evicted`.
5. Observer MUST support graceful drain: flush all active buffers, persist to Observation WAL, then exit. Drain timeout: `observer_drain_timeout_ms = 15000`.
6. Observation partition storage MUST count against tenant Memory Fabric quota (5.5.12).
7. Stale observation cleanup: observations with `reflection_status=unreflected` older than `observation_stale_max_days = 30` MUST be auto-expired and emit `memory.observation.auto_expired`.
8. Observer health endpoint MUST report `{active_buffers, buffers_flushing, model_calls_1m, parse_failures_1m, circuit_state}`.

### 5.12 Self-Evaluation and Success Criteria (locked)

#### 5.12.1 Purpose

Self-Evaluation is a first-class subsystem that determines whether a task has actually achieved what was requested, not merely whether the model stopped producing output. Without this, a task can terminate with `succeeded` when it has only partially addressed the user's intent or silently missed requirements.

Self-Evaluation answers three questions per iteration:

1. What was the user's intent? (from `intent_descriptor`)
2. What has been accomplished so far? (from tool results, model output, accumulated state)
3. Is the task done, making progress, or stuck? (evaluation verdict)

#### 5.12.2 Success Criteria Contract

Every task MUST have a `SuccessCriteria` object resolved before the first model invocation.

Source resolution order:

1. Explicit criteria from ingress payload (`execution.success_criteria`).
2. Criteria derived by Intent Resolver (Context Assembly stage 1) from user prompt analysis.
3. Fallback default: `model_self_assessed` (model decides when done; weakest guarantee).

SuccessCriteria schema (`schemas/v1/success_criteria.schema.json`):

```json
{
  "criteria_id": "scr_01JY...",
  "task_id": "tsk_01JY...",
  "source": "explicit|intent_derived|default",
  "objectives": [
    {
      "objective_id": "obj_01JY...",
      "description": "Update the order status to shipped",
      "verification_type": "tool_check|output_match|model_assessed",
      "verification_ref": "tool:read_order_status|pattern:status=shipped",
      "required": true,
      "status": "pending|met|failed|skipped"
    }
  ],
  "completion_policy": "all_required|any_required|percentage",
  "completion_threshold": 1.0,
  "max_evaluation_calls": 3
}
```

Required fields:

1. `criteria_id` (ULID, prefix `scr_`)
2. `task_id`
3. `source`
4. `objectives` (array, at least one)
5. `completion_policy`
6. `completion_threshold` (float 0.0-1.0; for `percentage` policy)

Each objective MUST have:

1. `objective_id` (ULID, prefix `obj_`)
2. `description`
3. `verification_type`
4. `required` (boolean)
5. `status`

#### 5.12.3 Verification Types

1. `tool_check`: objective is verified by invoking a read-only tool and comparing the result against expected state. The tool call goes through the standard Tool Bus path (Site 1 permission, Site 2 execution). `verification_ref` specifies `tool:<tool_id>` and optional match expression.
2. `output_match`: objective is verified by pattern matching against the model's final output or accumulated tool results. No additional tool call needed. `verification_ref` specifies the match pattern.
3. `model_assessed`: objective is verified by a dedicated self-evaluation model call. This is the weakest form and is used when no deterministic check is possible.

Precedence: `tool_check` > `output_match` > `model_assessed`. Context Assembly SHOULD prefer deterministic verification when available.

#### 5.12.4 Evaluation Execution Model

Self-Evaluation fires inside Site 7 before the loop decision is finalized.

Execution flow:

```text
Site 7 entry:
  1. collect iteration outcomes (model output, tool results, guardrail state)
  2. load SuccessCriteria for current task
  3. for each objective with status=pending:
     a. if verification_type=tool_check:
        - dispatch read-only verification call via Tool Bus
        - compare result against verification_ref
        - update objective status (met|failed)
     b. if verification_type=output_match:
        - match accumulated output against verification_ref
        - update objective status (met|failed)
     c. if verification_type=model_assessed:
        - include evaluation prompt in next iteration context (do NOT make separate model call here)
        - mark objective as pending_model_assessment
  4. compute completion score:
     - required_met = count(required objectives with status=met)
     - required_total = count(required objectives)
     - optional_met = count(non-required objectives with status=met)
  5. apply completion_policy:
     - all_required: done if required_met == required_total
     - any_required: done if required_met >= 1
     - percentage: done if (required_met / required_total) >= completion_threshold
  6. emit evaluation verdict: done|progress|stuck|failed
  7. feed verdict into Site 7 loop decision
```

Verdict to Site 7 decision mapping:

1. `done` -> `finalize` with reason `success_criteria_met`
2. `progress` -> `iterate` (objectives partially met, forward motion detected)
3. `stuck` -> if `no_progress_iterations >= max_no_progress_iterations` then `expire` with reason `no_progress_cap`, else `iterate` with `evaluation_hint` injected into next context
4. `failed` -> `fail` with reason `success_criteria_failed` (required objective explicitly failed with no recovery path)

#### 5.12.5 Progress Detection (No-Progress Guard)

Progress is determined by comparing evaluation state across iterations:

1. `progress_delta = objectives_met_this_iteration - objectives_met_previous_iteration`
2. If `progress_delta > 0`: progress detected, reset no-progress counter.
3. If `progress_delta == 0` AND new tool calls were made: ambiguous, increment no-progress counter by 0.5 (rounded up on check).
4. If `progress_delta == 0` AND no new tool calls: stuck, increment no-progress counter by 1.
5. No-progress counter is tracked in the task checkpoint and survives suspend/resume.

This replaces the naive `max_no_progress_iterations` guard in 5.1.5 item 6 with a criteria-aware version. The guardrail limit still applies but is now informed by actual objective progress rather than heuristic model output comparison.

#### 5.12.6 Evaluation Hint Injection

When verdict is `stuck` or `progress` with unmet objectives, Context Assembly injects an `evaluation_hint` chunk in the next iteration:

```json
{
  "chunk_type": "evaluation_hint",
  "provenance": {
    "source_type": "self_evaluation",
    "source_ref": "scr_01JY...",
    "retrieved_at": "2026-04-09T13:00:00Z",
    "freshness": "verified",
    "token_count": 120
  },
  "content": {
    "unmet_objectives": ["obj_01JY..."],
    "met_objectives": ["obj_02JY..."],
    "stuck_reason": "Order status check returned 'processing', expected 'shipped'",
    "iteration_budget_remaining": 25,
    "suggestion": "Verify order has been dispatched before checking status again"
  }
}
```

This chunk is ranked above lowest-priority memory chunks but below critical verified facts in the budget trimming order.

#### 5.12.7 Tenant Control

Tenants control self-evaluation behavior via Context Pack policy:

1. `evaluation.mode`: `full|lite|off` (default `lite`).
   - `full`: all verification types enabled, `tool_check` verification calls allowed.
   - `lite`: `output_match` and `model_assessed` only, no extra tool calls for verification.
   - `off`: self-evaluation disabled; Site 7 falls back to model-decides-when-done behavior.
2. `evaluation.max_verification_calls_per_iteration`: integer (default `3`). Caps read-only verification tool calls per Site 7 evaluation pass.
3. `evaluation.auto_derive_criteria`: boolean (default `true`). When true and no explicit criteria in ingress, Intent Resolver derives objectives from prompt.
4. `evaluation.strict_completion`: boolean (default `false`). When true, `finalize` requires ALL objectives met (overrides `completion_policy`).

#### 5.12.8 Integration Points

1. **Intent Resolver** (Context Assembly 5.1.2): derives initial `SuccessCriteria` when `source=intent_derived`. Objectives are extracted from the user prompt and matched against known tool capabilities.
2. **Site 7** (5.1.3): evaluation fires inside Site 7 before loop decision. Verdict directly influences the `iterate|finalize|fail|expire` outcome.
3. **Context Assembly**: injects `evaluation_hint` chunks on subsequent iterations when objectives are partially met.
4. **Checkpoint** (5.1.8): `SuccessCriteria` state (objective statuses, no-progress counter) is persisted in checkpoint envelope. Resume restores evaluation state.
5. **Terminal write** (5.1.9): final result MUST include `evaluation_summary` with per-objective outcomes.
6. **Valkyrie** (5.11): Observer MAY include evaluation progress in observation buffer for Reflector analysis.
7. **YMIR** (5.10): YMIR MAY propose criteria adjustments via `ymir_system_context` when reflection detects persistent stuck patterns.

#### 5.12.9 Checkpoint Extension

Checkpoint envelope (5.1.8) gains additional fields when self-evaluation is active:

```json
{
  "evaluation_state": {
    "criteria_id": "scr_01JY...",
    "objectives_met": 2,
    "objectives_total": 4,
    "no_progress_counter": 1.5,
    "last_verdict": "progress",
    "verification_calls_used": 1,
    "objective_statuses": {
      "obj_01JY...": "met",
      "obj_02JY...": "met",
      "obj_03JY...": "pending",
      "obj_04JY...": "pending"
    }
  }
}
```

#### 5.12.10 Self-Evaluation Events (required)

1. `evaluation.criteria_resolved` — criteria locked for task (includes `source`, objective count)
2. `evaluation.objective_checked` — single objective verification attempted (includes `verification_type`, `result`)
3. `evaluation.verdict_emitted` — iteration verdict computed (includes `verdict`, `objectives_met`, `objectives_total`)
4. `evaluation.progress_detected` — forward motion confirmed
5. `evaluation.stuck_detected` — no-progress counter incremented
6. `evaluation.hint_injected` — evaluation hint added to context
7. `evaluation.completed` — task-level final evaluation summary

All events MUST include: `task_id`, `request_id`, `trace_id`, `tenant_id`, `iteration`, `seq`.

#### 5.12.11 Self-Evaluation Errors

1. `EVALUATION_CRITERIA_INVALID` — malformed or schema-violating criteria from ingress
2. `EVALUATION_VERIFICATION_FAILED` — tool_check verification call failed (non-blocking; objective marked `failed`)
3. `EVALUATION_BUDGET_EXCEEDED` — verification call cap hit for iteration
4. `EVALUATION_CRITERIA_RESOLUTION_FAILED` — Intent Resolver could not derive criteria (falls back to `default` source)

#### 5.12.12 ULID Prefixes

1. `scr_` — success criteria
2. `obj_` — objective
3. `evl_` — evaluation run

#### 5.12.13 Schema Files

1. `schemas/v1/success_criteria.schema.json`
2. `schemas/v1/evaluation_verdict.schema.json`
3. `schemas/v1/evaluation_hint.schema.json`
4. `schemas/v1/evaluation_summary.schema.json`

#### 5.12.14 Conformance Vectors

1. `evaluation/criteria_resolution` — verify criteria are resolved before first model call
2. `evaluation/tool_check_verification` — verify tool_check objectives dispatch read-only calls and compare correctly
3. `evaluation/progress_detection` — verify no-progress counter increments and resets per specification
4. `evaluation/verdict_to_site7_mapping` — verify verdict-to-decision mapping is correct
5. `evaluation/checkpoint_persistence` — verify evaluation state survives suspend/resume
6. `evaluation/hint_injection` — verify evaluation hints appear in context when verdict is stuck/progress
7. `evaluation/tenant_policy` — verify mode/off/lite/full tenant controls

### 5.13 Integration Wiring Map (locked)

Every subsystem boundary crossing in Yggdrasil is enumerated here. This section is the single source of truth for what data crosses each boundary, in which direction, using which schema, and what happens on failure. No subsystem-to-subsystem call is valid unless it appears in this map.

#### 5.13.1 Boundary Crossing Table

| # | Source | Destination | Crossing Name | Direction | Schema/Contract | Trigger |
|---|---|---|---|---|---|---|
| W1 | Ingress Adapter | Orchestrator | `admission` | one-way | `TaskRequest` (4.6.2) | new message received |
| W2 | Orchestrator | Context Assembly | `context_build` | call-return | `ContextPackage` (context.md §9) | top of each iteration |
| W3 | Context Assembly | Memory Fabric | `memory_retrieve` | call-return | Memory retrieval API | parallel fan-out stage |
| W4 | Context Assembly | Memory Fabric | `domain_snapshot_read` | call-return | `DomainSnapshot` (5.5.8) | parallel fan-out stage |
| W5 | Context Assembly | Tool Registry (Skuld) | `tool_discover` | call-return | discover API (5.3.5) | parallel fan-out stage |
| W6 | Context Assembly | Context Pack Store | `pack_load` | call-return | Pack Store API (5.8.4) | intent resolver + merge |
| W7 | Orchestrator | Model Runtime | `model_call` | call-return (streaming) | `ModelRequest`/`ModelResponse` (5.7.1) | after context assembled |
| W8 | Site 1 | Tool Registry (Skuld) | `permission_lookup` | call-return | registry cache read (5.3.11) | before tool dispatch |
| W9 | Site 2 | Tool Execution Service | `tool_dispatch` | call-return or async | `ToolCallRequest`/`ToolCallResponse` (5.3.6) | after permission grant |
| W10 | Site 2 | Tool Execution Service | `tool_cancel` | one-way | cancel API (5.3.13) | task cancellation |
| W11 | Site 3 | Tool Bus | `verification_read` | call-return | read-only tool call (5.3.6) | memory claim check |
| W12 | Site 4 | Model Runtime | `critic_call` | call-return | `ModelRequest`/`ModelResponse` (5.7.1) | policy-controlled |
| W13 | Site 5 | Context Assembly | `compaction_signal` | signal | compaction signal (5.1.2) | budget threshold |
| W14 | Site 6 | Orchestrator | `child_task_spawn` | call-return | `TaskRequest` (4.6.2) with parent lineage | swarm handoff |
| W15 | Site 7 | Self-Evaluation | `evaluation_run` | call-return | `SuccessCriteria`/verdict (5.12) | end of iteration |
| W16 | Site 7 | Egress | `output_emit` | one-way | `OutputEnvelope` (5.6.2) | finalize/progress |
| W17 | Site 7 | Observer (Valkyrie) | `observer_hook` | async fire-and-forget | observation buffer (5.11.4) | post-decision |
| W18 | Orchestrator | Memory Fabric WAL | `checkpoint_write` | call-return | checkpoint envelope (5.1.8) | durable suspend |
| W19 | Orchestrator | Memory Fabric WAL | `terminal_write` | call-return | terminal checkpoint (5.1.9) | task terminal |
| W20 | Observer | Observation WAL | `buffer_persist` | call-return | observation WAL record (5.5.9) | channel flush |
| W21 | Observer | Memory Fabric | `observation_promote` | call-return | observation record (5.11.5) | after extraction |
| W22 | YMIR Scheduler | Orchestrator | `ymir_task_inject` | one-way | `TaskRequest` (4.6.2) via ingress mapping (5.10.3) | wake tick |
| W23 | YMIR Reflector | Memory Fabric | `proposal_write` | call-return | `ymir_system_context` record (5.10.5) | reflection complete |
| W24 | Egress | Client | `stream_deliver` | streaming | SSE frames (4.7) | output queued |
| W25 | Ingress | Orchestrator | `callback_resume` | one-way | `tool_callback` message (4.6.3) | async tool completes |
| W26 | Self-Evaluation | Tool Bus | `verification_dispatch` | call-return | read-only tool call (5.3.6) | `tool_check` objective |
| W27 | Self-Evaluation | Context Assembly | `hint_inject` | signal | evaluation hint chunk (5.12.6) | stuck/progress verdict |
| W28 | Skuld (Mailbox) | Workers | `control_plane_msg` | one-way | mailbox envelope (11.12.4) | cluster events |
| W29 | Workers | Skuld (Mailbox) | `heartbeat_report` | one-way | mailbox envelope (11.12.4) | periodic |
| W30 | Context Assembly | Self-Evaluation | `criteria_derive` | call-return | `SuccessCriteria` (5.12.2) | intent resolution |

#### 5.13.2 Crossing Contracts (normative detail)

**W1: Ingress -> Orchestrator (admission)**

1. Ingress adapter normalizes to `TaskRequest` per Section 4.6.2.
2. Orchestrator receives `TaskRequest` only after ingress durably persists to ingress log and idempotency index (4.6.11).
3. Orchestrator MUST validate `TaskRequest` schema before admission.
4. On admission, orchestrator writes admission record (5.1.8 item 1) and emits `core.loop.task_accepted`.
5. Failure: schema violation returns `VALIDATION_*` to ingress; ingress returns error to client.
6. Trace lineage: `trace_id` and `request_id` from ingress carry through entire task lifecycle.

**W2: Orchestrator -> Context Assembly (context_build)**

1. Orchestrator passes current task state, transcript, and tool results to Context Assembly subroutine.
2. Context Assembly returns `ContextPackage` conforming to `schemas/v1/context_package.schema.json`.
3. Failure: Context Assembly fail-closed stages (intent_resolver, ranker, prompt_assembler) abort iteration with `INTERNAL_*` error.
4. Failure: Context Assembly fail-open stages return degraded `ContextPackage` with `degraded_stages[]` populated.
5. Orchestrator MUST NOT call model if Context Assembly fails closed.

**W3: Context Assembly -> Memory Fabric (memory_retrieve)**

1. Context Assembly reads recent turns, semantic episodes, and graph subgraph from Memory Fabric retrieval APIs.
2. All reads are tenant-scoped; tenant_id from task context.
3. Recent turns path is fail-closed; long-term and graph paths are fail-open with degraded flags.
4. Every retrieved chunk MUST carry provenance metadata (source_type, source_ref, retrieved_at, freshness, token_count).
5. Missing provenance MUST fail-closed per Section 5.1.2.

**W4: Context Assembly -> Memory Fabric (domain_snapshot_read)**

1. Context Assembly reads domain snapshot by key `(tenant_id, domain, snapshot_type, snapshot_key)`.
2. Read is strictly read-only; no refresh occurs here.
3. Stale snapshots (`now - last_refreshed_at > ttl_ms`) are marked `freshness=stale` and emit `context.assembly.domain_snapshot_stale`.
4. Failure: fail-open with `domain_snapshot_unavailable` in `degraded_stages[]`.

**W5: Context Assembly -> Tool Registry (tool_discover)**

1. Context Assembly calls discover API (5.3.5) with tenant_id, intent_text, domain_hints.
2. Registry returns ranked tool list (max 20 after permission filter).
3. Failure: fail-open with fallback to cached previous discovery or minimal safe set.
4. Tool descriptions are included in context package for model consumption.

**W6: Context Assembly -> Context Pack Store (pack_load)**

1. Context Assembly loads packs by hierarchy: global -> org -> project -> session.
2. Merge precedence: later layer overrides earlier for same key.
3. Failure: unsigned pack in production MUST be rejected. Missing pack layer degrades to next available layer.
4. Pack rules feed into intent resolution, critical fact tags, permission cache policy, and model routing.

**W7: Orchestrator -> Model Runtime (model_call)**

1. Orchestrator constructs `ModelRequest` from `ContextPackage` output.
2. `model_ref` and routing policy come from Context Pack `task_class -> model_policy_ref`.
3. Model Runtime returns `ModelResponse` with `parsed_parts`, `usage`, `finish_reason`.
4. Streaming: Model Runtime streams via internal channel; orchestrator collects and parses.
5. Failure: provider errors trigger fallback chain (5.7.2). All fallbacks exhausted = `fail` with `PROVIDER_UNAVAILABLE`.
6. Orchestrator MUST validate parsed output per 5.1.10 (no ambiguous final_answer + tool_calls).

**W8: Site 1 -> Tool Registry (permission_lookup)**

1. Site 1 reads `risk_level`, `scopes`, and tenant policy from in-memory registry cache.
2. Decision is deterministic: `granted|denied|needs_human`.
3. Cache staleness is bounded by safety-field stale cap (10000ms per 11.8).
4. Failure: stale cache beyond cap MUST fail-closed on the affected permission check.

**W9: Site 2 -> Tool Execution Service (tool_dispatch)**

1. Orchestrator sends `ToolCallRequest` envelope (5.3.6) to execution service.
2. Input parameters MUST be validated against `input_schema` before dispatch.
3. Sync tools return terminal response in request-response cycle.
4. Async tools return `pending_callback` + `callback_token`; orchestrator durably suspends.
5. Secret references are resolved by execution service at execution time (5.3.12).
6. Failure: retry per action class (5.3.9). Circuit breaker opens after threshold (5.3.14).
7. Side-effecting calls MUST use action-journal states to prevent duplicate dispatch (5.1.8 item 2).

**W10: Site 2 -> Tool Execution Service (tool_cancel)**

1. Orchestrator sends cancellation signal using `request_id`.
2. Execution service SHOULD return `CANCELLED` within `cancellation_grace_ms=5000`.
3. Side-effecting cancellations set `side_effect_uncertain=true` (5.3.13).

**W11: Site 3 -> Tool Bus (verification_read)**

1. Site 3 dispatches read-only verification call with `freshness=live`.
2. Call goes through standard Tool Bus path (permission + execution).
3. Result is compared against memory-claimed values.
4. Outcome: `confirmed|stale|suppressed|unverified`.
5. Failure: verification call failure degrades memory entry to `unverified`, does not block loop.

**W12: Site 4 -> Model Runtime (critic_call)**

1. Critic uses separate model call (MAY be same or different model_ref per policy).
2. Input: recent model output, tool results, original intent.
3. Output: `continue|revise|escalate`.
4. Failure: critic infra failure degrades to warning; loop continues per 5.1.3 Site 4 item 6.
5. If delegated external critic is used, Site 4 MAY durably suspend.

**W13: Site 5 -> Context Assembly (compaction_signal)**

1. Context Assembly emits compaction signal (`needs_compaction`, `reason`, `recommended_strategy`, `severity`) during assembly.
2. Site 5 consumes this signal in same iteration path.
3. Site 5 triggers compaction when threshold formula is met (5.1.3 Site 5 item 7).
4. Compaction output replaces transcript for next iteration.
5. Failure: fallback to deterministic truncation.

**W14: Site 6 -> Orchestrator (child_task_spawn)**

1. Child task definitions are packaged as `TaskRequest` envelopes with parent lineage (`parent_task_id`).
2. Child tasks enter the same orchestrator admission path (W1 equivalent).
3. Parent durably suspends at Site 6 (5.1.8 item 3).
4. Child results are keyed by `(parent_task_id, child_task_id)` and aggregated deterministically.
5. Resume trigger: all required children terminal or timeout policy reached.
6. Failure: partial child failure is surfaced to parent loop with provenance per 5.1.3 Site 6 item 6.

**W15: Site 7 -> Self-Evaluation (evaluation_run)**

1. Site 7 loads `SuccessCriteria` for current task.
2. Evaluation fires per 5.12.4 execution flow.
3. Verdict feeds into loop decision mapping (5.12.4).
4. Failure: `EVALUATION_CRITERIA_RESOLUTION_FAILED` falls back to `model_self_assessed`. Evaluation errors are non-blocking.

**W16: Site 7 -> Egress (output_emit)**

1. Site 7 constructs `OutputEnvelope` (5.6.2) on `finalize` or `progress` decisions.
2. `OutputEnvelope` is durably enqueued to egress.
3. Egress ACKs after durable enqueue only (not after downstream delivery).
4. Streaming `progress` frames flow through SSE contract (4.7) during `running` state.
5. `final` frame is emitted exactly once per task.
6. Failure: egress queue full returns `EGRESS_QUEUE_FULL`; orchestrator retries per 5.6.3 policy.

**W17: Site 7 -> Observer (observer_hook)**

1. Async fire-and-forget: orchestrator enqueues post-iteration data to observer channel.
2. Main loop MUST NOT block on observer execution (5.1.3 Site 7 item 8).
3. Observer reads from channel buffer keyed by `(tenant_id, session_id)`.
4. Failure: observer failure is fully isolated from main conversation path (5.11.4 item 5).

**W18/W19: Orchestrator -> Memory Fabric WAL (checkpoint/terminal writes)**

1. Checkpoint writes occur only at suspendable continue sites (5.1.8 item 3).
2. Terminal writes occur on task completion with final outcome envelope.
3. Both MUST be durable after WAL `fsync` (5.5.3).
4. Resume MUST restart from checkpoint with preserved counters and transcript snapshot.
5. Failure: WAL write failure MUST fail-closed; task cannot safely continue without durable state.

**W20/W21: Observer -> WAL/Memory Fabric (buffer persist/promote)**

1. Buffer state writes go to Observation WAL (separate from Memory Fabric WAL per 5.5.9).
2. Promoted observation records go to Memory Fabric `observations` partition via standard write path.
3. Observation WAL failure MUST NOT block ingress/core-loop (5.5.9 item 8).

**W22: YMIR -> Orchestrator (task inject)**

1. YMIR creates tasks via ingress mapping (5.10.3): `system_event` or `user_prompt` with `principal_type=daemon`.
2. Tasks enter standard orchestrator admission path (W1 equivalent).
3. YMIR MUST NOT bypass ingress/orchestrator contracts (5.10.1 item 6).
4. Idempotency: `ymir_idempotency_key` per 5.10.6.
5. Failure: at-most-once for proactive tasks; retry only on next scheduled wake.

**W23: YMIR Reflector -> Memory Fabric (proposal_write)**

1. Reflector writes consolidated proposals to `ymir_system_context` partition only.
2. Provenance: `source=ymir`, `kind=proposal`.
3. Promotion to durable memory/graph MUST go via orchestrator write path (5.10.5 item 3).
4. Failure: `YMIR_MEMORY_CONSOLIDATION_FAILED`, retryable.

**W24: Egress -> Client (stream_deliver)**

1. SSE over POST per Section 4.7.
2. Frame ordering invariant: `ack -> (delta | tool_* | memory_* | heartbeat)* -> (final | error)`.
3. Heartbeat every 15 seconds if no traffic.
4. Client reconnect with `Last-Event-ID`; 60-second resumable buffer.
5. Client stream close = cancellation signal back to orchestrator.

**W25: Ingress -> Orchestrator (callback_resume)**

1. Async tool completion arrives as `message_kind=tool_callback` with `tool_callback_result` part.
2. Orchestrator validates callback_token (single-use, expiry, ownership) per 5.3.8.
3. Resumes parent task at Site 2 or Site 6 merge boundary.
4. Failure: invalid token returns `CALLBACK_TOKEN_MISMATCH`. Terminal task returns `CALLBACK_TASK_TERMINAL`.

**W26: Self-Evaluation -> Tool Bus (verification_dispatch)**

1. Only in `evaluation.mode=full`.
2. Dispatches read-only verification calls through standard Tool Bus (W9 path).
3. Capped by `evaluation.max_verification_calls_per_iteration` (default 3).
4. Failure: tool check failure marks objective `failed`, does not block loop.

**W27: Self-Evaluation -> Context Assembly (hint_inject)**

1. When verdict is `stuck` or `progress` with unmet objectives, evaluation produces `evaluation_hint` chunk.
2. Chunk is injected into next iteration's context by Context Assembly.
3. Ranked above lowest-priority memory but below critical verified facts in budget trim order.

**W28/W29: Skuld <-> Workers (control plane)**

1. Uses mailbox transport in distributed mode; in-memory channels in monolith (same envelope shape).
2. Envelope conforms to `schemas/v1/mailbox_envelope.schema.json`.
3. Topics are closed set per 11.12.7; unknown topics fail with `MAILBOX_UNKNOWN_TOPIC`.
4. Delivery: at-least-once with receiver dedup.
5. Failure: exhausted retries route to DLQ per 11.12.6.

**W30: Context Assembly -> Self-Evaluation (criteria_derive)**

1. Intent Resolver (Context Assembly stage 1) derives `SuccessCriteria` when no explicit criteria in ingress and `evaluation.auto_derive_criteria=true`.
2. Derived objectives are matched against known tool capabilities from tool discovery (W5).
3. Criteria are attached to task state before first model call.
4. Failure: `EVALUATION_CRITERIA_RESOLUTION_FAILED`; falls back to `source=default` (model_self_assessed).

#### 5.13.3 Data Flow Invariants

1. **Trace continuity**: `trace_id` and `request_id` MUST be preserved across every crossing. No crossing may generate a new `trace_id` for the same task.
2. **Tenant isolation**: every crossing that carries data MUST include `tenant_id`. No crossing may mix data from different tenants.
3. **Schema enforcement**: every crossing MUST validate envelope against the referenced schema at the receiving boundary (defense-in-depth).
4. **Provenance chain**: any data that enters the model context MUST carry provenance metadata. Crossings W3, W4, W5, W21, and W27 produce chunks that require provenance.
5. **Durable before ACK**: crossings W1 (admission), W9 (side-effecting dispatch), W16 (egress enqueue), W18/W19 (checkpoint/terminal), and W20/W21 (observation persist/promote) MUST be durable before the sender considers the crossing complete.
6. **Fail-open isolation**: crossings W4 (domain snapshot), W5 (tool discover fallback), W17 (observer hook), W20 (observation WAL), and W26 (evaluation verification) are fail-open. Their failure MUST NOT block the core loop.
7. **Fail-closed criticality**: crossings W1 (admission validation), W2 (context build core stages), W3 (recent turns), W7 (all fallbacks exhausted), W9 (side-effect journaling), W18/W19 (WAL writes) are fail-closed. Their failure MUST terminate or abort the current operation.
8. **Idempotency at boundaries**: crossings W1 (ingress dedup), W9 (tool idempotency_key), W22 (YMIR idempotency), and W25 (callback token single-use) enforce idempotency. Callers MUST supply idempotency keys; receivers MUST honor them.
9. **No back-channel**: subsystems MUST NOT communicate outside the crossings defined in this table. No shared mutable state, no direct function calls between subsystems, no implicit coupling.

#### 5.13.4 Iteration Crossing Sequence (normative)

One complete loop iteration traverses crossings in this order:

```text
[Iteration Start]
  W2  -> Context Assembly
    W6  -> Pack Store (load rules)
    W3  -> Memory Fabric (retrieve)
    W4  -> Memory Fabric (domain snapshot)
    W5  -> Tool Registry (discover)
    W30 -> Self-Evaluation (derive criteria, first iteration only)
  W7  -> Model Runtime (call model)
  [Parse model response]
  if tool_calls:
    W8  -> Tool Registry (permission lookup per call)
    W9  -> Tool Execution (dispatch per call)
    W11 -> Tool Bus (Site 3 verification, if applicable)
    W12 -> Model Runtime (Site 4 critic, if policy-enabled)
    W13 -> Context Assembly (Site 5 compaction signal, if threshold met)
    W14 -> Orchestrator (Site 6 child spawn, if swarm call)
  W15 -> Self-Evaluation (evaluation run)
  W26 -> Tool Bus (verification dispatch, if full mode + tool_check objectives)
  W27 -> Context Assembly (hint inject, if stuck/progress)
  W16 -> Egress (output emit, if finalize/progress)
  W17 -> Observer (async hook, if enabled)
  W18 -> Memory WAL (checkpoint, if suspending)
  W19 -> Memory WAL (terminal, if terminating)
[Iteration End -> loop decision: iterate | finalize | fail | cancel | expire]
```

#### 5.13.5 Conformance Vectors

1. `conformance/v1/wiring/admission_trace_continuity/` — verify trace_id/request_id survive W1 through W19
2. `conformance/v1/wiring/tenant_isolation_crossing/` — verify no crossing leaks cross-tenant data
3. `conformance/v1/wiring/fail_open_isolation/` — verify fail-open crossings do not block core loop
4. `conformance/v1/wiring/fail_closed_abort/` — verify fail-closed crossings abort correctly
5. `conformance/v1/wiring/idempotency_boundaries/` — verify idempotency enforcement at W1/W9/W22/W25
6. `conformance/v1/wiring/iteration_sequence/` — verify crossing sequence matches 5.13.4

## 6. Syntax and Naming Standards (uniformity layer)

1. JSON keys: `snake_case`.
2. Event/action names: `dot.case` (`tool.action.completed`).
3. IDs: prefixed opaque strings (`req_`, `evt_`, `trc_`, `plg_`).
4. Timestamps: RFC3339 UTC only.
5. Durations: integer milliseconds (`*_ms`).
6. Booleans: never use string booleans.
7. Enums: lowercase snake_case.
8. Schema evolution: additive-first; breaking changes require major version.
9. IDs MUST be prefixed ULID matching `^<prefix>_[0-9A-HJKMNP-TV-Z]{26}$`; prefix registry is canonical in Section `5.5.4`.

## 7. Error Taxonomy (V1 baseline)

1. `AUTH_*` authentication failures
2. `PERMISSION_*` authorization failures
3. `VALIDATION_*` schema/input failures
4. `RATE_LIMIT_*` throttling failures
5. `TIMEOUT_*` timeouts
6. `DEPENDENCY_*` downstream provider/plugin failures
7. `INTERNAL_*` unexpected core failures
8. `EGRESS_*` outbound delivery/runtime failures
9. `YMIR_*` background-runtime failures
10. `OBSERVER_*` observation-pipeline failures
11. `REFLECTION_*` reflection-pipeline outcomes/failures
12. `MAILBOX_*` control-plane messaging failures

Each error code MUST define:

1. `retryable` boolean
2. recommended `retry_after_ms`
3. severity: `info|warn|error|critical`

Ingress validation codes for V1:

1. `VALIDATION_SCHEMA`
2. `VALIDATION_SCHEMA_VERSION_UNSUPPORTED`
3. `VALIDATION_UNKNOWN_FIELD`
4. `VALIDATION_FIELD_PATTERN`
5. `VALIDATION_UNSUPPORTED_PART_TYPE`
6. `VALIDATION_UNSUPPORTED_MIME_TYPE`
7. `VALIDATION_MIME_TYPE_MISMATCH`
8. `VALIDATION_MISSING_REQUIRED_FIELD`
9. `VALIDATION_FIELD_TOO_LONG`
10. `VALIDATION_EMPTY_MESSAGE`
11. `VALIDATION_EMPTY_TEXT_PART`
12. `VALIDATION_TOO_MANY_PARTS`
13. `VALIDATION_PAYLOAD_TOO_LARGE`
14. `VALIDATION_LIMIT_EXCEEDED`
15. `VALIDATION_MISSING_STORAGE_REF`
16. `VALIDATION_STORAGE_REF_FORMAT`
17. `VALIDATION_STORAGE_REF_NOT_FOUND`
18. `VALIDATION_STORAGE_REF_OWNERSHIP`
19. `VALIDATION_STORAGE_REF_CHECKSUM`
20. `VALIDATION_STORAGE_REF_EXPIRED`
21. `VALIDATION_UPLOAD_SIZE_DECLARED_MISMATCH`
22. `VALIDATION_DUPLICATE_MESSAGE_ID`
23. `VALIDATION_IDEMPOTENCY_KEY_REUSED`
24. `VALIDATION_IDEMPOTENCY_BODY_MISMATCH`
25. `VALIDATION_CLOCK_SKEW`
26. `VALIDATION_PRINCIPAL_NOT_ALLOWED`
27. `VALIDATION_MISSING_ON_BEHALF_OF`
28. `VALIDATION_FORBIDDEN_ON_BEHALF_OF`
29. `VALIDATION_PARENT_REQUEST_NOT_FOUND`
30. `VALIDATION_PARENT_REQUEST_OWNERSHIP`
31. `VALIDATION_MISSING_EXTERNAL_EVENT_ID`
32. `VALIDATION_MISSING_TRIGGERING_CAUSE`
33. `VALIDATION_MISSING_ADMIN_FIELDS`
34. `VALIDATION_TOO_MANY_VIOLATIONS`
35. `VALIDATION_FAILED` (umbrella)

Tool execution error codes (V1):

1. `VALIDATION_ERROR`
2. `PERMISSION_DENIED`
3. `TIMEOUT`
4. `RESOURCE_NOT_FOUND`
5. `EXTERNAL_SERVICE_ERROR`
6. `INTERNAL_EXECUTION_ERROR`
7. `IDEMPOTENCY_VIOLATION`
8. `EXECUTION_SERVICE_UNAVAILABLE`
9. `CANCELLED`
10. `CALLBACK_TOKEN_REUSED`
11. `CALLBACK_TOKEN_MISMATCH`
12. `TOOL_VERSION_NOT_FOUND`
13. `TOOL_VERSION_SUNSET`
14. `SECRET_NOT_AVAILABLE`
15. `OUTPUT_SCHEMA_VIOLATION`
16. `VALIDATION_RESULT_TOO_LARGE`
17. `CALLBACK_TASK_TERMINAL`
18. `CALLBACK_TASK_NOT_WAITING`
19. `CHECKPOINT_CONTEXT_LOST`

Ingress error classification defaults:

1. All `VALIDATION_*` errors above default to `retryable=false`.
2. All `VALIDATION_*` errors above default to severity `error`.
3. `RATE_LIMIT_UPLOAD_SLOTS_EXHAUSTED` defaults to `retryable=true` with `Retry-After` header and `retry_after_ms`.

Rate limit codes (V1):

1. `RATE_LIMIT_UPLOAD_SLOTS_EXHAUSTED`

Stream error codes (V1):

1. `STREAM_CANCELLED`
2. `STREAM_RESUME_EXPIRED`
3. `STREAM_HEARTBEAT_TIMEOUT`
4. `STREAM_FRAME_SCHEMA`

Stream error defaults:

1. `STREAM_CANCELLED`: `retryable=false`, severity `warn`.
2. `STREAM_RESUME_EXPIRED`: `retryable=false`, severity `error`.
3. `STREAM_HEARTBEAT_TIMEOUT`: `retryable=true`, severity `warn`.
4. `STREAM_FRAME_SCHEMA`: `retryable=false`, severity `critical`.

Egress error codes (V1):

1. `EGRESS_QUEUE_FULL`
2. `EGRESS_CHANNEL_UNAVAILABLE`
3. `EGRESS_TEMPLATE_RENDER_FAILED`
4. `EGRESS_DELIVERY_FAILED`
5. `EGRESS_RATE_LIMITED`

Egress error defaults:

1. `EGRESS_QUEUE_FULL`: `retryable=true`, severity `warn`.
2. `EGRESS_CHANNEL_UNAVAILABLE`: `retryable=true`, severity `error`.
3. `EGRESS_TEMPLATE_RENDER_FAILED`: `retryable=false`, severity `error`.
4. `EGRESS_DELIVERY_FAILED`: `retryable=true`, severity `error`.
5. `EGRESS_RATE_LIMITED`: `retryable=true`, severity `warn`.

YMIR error codes (V1):

1. `YMIR_TRIGGER_INVALID`
2. `YMIR_TENANT_SCOPE_VIOLATION`
3. `YMIR_POLICY_BLOCKED`
4. `YMIR_JOB_BUDGET_EXCEEDED`
5. `YMIR_MEMORY_CONSOLIDATION_FAILED`
6. `YMIR_PROACTIVE_TASK_CREATION_FAILED`
7. `YMIR_TASK_ENQUEUE_FAILED`

YMIR error defaults:

1. `YMIR_TRIGGER_INVALID`: `retryable=false`, severity `error`.
2. `YMIR_TENANT_SCOPE_VIOLATION`: `retryable=false`, severity `critical`.
3. `YMIR_POLICY_BLOCKED`: `retryable=false`, severity `warn`.
4. `YMIR_JOB_BUDGET_EXCEEDED`: `retryable=true`, severity `warn`.
5. `YMIR_MEMORY_CONSOLIDATION_FAILED`: `retryable=true`, severity `error`.
6. `YMIR_PROACTIVE_TASK_CREATION_FAILED`: `retryable=true`, severity `error`.
7. `YMIR_TASK_ENQUEUE_FAILED`: `retryable=true`, severity `error`.

Observer error codes (V1):

1. `OBSERVER_BUFFER_OVERFLOW`
2. `OBSERVER_PARSE_FAILED`
3. `OBSERVER_MODEL_UNAVAILABLE`
4. `OBSERVER_TENANT_SCOPE_VIOLATION`
5. `OBSERVER_CIRCUIT_OPEN`
6. `OBSERVATION_WAL_UNAVAILABLE`
7. `OBSERVATION_WAL_SEGMENT_CORRUPT`

Observer error defaults:

1. `OBSERVER_BUFFER_OVERFLOW`: `retryable=true`, severity `warn`.
2. `OBSERVER_PARSE_FAILED`: `retryable=false`, severity `warn`.
3. `OBSERVER_MODEL_UNAVAILABLE`: `retryable=true`, severity `error`.
4. `OBSERVER_TENANT_SCOPE_VIOLATION`: `retryable=false`, severity `critical`.
5. `OBSERVER_CIRCUIT_OPEN`: `retryable=true`, severity `warn`.
6. `OBSERVATION_WAL_UNAVAILABLE`: `retryable=true`, severity `error`.
7. `OBSERVATION_WAL_SEGMENT_CORRUPT`: `retryable=false`, severity `critical`.

Reflection error codes (V1):

1. `REFLECTION_PROMOTION_CONFLICT`
2. `REFLECTION_TRIGGER_DEDUPED`

Reflection error defaults:

1. `REFLECTION_PROMOTION_CONFLICT`: `retryable=true`, severity `error`.
2. `REFLECTION_TRIGGER_DEDUPED`: `retryable=false`, severity `info`.

Self-Evaluation error codes (V1):

1. `EVALUATION_CRITERIA_INVALID`
2. `EVALUATION_VERIFICATION_FAILED`
3. `EVALUATION_BUDGET_EXCEEDED`
4. `EVALUATION_CRITERIA_RESOLUTION_FAILED`

Self-Evaluation error defaults:

1. `EVALUATION_CRITERIA_INVALID`: `retryable=false`, severity `error`.
2. `EVALUATION_VERIFICATION_FAILED`: `retryable=false`, severity `warn`.
3. `EVALUATION_BUDGET_EXCEEDED`: `retryable=false`, severity `warn`.
4. `EVALUATION_CRITERIA_RESOLUTION_FAILED`: `retryable=false`, severity `warn`.

Runtime mode error codes (V1):

1. `CLUSTER_BELOW_QUORUM`
2. `SERVICE_DEGRADED_READONLY`
3. `PLACEMENT_NO_CANDIDATE`
4. `MODE_TRANSITION_IN_PROGRESS`
5. `WAL_SEQ_REGRESSION_DETECTED`
6. `CONFIG_RUNTIME_MODE_REQUIRED`
7. `RUNTIME_MODE_TOPOLOGY_MISMATCH`
8. `RUNTIME_MODE_CHANGE_FORBIDDEN`
9. `MAILBOX_UNKNOWN_TOPIC`
10. `MAILBOX_ENVELOPE_INVALID`
11. `MAILBOX_MESSAGE_EXPIRED`
12. `MAILBOX_DEAD_LETTERED`
13. `MAILBOX_DLQ_NOT_FOUND`
14. `MAILBOX_OUTBOX_FULL`

Runtime mode error defaults:

1. `CLUSTER_BELOW_QUORUM`: `retryable=true`, severity `error`.
2. `SERVICE_DEGRADED_READONLY`: `retryable=true`, severity `warn`.
3. `PLACEMENT_NO_CANDIDATE`: `retryable=true`, severity `error`.
4. `MODE_TRANSITION_IN_PROGRESS`: `retryable=true`, severity `warn`.
5. `WAL_SEQ_REGRESSION_DETECTED`: `retryable=false`, severity `critical`.
6. `CONFIG_RUNTIME_MODE_REQUIRED`: `retryable=false`, severity `critical`.
7. `RUNTIME_MODE_TOPOLOGY_MISMATCH`: `retryable=false`, severity `critical`.
8. `RUNTIME_MODE_CHANGE_FORBIDDEN`: `retryable=false`, severity `error`.
9. `MAILBOX_UNKNOWN_TOPIC`: `retryable=false`, severity `error`.
10. `MAILBOX_ENVELOPE_INVALID`: `retryable=false`, severity `error`.
11. `MAILBOX_MESSAGE_EXPIRED`: `retryable=false`, severity `warn`.
12. `MAILBOX_DEAD_LETTERED`: `retryable=true`, severity `critical`.
13. `MAILBOX_DLQ_NOT_FOUND`: `retryable=false`, severity `error`.
14. `MAILBOX_OUTBOX_FULL`: `retryable=true`, severity `warn`.

Model runtime error codes (V1):

1. `PROVIDER_UNAVAILABLE`
2. `PROVIDER_RATE_LIMITED`
3. `PROVIDER_CONTEXT_OVERFLOW`
4. `PROVIDER_FILTERED`
5. `MODEL_REF_NOT_FOUND`
6. `MODEL_ROUTING_POLICY_MISSING`

Orchestrator loop reason/error codes (V1):

1. `LOOP_MAX_ITERATIONS`
2. `LOOP_MAX_TOOL_CALLS`
3. `TASK_DEADLINE_EXCEEDED`
4. `LOOP_NO_PROGRESS`
5. `MODEL_OUTPUT_AMBIGUOUS`
6. `ITERATION_DEADLINE_EXCEEDED`
7. `DRAIN_TIMEOUT`
8. `ORCHESTRATOR_ADMISSION_FULL`
9. `CHECKPOINT_STORAGE_QUOTA_EXCEEDED`

Ingress operational error codes (V1):

1. `RATE_LIMIT_EXCEEDED`
2. `INGRESS_ADMISSION_QUEUE_FULL`
3. `INGRESS_SHUTTING_DOWN`

Ingress operational error defaults:

1. `RATE_LIMIT_EXCEEDED`: `retryable=true`, severity `warn`.
2. `INGRESS_ADMISSION_QUEUE_FULL`: `retryable=true`, severity `warn`.
3. `INGRESS_SHUTTING_DOWN`: `retryable=true`, severity `warn`.

Memory Fabric error codes (V1):

1. `MEMORY_STORAGE_QUOTA_EXCEEDED`
2. `MEMORY_GRAPH_LIMIT_EXCEEDED`

Memory Fabric error defaults:

1. `MEMORY_STORAGE_QUOTA_EXCEEDED`: `retryable=false`, severity `error`.
2. `MEMORY_GRAPH_LIMIT_EXCEEDED`: `retryable=false`, severity `error`.

Canonical transport status mapping:

| Code/Family | HTTP | gRPC |
|---|---:|---|
| `VALIDATION_SCHEMA` | 400 | `INVALID_ARGUMENT` |
| `VALIDATION_SCHEMA_VERSION_UNSUPPORTED` | 400 | `UNIMPLEMENTED` |
| `VALIDATION_FAILED` and semantic `VALIDATION_*` defaults | 422 | `INVALID_ARGUMENT` |
| `VALIDATION_PAYLOAD_TOO_LARGE` | 413 | `RESOURCE_EXHAUSTED` |
| `VALIDATION_UNSUPPORTED_MIME_TYPE` | 415 | `INVALID_ARGUMENT` |
| `VALIDATION_STORAGE_REF_NOT_FOUND` | 404 | `NOT_FOUND` |
| `VALIDATION_STORAGE_REF_OWNERSHIP` | 404 | `NOT_FOUND` |
| `VALIDATION_PARENT_REQUEST_NOT_FOUND` | 404 | `NOT_FOUND` |
| `VALIDATION_PARENT_REQUEST_OWNERSHIP` | 404 | `NOT_FOUND` |
| `VALIDATION_STORAGE_REF_EXPIRED` | 410 | `FAILED_PRECONDITION` |
| `VALIDATION_DUPLICATE_MESSAGE_ID` | 409 | `ALREADY_EXISTS` |
| `VALIDATION_IDEMPOTENCY_KEY_REUSED` | 409 | `ALREADY_EXISTS` |
| `VALIDATION_IDEMPOTENCY_BODY_MISMATCH` | 409 | `ALREADY_EXISTS` |
| `VALIDATION_RESULT_TOO_LARGE` | 413 | `RESOURCE_EXHAUSTED` |
| `MODEL_OUTPUT_AMBIGUOUS` | 422 | `INVALID_ARGUMENT` |
| `CALLBACK_TASK_TERMINAL` | 409 | `ALREADY_EXISTS` |
| `CALLBACK_TASK_NOT_WAITING` | 409 | `FAILED_PRECONDITION` |
| `CHECKPOINT_CONTEXT_LOST` | 500 | `INTERNAL` |
| `ITERATION_DEADLINE_EXCEEDED` | 504 | `DEADLINE_EXCEEDED` |
| `VALIDATION_ERROR` | 422 | `INVALID_ARGUMENT` |
| `PERMISSION_DENIED` | 403 | `PERMISSION_DENIED` |
| `TIMEOUT` | 504 | `DEADLINE_EXCEEDED` |
| `RESOURCE_NOT_FOUND` | 404 | `NOT_FOUND` |
| `EXTERNAL_SERVICE_ERROR` | 502 | `UNAVAILABLE` |
| `INTERNAL_EXECUTION_ERROR` | 500 | `INTERNAL` |
| `IDEMPOTENCY_VIOLATION` | 409 | `ALREADY_EXISTS` |
| `EXECUTION_SERVICE_UNAVAILABLE` | 503 | `UNAVAILABLE` |
| `CANCELLED` | 499 | `CANCELLED` |
| `CALLBACK_TOKEN_REUSED` | 409 | `ALREADY_EXISTS` |
| `CALLBACK_TOKEN_MISMATCH` | 401 | `UNAUTHENTICATED` |
| `TOOL_VERSION_NOT_FOUND` | 404 | `NOT_FOUND` |
| `TOOL_VERSION_SUNSET` | 410 | `FAILED_PRECONDITION` |
| `SECRET_NOT_AVAILABLE` | 424 | `FAILED_PRECONDITION` |
| `OUTPUT_SCHEMA_VIOLATION` | 500 | `INTERNAL` |
| `AUTH_*` | 401 | `UNAUTHENTICATED` |
| `PERMISSION_*` / `VALIDATION_PRINCIPAL_NOT_ALLOWED` | 403 | `PERMISSION_DENIED` |
| `RATE_LIMIT_*` | 429 | `RESOURCE_EXHAUSTED` |
| `TIMEOUT_*` | 504 | `DEADLINE_EXCEEDED` |
| `DEPENDENCY_*` | 502 | `UNAVAILABLE` |
| `INTERNAL_*` | 500 | `INTERNAL` |
| `STREAM_RESUME_EXPIRED` | 410 | `FAILED_PRECONDITION` |
| `STREAM_CANCELLED` | 499 (or telemetry-only) | `CANCELLED` |
| `EGRESS_QUEUE_FULL` | 503 | `UNAVAILABLE` |
| `EGRESS_CHANNEL_UNAVAILABLE` | 503 | `UNAVAILABLE` |
| `EGRESS_TEMPLATE_RENDER_FAILED` | 500 | `INTERNAL` |
| `EGRESS_DELIVERY_FAILED` | 502 | `UNAVAILABLE` |
| `EGRESS_RATE_LIMITED` | 429 | `RESOURCE_EXHAUSTED` |
| `YMIR_TRIGGER_INVALID` | 422 | `INVALID_ARGUMENT` |
| `YMIR_TENANT_SCOPE_VIOLATION` | 403 | `PERMISSION_DENIED` |
| `YMIR_POLICY_BLOCKED` | 403 | `PERMISSION_DENIED` |
| `YMIR_JOB_BUDGET_EXCEEDED` | 429 | `RESOURCE_EXHAUSTED` |
| `YMIR_MEMORY_CONSOLIDATION_FAILED` | 500 | `INTERNAL` |
| `YMIR_PROACTIVE_TASK_CREATION_FAILED` | 500 | `INTERNAL` |
| `YMIR_TASK_ENQUEUE_FAILED` | 503 | `UNAVAILABLE` |
| `OBSERVER_BUFFER_OVERFLOW` | 429 | `RESOURCE_EXHAUSTED` |
| `OBSERVER_PARSE_FAILED` | 422 | `INVALID_ARGUMENT` |
| `OBSERVER_MODEL_UNAVAILABLE` | 503 | `UNAVAILABLE` |
| `OBSERVER_TENANT_SCOPE_VIOLATION` | 403 | `PERMISSION_DENIED` |
| `OBSERVER_CIRCUIT_OPEN` | 503 | `UNAVAILABLE` |
| `OBSERVATION_WAL_UNAVAILABLE` | 503 | `UNAVAILABLE` |
| `OBSERVATION_WAL_SEGMENT_CORRUPT` | 500 | `INTERNAL` |
| `REFLECTION_PROMOTION_CONFLICT` | 409 | `ALREADY_EXISTS` |
| `REFLECTION_TRIGGER_DEDUPED` | 200 (telemetry/info) | `OK` |
| `PROVIDER_UNAVAILABLE` | 503 | `UNAVAILABLE` |
| `PROVIDER_RATE_LIMITED` | 429 | `RESOURCE_EXHAUSTED` |
| `PROVIDER_CONTEXT_OVERFLOW` | 422 | `INVALID_ARGUMENT` |
| `PROVIDER_FILTERED` | 422 | `FAILED_PRECONDITION` |
| `MODEL_REF_NOT_FOUND` | 404 | `NOT_FOUND` |
| `MODEL_ROUTING_POLICY_MISSING` | 500 | `INTERNAL` |
| `CLUSTER_BELOW_QUORUM` | 503 | `UNAVAILABLE` |
| `SERVICE_DEGRADED_READONLY` | 503 | `UNAVAILABLE` |
| `PLACEMENT_NO_CANDIDATE` | 503 | `UNAVAILABLE` |
| `MODE_TRANSITION_IN_PROGRESS` | 503 | `UNAVAILABLE` |
| `WAL_SEQ_REGRESSION_DETECTED` | 500 | `INTERNAL` |
| `CONFIG_RUNTIME_MODE_REQUIRED` | 500 | `FAILED_PRECONDITION` |
| `RUNTIME_MODE_TOPOLOGY_MISMATCH` | 500 | `FAILED_PRECONDITION` |
| `RUNTIME_MODE_CHANGE_FORBIDDEN` | 400 | `FAILED_PRECONDITION` |
| `MAILBOX_UNKNOWN_TOPIC` | 400 | `INVALID_ARGUMENT` |
| `MAILBOX_ENVELOPE_INVALID` | 400 | `INVALID_ARGUMENT` |
| `MAILBOX_MESSAGE_EXPIRED` | 410 | `FAILED_PRECONDITION` |
| `MAILBOX_DEAD_LETTERED` | 500 | `INTERNAL` |
| `MAILBOX_DLQ_NOT_FOUND` | 404 | `NOT_FOUND` |
| `MAILBOX_OUTBOX_FULL` | 429 | `RESOURCE_EXHAUSTED` |
| `DRAIN_TIMEOUT` | 500 | `INTERNAL` |
| `ORCHESTRATOR_ADMISSION_FULL` | 503 | `UNAVAILABLE` |
| `CHECKPOINT_STORAGE_QUOTA_EXCEEDED` | 507 | `RESOURCE_EXHAUSTED` |
| `RATE_LIMIT_EXCEEDED` | 429 | `RESOURCE_EXHAUSTED` |
| `INGRESS_ADMISSION_QUEUE_FULL` | 503 | `UNAVAILABLE` |
| `INGRESS_SHUTTING_DOWN` | 503 | `UNAVAILABLE` |
| `MEMORY_STORAGE_QUOTA_EXCEEDED` | 507 | `RESOURCE_EXHAUSTED` |
| `MEMORY_GRAPH_LIMIT_EXCEEDED` | 422 | `RESOURCE_EXHAUSTED` |
| `EVALUATION_CRITERIA_INVALID` | 422 | `INVALID_ARGUMENT` |
| `EVALUATION_VERIFICATION_FAILED` | 500 | `INTERNAL` |
| `EVALUATION_BUDGET_EXCEEDED` | 429 | `RESOURCE_EXHAUSTED` |
| `EVALUATION_CRITERIA_RESOLUTION_FAILED` | 500 | `INTERNAL` |

Status mapping rules:

1. `VALIDATION_STORAGE_REF_NOT_FOUND` and `VALIDATION_STORAGE_REF_OWNERSHIP` MUST be response-collapsed to avoid resource probing.
2. `VALIDATION_PARENT_REQUEST_NOT_FOUND` and `VALIDATION_PARENT_REQUEST_OWNERSHIP` MUST be response-collapsed similarly.
3. `429` responses MUST include both `Retry-After` header and `retry_after_ms` in JSON envelope.
4. HTTP adapters MUST NOT invent out-of-map statuses for known codes.

## 8. Versioning and Deprecation Rules

1. Protocol follows SemVer.
2. Core MUST support at least two minor versions concurrently.
3. Deprecation window: minimum 90 days before removal.
4. Manifest MUST declare supported core range.
5. Core SHOULD expose `GET /v1/version` with `protocol`, `current`, `supported_range`, `deprecated_versions`, `deprecation_sunset`.
6. Requests accepted under deprecated versions SHOULD include `Ygg-Deprecation` response header with sunset date and migration link.

## 9. Security Baseline

1. Signed manifests and tamper checks.
2. mTLS or OAuth2 for remote adapters.
3. Secret references only; no plaintext secrets in manifests.
4. Audit log immutability policy (append-only sink).
5. Optional tenant isolation policy for enterprise mode.

Normative security controls are defined in subsystem sections:

| Concern | Normative section |
|---|---|
| Envelope encryption, KMS, KEK/DEK, cryptoshred | `5.5.7` |
| Secret references in tool calls | `5.3.12` |
| Token redaction and ingress auth matrix | `4.6` and `4.6.15` |
| Manifest signing | `4.1` |
| Context Pack signing | `5.8.3` |
| Audit immutability | `9` |

## 10. Machine-Readable Schemas and Conformance (pre-build gate)

### 10.1 Schema Freeze Policy

1. Canonical schema standard is JSON Schema Draft 2020-12.
2. Schemas MUST live under `schemas/v1/`.
3. Each major protocol version gets its own directory (`/v1`, `/v2`).
4. Minor/patch schema updates stay within the same major path.
5. Schemas SHOULD declare `$schema`, `$id`, and `schema_version`.
6. Schemas SHOULD use `additionalProperties: false` at trust boundaries (`auth`, `parts[*]`, stream frames).
7. Official SDK validator engines/versions MUST be pinned in CI to avoid draft-feature drift.

Required schema files for V1:

1. `schemas/v1/ingress_message.schema.json`
2. `schemas/v1/task_request.schema.json`
3. `schemas/v1/upload_request.schema.json`
4. `schemas/v1/error_envelope.schema.json`
5. `schemas/v1/stream_frame.schema.json`
6. `schemas/v1/parsed_model_response.schema.json`
7. `schemas/v1/core_loop_context_bundle.schema.json`
8. `schemas/v1/context_package.schema.json`
9. `schemas/v1/context_pack.schema.json`
10. `schemas/v1/output_envelope.schema.json`
11. `schemas/v1/ymir_wake_event.schema.json`
12. `schemas/v1/snapshot_meta.schema.json`
13. `schemas/v1/wal_record.schema.json`
14. `schemas/v1/tool_call_request.schema.json`
15. `schemas/v1/tool_call_response.schema.json`
16. `schemas/v1/tool_registry_entry.schema.json`
17. `schemas/v1/checkpoint_envelope.schema.json`
18. `schemas/v1/manifest.schema.json`
19. `schemas/v1/handshake.schema.json`
20. `schemas/v1/model_request.schema.json`
21. `schemas/v1/model_response.schema.json`
22. `schemas/v1/domain_snapshot.schema.json`
23. `schemas/v1/runtime_topology.schema.json`
24. `schemas/v1/observation.schema.json`
25. `schemas/v1/observation_buffer.schema.json`
26. `schemas/v1/reflection_run.schema.json`
27. `schemas/v1/reflection_trigger.schema.json`
28. `schemas/v1/observation_wal_record.schema.json`
29. `schemas/v1/runtime_config.schema.json`
30. `schemas/v1/placement_decision.schema.json`
31. `schemas/v1/mailbox_envelope.schema.json`
32. `schemas/v1/mailbox/skuld_placement_update.schema.json`
33. `schemas/v1/mailbox/skuld_leader_elected.schema.json`
34. `schemas/v1/mailbox/worker_heartbeat.schema.json`
35. `schemas/v1/mailbox/worker_load_report.schema.json`
36. `schemas/v1/mailbox/ymir_wake_dispatch.schema.json`
37. `schemas/v1/success_criteria.schema.json`
38. `schemas/v1/evaluation_verdict.schema.json`
39. `schemas/v1/evaluation_hint.schema.json`
40. `schemas/v1/evaluation_summary.schema.json`

Schema evolution rules:

1. Any PR changing a schema file MUST include updated conformance vectors.
2. Schema change without matching conformance updates MUST fail CI.
3. Major-breaking schema changes require new `/schemas/v2/` path.

### 10.2 Conformance Vector Contract

Vectors are the executable protocol truth and MUST be shared across all SDK validators.

Locked vector root:

1. `conformance/v1/accept/`
2. `conformance/v1/reject/validation/`
3. `conformance/v1/reject/auth/`
4. `conformance/v1/reject/version/`
5. `conformance/v1/replay/`
6. `conformance/v1/storage/`
7. `conformance/v1/upload/`
8. `conformance/v1/stream/`
9. `conformance/v1/context_assembly/accept/`
10. `conformance/v1/context_assembly/degraded/`
11. `conformance/v1/context_assembly/reject/`
12. `conformance/v1/context_assembly/replay/`
13. `conformance/v1/egress/accept/`
14. `conformance/v1/egress/failure/`
15. `conformance/v1/ymir/accept/`
16. `conformance/v1/ymir/degraded/`
17. `conformance/v1/ymir/reject/`
18. `conformance/v1/ymir/replay/`
19. `conformance/v1/runtime/monolith/startup/`
20. `conformance/v1/runtime/monolith/recovery/`
21. `conformance/v1/runtime/distributed/startup/`
22. `conformance/v1/runtime/distributed/failover/`
23. `conformance/v1/runtime/distributed/below_quorum/`
24. `conformance/v1/runtime/distributed/stale_metadata/`
25. `conformance/v1/runtime/transition/monolith_to_distributed/`
26. `conformance/v1/valkyrie/observer/accept/`
27. `conformance/v1/valkyrie/observer/degraded/`
28. `conformance/v1/valkyrie/observer/reject/`
29. `conformance/v1/valkyrie/observer/replay/`
30. `conformance/v1/valkyrie/reflection/accept/`
31. `conformance/v1/valkyrie/reflection/degraded/`
32. `conformance/v1/valkyrie/reflection/reject/`
33. `conformance/v1/valkyrie/reflection/replay/`
34. `conformance/v1/runtime/mode_activation/`
35. `conformance/v1/placement/deterministic/`
36. `conformance/v1/placement/poisoned_load/`
37. `conformance/v1/mailbox/delivery/`
38. `conformance/v1/mailbox/retry/`
39. `conformance/v1/mailbox/dlq/`
40. `conformance/v1/mailbox/ordering/`
41. `conformance/v1/failure_detector/`
42. `conformance/v1/evaluation/criteria_resolution/`
43. `conformance/v1/evaluation/tool_check_verification/`
44. `conformance/v1/evaluation/progress_detection/`
45. `conformance/v1/evaluation/verdict_mapping/`
46. `conformance/v1/evaluation/checkpoint_persistence/`
47. `conformance/v1/evaluation/hint_injection/`
48. `conformance/v1/evaluation/tenant_policy/`
49. `conformance/v1/wiring/admission_trace_continuity/`
50. `conformance/v1/wiring/tenant_isolation_crossing/`
51. `conformance/v1/wiring/fail_open_isolation/`
52. `conformance/v1/wiring/fail_closed_abort/`
53. `conformance/v1/wiring/idempotency_boundaries/`
54. `conformance/v1/wiring/iteration_sequence/`

Locked vector file shape:

```json
{
  "id": "ingress_validation_field_too_long_user_id",
  "category": "reject/validation",
  "description": "user_id exceeding 128 chars must be rejected",
  "input": {
    "transport": "http",
    "method": "POST",
    "path": "/v1/messages",
    "headers": {
      "Content-Type": "application/json"
    },
    "body": {}
  },
  "expected": {
    "outcome": "rejected",
    "http_status": 422,
    "grpc_status": "INVALID_ARGUMENT",
    "error_code": "VALIDATION_FIELD_TOO_LONG",
    "violations": [
      {
        "field": "user_id",
        "code": "VALIDATION_FIELD_TOO_LONG",
        "rule": "max_length",
        "expected": 128
      }
    ]
  }
}
```

Coverage gate rules:

1. Every validation code in `error_envelope.schema.json` MUST have at least one positive reject vector.
2. Every conditional rule in `ingress_message.schema.json` MUST have both pass and fail vectors.
3. Every allowed and forbidden `principal_type x message_kind` matrix cell MUST have vectors.
4. Every HTTP status in canonical map MUST appear in at least one vector.
5. Replay and storage lifecycle scenarios MUST include multi-step vectors.
6. Every `EGRESS_*` code MUST have at least one egress failure vector under `conformance/v1/egress/failure/`.
7. Every `YMIR_*` code MUST have at least one vector under `conformance/v1/ymir/` (accept/degraded/reject/replay as applicable).
8. Runtime-mode invariants (`below_quorum`, `readonly_failover`, `wal_seq_no_regression`) MUST have vectors under `conformance/v1/runtime/`.
9. Every `OBSERVER_*` and `REFLECTION_*` code MUST have at least one vector under `conformance/v1/valkyrie/`.
10. Runtime mode activation errors MUST have vectors under `conformance/v1/runtime/mode_activation/`.
11. Placement determinism and poisoned-load behavior MUST have vectors under `conformance/v1/placement/`.
12. Mailbox delivery/retry/DLQ/ordering guarantees MUST have vectors under `conformance/v1/mailbox/`.
13. Failure detector state transitions MUST have vectors under `conformance/v1/failure_detector/`.
14. Integration wiring invariants (trace continuity, tenant isolation, fail-open/closed, idempotency, iteration sequence) MUST have vectors under `conformance/v1/wiring/`.

### 10.3 Multi-SDK Runner Requirement

1. Each SDK/runtime MUST ship a conformance runner consuming `conformance/v1/`.
2. CI MUST execute all runners against the same vector set.
3. Any mismatch between expected and actual behavior MUST fail CI.

### 10.4 Additional Test Gates

1. JSON schema validation tests.
2. Contract tests (happy path + failures).
3. Compatibility tests across version matrix.
4. Security tests (scope escalation, replay, tampering).
5. Soak tests for daemon and retries.

## 11. Runtime Modes (locked)

### 11.1 Modes

1. `monolith`: single binary, all subsystems in-process.
2. `distributed`: Skuld cluster plus Yggdrasil worker roles.
3. Both modes are first-class in V1.
4. External API contracts are identical across modes.

### 11.2 Runtime Mode Activation (locked)

1. Runtime mode is explicit and required: `runtime.mode = monolith | distributed`.
2. Implicit mode promotion/demotion is forbidden:
   1. reachable Skuld endpoint MUST NOT auto-enable distributed mode.
   2. missing Skuld endpoint MUST NOT auto-fallback to monolith mode.
   3. environment variables (for example `SKULD_ENDPOINT`, `CLUSTER_ID`) MUST NOT override `runtime.mode`.
3. Startup contract:
   1. if `runtime.mode` is absent, startup MUST fail with `CONFIG_RUNTIME_MODE_REQUIRED`.
   2. emit `runtime.mode.started` with `{mode, topology_fingerprint, node_id, role_set}`.
   3. validate observed topology against declared mode.
4. Topology validation rules:
   1. `monolith`: runtime MUST NOT initiate remote Skuld connection.
   2. attempted remote Skuld connection in monolith MUST fail startup with `RUNTIME_MODE_TOPOLOGY_MISMATCH`.
   3. `distributed`: Skuld connectivity MUST be established within `startup_skuld_bootstrap_timeout_ms = 15000`.
   4. failure to establish Skuld connectivity in distributed mode MUST fail startup with `RUNTIME_MODE_TOPOLOGY_MISMATCH`.
5. Runtime mode hot-change is forbidden except explicit migration path (`11.11`).
6. Runtime mode change attempt on live process MUST fail with `RUNTIME_MODE_CHANGE_FORBIDDEN`.
7. Role declaration key: `runtime.roles = [orchestrator, frontend, tool_exec, ymir, observer, model_runtime, skuld]`.
8. Role declaration validation:
   1. monolith MUST contain all required roles.
   2. distributed MUST contain at least one role.
   3. distributed colocation (multiple roles in one process) is allowed.
9. Runtime config schema is `schemas/v1/runtime_config.schema.json`.

### 11.3 Naming

1. Metadata/control-plane service canonical name is `Skuld`.
2. References to legacy `metasrv` naming in Yggdrasil runtime contracts are replaced by `Skuld`.

### 11.4 Subsystem Activation Matrix

| Subsystem | monolith | distributed |
|---|---|---|
| Skuld | embedded single-leader | cluster (`3` nodes production, `1` node alpha with `unsafe_single_leader=true`) |
| Orchestrator | in-process | worker role `orchestrator`, min `2` |
| Frontend (ingress/egress) | in-process | worker role `frontend`, min `2` |
| Tool Execution | in-process | worker role `tool_exec`, min `2` (MAY colocate with orchestrator) |
| Valkyrie Observer | in-process async pool | worker role `observer`, min `1` |
| Memory Fabric WAL | local fs + local blob | per-node WAL + shared object store |
| YMIR | in-process | worker role `ymir`, min `1` |
| Model Runtime | in-process | worker role `model_runtime`, min `1` |

### 11.5 Monolith Behavior

1. No remote leader election; single leader is implicit.
2. No remote mailbox transport; in-memory channels only with identical envelope shape.
3. Skuld embedded backend MUST be crash-safe.
4. Failure detector is disabled.
5. External API contracts remain identical to distributed mode; clients MUST NOT observe mode-specific protocol differences.

### 11.6 Distributed Minimum Topology

1. Skuld:
   1. production minimum `3` nodes
   2. alpha MAY run `1` node only with `unsafe_single_leader=true`
2. Orchestrator workers: minimum `2`.
3. Frontend workers: minimum `2`.
4. Tool execution workers: minimum `2` (MAY colocate with orchestrator).
5. Observer workers: minimum `1`.
6. YMIR workers: minimum `1`.
7. Model runtime workers: minimum `1`.
8. Required startup event when unsafe mode enabled: `runtime.unsafe_single_leader_enabled`.
9. Below-quorum Skuld MUST enter degraded mode and reject write-class operations with `CLUSTER_BELOW_QUORUM`.

### 11.7 Failure Detector (locked)

1. V1 uses fixed-timeout failure detection only.
2. Detector config:
   1. `heartbeat_interval_ms = 1000`
   2. `heartbeat_miss_threshold = 3`
   3. suspect threshold = `heartbeat_interval_ms * heartbeat_miss_threshold` (default `3000ms`)
   4. `suspect_grace_ms = 2000`
   5. down transition threshold = suspect threshold + suspect grace (default `5000ms`)
   6. `heartbeat_recovery_streak = 3`
3. Recovery requires `heartbeat_recovery_streak` consecutive successful heartbeats before `down -> alive`.
4. Monolith mode MUST disable detector.
5. Distributed mode MUST enable detector on all roles (`orchestrator`, `frontend`, `tool_exec`, `ymir`, `observer`, `model_runtime`, `skuld`).
6. Detector parameters are cluster-wide and MUST NOT have per-role overrides in V1.
7. Phi Accrual is deferred to V1.1 and MUST be opt-in by cluster-wide flag when introduced.
8. Mixed detector mode clusters (some fixed-timeout, some phi) are forbidden.
9. Detector events (required):
   1. `cluster.node.heartbeat_missed`
   2. `cluster.node.suspect`
   3. `cluster.node.down`
   4. `cluster.node.recovered`

### 11.8 Cache Invalidation and Stale Windows

1. Cluster metadata stale cap: `max_cluster_metadata_stale_ms = 10000`.
2. Tool registry metadata stale cap: `60000` for non-safety fields.
3. Tool safety fields (`enabled`, `risk_level`, `scopes`) stale cap: `10000`.
4. Context Pack metadata stale cap: `10000`.
5. Safety-field disable propagation MUST complete within the `10000ms` safety stale cap.
6. Cap breach MUST emit `cluster.metadata.stale_breach` and fail-closed on affected operation.

### 11.9 Placement Strategy (locked)

1. V1 locks exactly one strategy: `load_based`.
2. Alternative selectors (`round_robin`, `lease_based`, `affinity`, `rack-aware`) are deferred to V1.1.
3. Candidate score inputs:
   1. `active_task_count`
   2. `cpu_load_1m`
   3. `memory_used_ratio`
   4. `inflight_tool_calls`
   5. `role_capacity_remaining`
4. Score formula:
   `load_score = 0.40*cpu_load_1m + 0.25*memory_used_ratio + 0.20*(active_task_count / role_capacity) + 0.10*(inflight_tool_calls / max_inflight) + 0.05*(1 - role_capacity_remaining / role_capacity)`.
5. Lowest `load_score` wins.
6. Deterministic tie-break:
   1. scores within `epsilon = 0.001` are ties.
   2. tie winner = lexicographic ascending `node_id_ulid`.
7. Placement MUST be reproducible for same candidate snapshot.
8. Workers MUST emit `worker.load_report` at least every `load_report_interval_ms = 2000`.
9. Stale load reports older than `max_stale_load_report_ms = 10000` MUST be poisoned (`cpu_load_1m=1.0` equivalent).
10. No valid node under topology/load constraints MUST return `PLACEMENT_NO_CANDIDATE`.
11. Placement events (required):
    1. `placement.decision.made`
    2. `placement.candidate.poisoned`
    3. `placement.no_candidate`
12. Placement schema is `schemas/v1/placement_decision.schema.json`.

### 11.10 Failover Semantics

1. Read-only failover window is allowed with cap `failover_max_readonly_ms = 5000`.
2. During read-only window, writes return `SERVICE_DEGRADED_READONLY` with `retry_after_ms`.
3. New leader MUST replay/read WAL tail before accepting writes.
4. WAL sequence regression is forbidden.
5. Mailbox callback routing after failover MUST resolve via Skuld placement table, not stale worker affinity.
6. In-flight action journal entries MUST replay according to Sections `5.1.7` and `5.1.8`.

### 11.11 Mode Transition: Monolith -> Distributed

1. Invariant: WAL seq MUST NOT regress across transition.
2. Skuld bootstrap MUST import monolith metadata before accepting distributed writes.
3. Transition starts via admin action `runtime.mode.transition.start`.
4. During transition, monolith enters bounded read-only mode (same `failover_max_readonly_ms` policy).
5. Transition events:
   1. `runtime.mode.transition.started`
   2. `runtime.mode.transition.completed`
6. Mid-transition failure MUST recover to fully monolith or fully distributed state (never half-state).
7. Operational command/runbook details live in ops docs; protocol invariants live in this section.

### 11.12 Mailbox Semantics (locked)

#### 11.12.1 Scope

1. Mailbox is control-plane transport between Skuld and worker roles.
2. Mailbox does not carry data-plane traffic (ingress/tool bus/egress have own contracts).
3. Mailbox is active only in distributed mode; monolith uses in-memory channels with same envelope shape.

#### 11.12.2 Delivery Guarantee

1. Delivery is at-least-once in V1.
2. Exactly-once behavior requires receiver-side dedup by `message_id`.
3. Consumers MUST maintain dedup window `mailbox_dedup_window_ms = 300000` per `(source, topic)`.
4. Stateless consumers MUST use runtime stateful helper for dedup.

#### 11.12.3 Ordering Scope

1. FIFO ordering is guaranteed only per `(source_node_id, destination_node_id, topic)`.
2. Cross-topic ordering is not guaranteed.
3. Cross-source ordering is not guaranteed.
4. Consumers requiring causality MUST use `causation_id`.
5. Envelope carries `topic_seq:u64`; receivers MUST log gaps via `mailbox.gap_detected` and continue.

#### 11.12.4 Envelope

1. Envelope MUST conform to `schemas/v1/mailbox_envelope.schema.json`.
2. `message_id` is prefixed ULID with `mbx_`.
3. `ttl_ms` applies from `sent_at`; expired envelopes MUST emit `mailbox.message_expired`.
4. `delivery_attempt` starts at `1` and increments per retry.
5. `payload_schema_ref` MUST resolve to registered topic schema; unknown topics fail with `MAILBOX_UNKNOWN_TOPIC`.
6. `tenant_scope` is `null` for cluster-wide topics and required for tenant-scoped topics.

#### 11.12.5 Retry Envelope

1. Retry policy is per topic-class:
   1. `critical_control`: `max_attempts=5`, `backoff_base_ms=200`, factor `2.0`, `backoff_max_ms=3000`, jitter `+-20%`.
   2. `state_sync`: `max_attempts=3`, `backoff_base_ms=500`, factor `2.0`, `backoff_max_ms=5000`, jitter `+-20%`.
   3. `telemetry`: `max_attempts=1`, no retry; coalesce pending topic messages to latest.
2. Sender retry state MUST persist in mailbox outbox keyed by `(message_id, delivery_attempt)`.
3. Retries MUST preserve same `message_id`.
4. Retry MUST abort when envelope TTL is expired.

#### 11.12.6 Dead-letter Policy

1. Exhausted envelopes MUST route to `mailbox_dlq/{topic}`.
2. DLQ retention default: `mailbox_dlq_retention_hours = 72`.
3. DLQ API (admin):
   1. `GET /v1/skuld/mailbox/dlq?topic={topic}`
   2. `POST /v1/skuld/mailbox/dlq/{message_id}/replay`
   3. `DELETE /v1/skuld/mailbox/dlq/{message_id}`
4. `mailbox.dead_lettered` MUST include full envelope metadata (payload body excluded from event).
5. DLQ on `critical_control` topics is severity `critical`.

#### 11.12.7 Topic Registry (V1 closed set)

| Topic | Class | Ordering scope | Tenant-scoped |
|---|---|---|---|
| `skuld.leader.elected` | `critical_control` | cluster-wide | no |
| `skuld.placement.update` | `critical_control` | per destination | partial |
| `skuld.lease.revoked` | `critical_control` | per destination | no |
| `skuld.tenant.config_changed` | `state_sync` | per destination | yes |
| `skuld.registry.tool_updated` | `state_sync` | per destination | no |
| `skuld.pack.updated` | `state_sync` | per destination | yes |
| `worker.heartbeat` | `telemetry` | per source | no |
| `worker.load_report` | `telemetry` | per source | no |
| `worker.ready` | `state_sync` | per source | no |
| `worker.drain_requested` | `critical_control` | per destination | no |
| `ymir.wake.dispatch` | `state_sync` | per destination | yes |

1. Unknown wire topic MUST fail with `MAILBOX_UNKNOWN_TOPIC`.
2. New V1.x topics MUST be additive and MUST declare class, ordering scope, and tenant scoping.

#### 11.12.8 Mailbox Events (required)

1. `mailbox.message_sent`
2. `mailbox.message_delivered`
3. `mailbox.message_retried`
4. `mailbox.message_expired`
5. `mailbox.dead_lettered`
6. `mailbox.gap_detected`
7. `mailbox.dlq.replayed`
8. `mailbox.dlq.purged`

All mailbox events MUST include: `message_id`, `topic`, `source.node_id`, `destination.node_id`, `trace_id`, `delivery_attempt`.

#### 11.12.9 Mailbox Error Codes

1. `MAILBOX_UNKNOWN_TOPIC`
2. `MAILBOX_ENVELOPE_INVALID`
3. `MAILBOX_MESSAGE_EXPIRED`
4. `MAILBOX_DEAD_LETTERED`
5. `MAILBOX_DLQ_NOT_FOUND`
6. `MAILBOX_OUTBOX_FULL`

#### 11.12.10 Non-Goals (V1)

1. Ordered broadcast fan-out is not provided.
2. Mailbox request/response RPC semantics are not provided.
3. Full transactional mailbox + storage commit is not provided.
4. Producer backpressure signaling is limited:
   1. telemetry overflow drops oldest coalescible telemetry
   2. `state_sync` and `critical_control` overflow fails with `MAILBOX_OUTBOX_FULL`

### 11.13 Runtime Mode Events (required)

1. `runtime.mode.started` (MUST include `mode`, `topology_fingerprint`)
2. `runtime.unsafe_single_leader_enabled`
3. `runtime.node.joined`
4. `runtime.node.left`
5. `runtime.leader.elected`
6. `runtime.failover.started`
7. `runtime.failover.completed`
8. `runtime.mode.transition.started`
9. `runtime.mode.transition.completed`
10. `cluster.metadata.stale_breach`
11. `cluster.below_quorum`
12. `cluster.node.heartbeat_missed`
13. `cluster.node.suspect`
14. `cluster.node.down`
15. `cluster.node.recovered`

### 11.14 Runtime Mode Error Codes

1. `CLUSTER_BELOW_QUORUM`
2. `SERVICE_DEGRADED_READONLY`
3. `PLACEMENT_NO_CANDIDATE`
4. `MODE_TRANSITION_IN_PROGRESS`
5. `WAL_SEQ_REGRESSION_DETECTED`
6. `CONFIG_RUNTIME_MODE_REQUIRED`
7. `RUNTIME_MODE_TOPOLOGY_MISMATCH`
8. `RUNTIME_MODE_CHANGE_FORBIDDEN`
9. `MAILBOX_UNKNOWN_TOPIC`
10. `MAILBOX_ENVELOPE_INVALID`
11. `MAILBOX_MESSAGE_EXPIRED`
12. `MAILBOX_DEAD_LETTERED`
13. `MAILBOX_DLQ_NOT_FOUND`
14. `MAILBOX_OUTBOX_FULL`

### 11.15 Runtime Conformance Roots

1. `conformance/v1/runtime/monolith/startup/`
2. `conformance/v1/runtime/monolith/recovery/`
3. `conformance/v1/runtime/distributed/startup/`
4. `conformance/v1/runtime/distributed/failover/`
5. `conformance/v1/runtime/distributed/below_quorum/`
6. `conformance/v1/runtime/distributed/stale_metadata/`
7. `conformance/v1/runtime/transition/monolith_to_distributed/`
8. `conformance/v1/runtime/mode_activation/`
9. `conformance/v1/placement/deterministic/`
10. `conformance/v1/placement/poisoned_load/`
11. `conformance/v1/mailbox/delivery/`
12. `conformance/v1/mailbox/retry/`
13. `conformance/v1/mailbox/dlq/`
14. `conformance/v1/mailbox/ordering/`
15. `conformance/v1/failure_detector/`

## 12. Build Sequence (spec to implementation)

1. Freeze protocol schemas (`manifest`, `handshake`, `action`, `event`, `ingress_message`, `task_request`, `upload_request`, `error_envelope`, `stream_frame`, `output_envelope`, `ymir_wake_event`, `model_request`, `model_response`, `domain_snapshot`, `runtime_topology`, `runtime_config`, `placement_decision`, `mailbox_envelope`, mailbox topic payload schemas, `observation`, `observation_buffer`, `reflection_run`, `reflection_trigger`, `observation_wal_record`).
2. Build schema validators and golden conformance vectors under `conformance/v1/`.
3. Implement core envelopes and middleware (auth, trace, permission, retry).
4. Implement `terminal` + `http` adapters.
5. Implement `/v1/uploads` + storage verification and lifecycle events.
6. Implement SSE streaming contract from Section `4.7`.
7. Implement minimal tool bus and model runtime.
8. Add daemon runtime (`YMIR`), Valkyrie observation pipeline, and memory fabric.
9. Add runtime-mode control plane (`Skuld`) and mode-transition safeguards.
10. Launch closed extension alpha with signed plugins.

## 13. Resolved Decisions (formerly open questions)

1. Plugin transport: `http + grpc` (HTTP for external ingress/adapters, gRPC preferred internal).
2. Signature trust: marketplace CA default; enterprise MAY use BYO keyring via Context Pack `security.keyring_ref`.
3. Billing model: hybrid (`per-action` meter + model token usage meter).
4. Tenant isolation: logical default; `tenant.isolation=hard` reserved in V1 (full hard mode infra in V1.1).
5. Policy engine: custom deterministic schema-backed DSL in V1; OPA/Rego deferred to V1.1.

## Appendix A. Unified Event Catalog

1. A unified event index MUST be maintained with columns:
   `event_type | source_section | required_fields | schema_ref`.
2. Appendix A is index-only and MUST forward-reference subsystem event definitions.

### A.1 Ingress Events

| event_type | source_section | required_fields |
|---|---|---|
| `ingress.request.accepted` | `4.6.5` | `tenant_id, request_id, trace_id, message_id` |
| `ingress.request.rejected` | `4.6.5` | `tenant_id, request_id, trace_id, error_code` |
| `ingress.upload.requested` | `4.5` | `tenant_id, trace_id, storage_ref` |
| `ingress.upload.committed` | `4.5` | `tenant_id, trace_id, storage_ref` |
| `ingress.upload.verification_failed` | `4.5` | `tenant_id, trace_id, storage_ref, reason` |
| `ingress.upload.expired` | `4.5` | `tenant_id, trace_id, storage_ref` |
| `ingress.upload.referenced` | `4.5` | `tenant_id, trace_id, storage_ref, message_id` |
| `ingress.upload.orphaned` | `4.5` | `tenant_id, trace_id, storage_ref` |
| `ingress.rate_limited` | `5.2.2` | `tenant_id, principal_id, limit_profile_id` |
| `ingress.admission_queue.high_water` | `5.2.3` | `node_id, queue_depth` |
| `ingress.drain.started` | `5.2.4` | `node_id, inflight_count` |
| `ingress.drain.completed` | `5.2.4` | `node_id, completed_count, rejected_count` |
| `schema.forward_compat.unknown_field` | `4.6.4` | `tenant_id, request_id, trace_id, field_path` |

### A.2 Core Loop Events

| event_type | source_section | required_fields |
|---|---|---|
| `core.loop.task_accepted` | `5.1.11` | `tenant_id, task_id, request_id, trace_id, iteration, seq` |
| `core.loop.task_routed` | `5.1.11` | `tenant_id, task_id, request_id, trace_id, iteration, seq` |
| `core.loop.iteration_started` | `5.1.11` | `tenant_id, task_id, request_id, trace_id, iteration, seq` |
| `core.loop.site_entered` | `5.1.11` | `tenant_id, task_id, request_id, trace_id, iteration, seq, site` |
| `core.loop.site_completed` | `5.1.11` | `tenant_id, task_id, request_id, trace_id, iteration, seq, site` |
| `core.loop.suspended` | `5.1.11` | `tenant_id, task_id, request_id, trace_id, iteration, seq, suspension_point` |
| `core.loop.resumed` | `5.1.11` | `tenant_id, task_id, request_id, trace_id, iteration, seq, suspension_point` |
| `core.loop.parse_failed` | `5.1.11` | `tenant_id, task_id, request_id, trace_id, iteration, seq` |
| `core.loop.guardrail_breached` | `5.1.11` | `tenant_id, task_id, request_id, trace_id, iteration, seq, guardrail` |
| `core.loop.cancelled` | `5.1.11` | `tenant_id, task_id, request_id, trace_id, iteration, seq, cancel_reason` |
| `core.loop.iteration_completed` | `5.1.11` | `tenant_id, task_id, request_id, trace_id, iteration, seq` |
| `core.loop.task_terminated` | `5.1.11` | `tenant_id, task_id, request_id, trace_id, iteration, seq, terminal_state` |
| `core.loop.checkpoint_persisted` | `5.1.11` | `tenant_id, task_id, request_id, trace_id, iteration, seq, checkpoint_id` |
| `core.loop.checkpoint_load_failed` | `5.1.11` | `tenant_id, task_id, request_id, trace_id, checkpoint_id` |
| `core.loop.admission_rejected` | `5.1.13` | `tenant_id, task_id, request_id, trace_id, reason` |
| `core.loop.drain.started` | `5.1.12` | `node_id, inflight_tasks` |
| `core.loop.drain.completed` | `5.1.12` | `node_id, terminated, checkpointed, force_stopped` |
| `core.loop.drain.force_stopped` | `5.1.12` | `tenant_id, task_id, request_id, trace_id` |

### A.3 Context Assembly Events

| event_type | source_section | required_fields |
|---|---|---|
| `context.assembly.started` | `5.1.2` | `tenant_id, task_id, request_id, trace_id, iteration, seq` |
| `context.assembly.stage_started` | `5.1.2` | `tenant_id, task_id, request_id, trace_id, iteration, seq, stage` |
| `context.assembly.stage_completed` | `5.1.2` | `tenant_id, task_id, request_id, trace_id, iteration, seq, stage` |
| `context.assembly.stage_degraded` | `5.1.2` | `tenant_id, task_id, request_id, trace_id, iteration, seq, stage` |
| `context.assembly.stage_failed` | `5.1.2` | `tenant_id, task_id, request_id, trace_id, iteration, seq, stage` |
| `context.assembly.freshness_verified` | `5.1.2` | `tenant_id, task_id, request_id, trace_id, iteration, seq` |
| `context.assembly.chunk_injected` | `5.1.2` | `tenant_id, task_id, request_id, trace_id, iteration, seq, chunk_type` |
| `context.assembly.budget_overflow` | `5.1.2` | `tenant_id, task_id, request_id, trace_id, iteration, seq` |
| `context.assembly.compaction_signal_emitted` | `5.1.2` | `tenant_id, task_id, request_id, trace_id, iteration, seq` |
| `context.assembly.completed` | `5.1.2` | `tenant_id, task_id, request_id, trace_id, iteration, seq, total_tokens` |
| `context.assembly.domain_snapshot_stale` | `5.5.8` | `tenant_id, task_id, trace_id, domain, snapshot_key` |

### A.4 Memory Verification Events

| event_type | source_section | required_fields |
|---|---|---|
| `memory.verification.confirmed` | `5.1.3` | `tenant_id, task_id, trace_id, memory_entry_id` |
| `memory.verification.stale` | `5.1.3` | `tenant_id, task_id, trace_id, memory_entry_id` |
| `memory.verification.suppressed` | `5.1.3` | `tenant_id, task_id, trace_id, memory_entry_id` |
| `memory.verification.unverified` | `5.1.3` | `tenant_id, task_id, trace_id, memory_entry_id` |

### A.5 Tool Bus Events

| event_type | source_section | required_fields |
|---|---|---|
| `tool_registry.refresh` | `5.3.16` | `node_id, tools_loaded` |
| `registry.tool.registered` | `5.3.16` | `tool_id, version` |
| `registry.tool.deprecated` | `5.3.16` | `tool_id, version, sunset_at` |
| `registry.tool.discovered` | `5.3.16` | `tenant_id, trace_id, discovery_id, tools_returned` |
| `registry.tool.risk_escalation_attempted` | `5.3.16` | `tool_id, old_risk, new_risk` |
| `tool.permission.denied` | `5.3.16` | `tenant_id, trace_id, tool_id, reason` |
| `tool.secret.resolved` | `5.3.16` | `tenant_id, trace_id, tool_id, secret_name` |
| `tool.async.callback_received` | `5.3.16` | `tenant_id, trace_id, request_id, tool_id` |
| `tool_call.requested` | `5.3.16` | `tenant_id, request_id, trace_id, tool_id` |
| `tool_call.executed` | `5.3.16` | `tenant_id, request_id, trace_id, tool_id, duration_ms, status` |
| `tool_call.failed` | `5.3.16` | `tenant_id, request_id, trace_id, tool_id, error_code` |
| `tool_call.cancelled` | `5.3.16` | `tenant_id, request_id, trace_id, tool_id` |
| `circuit_breaker.state_change` | `5.3.16` | `handler_ref, old_state, new_state` |

### A.6 Memory Fabric Events

| event_type | source_section | required_fields |
|---|---|---|
| `memory.wal.write_completed` | `5.5.13` | `tenant_id, trace_id, seq` |
| `memory.wal.fsync_completed` | `5.5.13` | `tenant_id, batch_size, latency_ms` |
| `memory.wal.segment_rotated` | `5.5.10` | `tenant_id, segment_id` |
| `memory.wal.segment_truncated` | `5.5.10` | `tenant_id, segment_id` |
| `memory.wal.record_corrupt` | `5.5.10` | `tenant_id, segment_id, offset` |
| `memory.wal.recovery_started` | `5.5.13` | `tenant_id, from_seq` |
| `memory.wal.recovery_completed` | `5.5.13` | `tenant_id, recovered_to_seq, duration_ms` |
| `memory.snapshot.created` | `5.5.13` | `tenant_id, snapshot_id, snapshot_seq` |
| `memory.snapshot.validation_failed` | `5.5.13` | `tenant_id, snapshot_id, reason` |
| `memory.graph.reconciliation_started` | `5.5.13` | `tenant_id` |
| `memory.graph.reconciliation_completed` | `5.5.13` | `tenant_id, duration_ms` |
| `memory.graph.drift_detected` | `5.5.13` | `tenant_id, drift_seq_delta` |
| `memory.graph.rebuild_triggered` | `5.5.13` | `tenant_id, reason` |
| `memory.retrieval.completed` | `5.5.13` | `tenant_id, trace_id, chunks_returned` |
| `memory.retrieval.degraded` | `5.5.13` | `tenant_id, trace_id, reason` |
| `memory.sequence_gap` | `5.5.13` | `tenant_id, expected_seq, actual_seq` |
| `memory.backup.completed` | `5.5.11` | `tenant_id, snapshot_seq, head_seq, size_bytes` |
| `memory.restore.completed` | `5.5.11` | `tenant_id, restored_to_seq` |
| `memory.storage.quota_warning` | `5.5.12` | `tenant_id, used_bytes, quota_bytes` |

### A.7 Observation WAL Events

| event_type | source_section | required_fields |
|---|---|---|
| `memory.observation_wal.segment_created` | `5.5.9` | `tenant_id, session_id, segment_id` |
| `memory.observation_wal.segment_truncated` | `5.5.9` | `tenant_id, session_id, segment_id` |
| `memory.observation_wal.replay_started` | `5.5.9` | `tenant_id, session_id` |
| `memory.observation_wal.replay_completed` | `5.5.9` | `tenant_id, session_id, records_replayed` |
| `memory.observation_wal.segment_lost` | `5.5.9` | `tenant_id, session_id, segment_id` |
| `memory.observer.wal_unavailable` | `5.5.9` | `tenant_id, session_id` |

### A.8 Egress Events

| event_type | source_section | required_fields |
|---|---|---|
| `egress.output.queued` | `5.6.5` | `tenant_id, trace_id, output_id, channel` |
| `egress.output.acknowledged` | `5.6.5` | `tenant_id, trace_id, output_id, channel` |
| `egress.output.send_attempted` | `5.6.5` | `tenant_id, trace_id, output_id, channel, attempt` |
| `egress.output.sent` | `5.6.5` | `tenant_id, trace_id, output_id, channel` |
| `egress.output.failed` | `5.6.5` | `tenant_id, trace_id, output_id, channel, error_code` |
| `egress.output.deduplicated` | `5.6.5` | `tenant_id, trace_id, output_id, channel` |
| `egress.output.rate_limited` | `5.6.7` | `tenant_id, channel` |
| `egress.output.delivery.reported` | `5.6.5` | `tenant_id, trace_id, output_id, channel` |
| `egress.output.read.reported` | `5.6.5` | `tenant_id, trace_id, output_id, channel` |
| `egress.output.expired` | `5.6.6` | `tenant_id, output_id, channel` |
| `egress.output.truncated` | `5.6.11` | `tenant_id, output_id, channel, original_size_kb` |
| `egress.queue.full` | `5.6.6` | `channel, queue_depth` |
| `egress.queue.high_water` | `5.6.6` | `channel, queue_depth` |
| `egress.redaction.failed` | `5.6.8` | `tenant_id, output_id, reason` |
| `egress.channel.circuit_opened` | `5.6.11` | `channel, consecutive_failures` |
| `egress.tenant.delivery_degraded` | `5.6.11` | `tenant_id, channel, failure_rate` |
| `egress.drain.started` | `5.6.10` | `node_id, queued_count` |
| `egress.drain.completed` | `5.6.10` | `node_id, delivered_count, persisted_count` |

### A.9 Model Runtime Events

| event_type | source_section | required_fields |
|---|---|---|
| `model.inference.requested` | `5.7.7` | `tenant_id, task_id, request_id, trace_id, model_ref, provider` |
| `model.inference.first_token` | `5.7.7` | `tenant_id, task_id, request_id, trace_id, latency_ms` |
| `model.inference.completed` | `5.7.7` | `tenant_id, task_id, request_id, trace_id, input_tokens, output_tokens, duration_ms` |
| `model.inference.failed` | `5.7.7` | `tenant_id, task_id, request_id, trace_id, error_code, provider` |
| `model.inference.fallback` | `5.7.7` | `tenant_id, task_id, request_id, trace_id, from_provider, to_provider` |
| `model.provider.health_changed` | `5.7.4` | `provider, old_state, new_state` |
| `model.token_budget.exceeded` | `5.7.4` | `tenant_id, provider, budget_type, limit, current` |

### A.10 YMIR Events

| event_type | source_section | required_fields |
|---|---|---|
| `ymir.wake.received` | `5.10.9` | `tenant_id, trace_id, wake_id` |
| `ymir.wake.deduped` | `5.10.9` | `tenant_id, trace_id, wake_id, dedup_key` |
| `ymir.wake.cancelled` | `5.10.9` | `tenant_id, trace_id, wake_id` |
| `ymir.wake.coalesced` | `5.10.10` | `tenant_id, wake_id, coalesced_count` |
| `ymir.wake_queue.overflow` | `5.10.10` | `node_id, dropped_count` |
| `ymir.tick.started` | `5.10.9` | `tenant_id, trace_id, wake_id` |
| `ymir.tick.completed` | `5.10.9` | `tenant_id, trace_id, wake_id, duration_ms` |
| `ymir.autodream.started` | `5.10.9` | `tenant_id, trace_id, wake_id` |
| `ymir.autodream.completed` | `5.10.9` | `tenant_id, trace_id, wake_id` |
| `ymir.proactive.detected` | `5.10.9` | `tenant_id, trace_id, wake_id` |
| `ymir.proactive.failed` | `5.10.9` | `tenant_id, trace_id, wake_id, reason` |
| `ymir.task.enqueued` | `5.10.9` | `tenant_id, trace_id, wake_id, task_id` |
| `ymir.task.enqueue_failed` | `5.10.9` | `tenant_id, trace_id, wake_id, reason` |
| `ymir.policy.blocked` | `5.10.9` | `tenant_id, trace_id, wake_id, policy_rule` |
| `ymir.error` | `5.10.9` | `tenant_id, trace_id, wake_id, error_code` |
| `ymir.reflection.started` | `5.10.9` | `tenant_id, trace_id, wake_id` |
| `ymir.reflection.completed` | `5.10.9` | `tenant_id, trace_id, wake_id, proposals_created` |
| `ymir.reflection.promoted` | `5.10.9` | `tenant_id, trace_id, proposal_id` |
| `ymir.reflection.dropped` | `5.10.9` | `tenant_id, trace_id, proposal_id, reason` |
| `ymir.reflection.trigger_emitted` | `5.10.9` | `tenant_id, trace_id, trigger_id` |
| `ymir.reflection.backlog_warning` | `5.10.13` | `tenant_id, backlog_count` |
| `ymir.proposal.auto_expired` | `5.10.11` | `tenant_id, proposal_id` |
| `ymir.gc.completed` | `5.10.11` | `tenant_id, proposals_collected, storage_freed_bytes` |
| `ymir.budget.exceeded` | `5.10.13` | `tenant_id, budget_type, limit, current` |
| `ymir.drain.started` | `5.10.12` | `node_id, inflight_jobs` |
| `ymir.drain.completed` | `5.10.12` | `node_id, completed, cancelled` |

### A.11 Valkyrie (Observer) Events

| event_type | source_section | required_fields |
|---|---|---|
| `memory.observer.started` | `5.11.7` | `tenant_id, session_id, trace_id, buffer_id` |
| `memory.observer.buffer_flushed` | `5.11.7` | `tenant_id, session_id, trace_id, buffer_id, message_count` |
| `memory.observer.completed` | `5.11.7` | `tenant_id, session_id, trace_id, observations_extracted` |
| `memory.observer.parse_failed` | `5.11.7` | `tenant_id, session_id, trace_id, buffer_id` |
| `memory.observer.failed` | `5.11.7` | `tenant_id, session_id, trace_id, reason` |
| `memory.observer.buffer_dropped` | `5.11.7` | `tenant_id, session_id, trace_id, dropped_count` |
| `memory.observer.circuit_opened` | `5.11.7` | `tenant_id, session_id` |
| `memory.observation_gap` | `5.11.7` | `tenant_id, session_id, expected_seq, actual_seq` |
| `memory.observer.buffer_evicted` | `5.11.9` | `tenant_id, session_id, buffer_id` |
| `memory.observation.auto_expired` | `5.11.9` | `tenant_id, observation_id` |

### A.12 Self-Evaluation Events

| event_type | source_section | required_fields |
|---|---|---|
| `evaluation.criteria_resolved` | `5.12.10` | `tenant_id, task_id, request_id, trace_id, iteration, seq, source, objective_count` |
| `evaluation.objective_checked` | `5.12.10` | `tenant_id, task_id, request_id, trace_id, iteration, seq, objective_id, verification_type, result` |
| `evaluation.verdict_emitted` | `5.12.10` | `tenant_id, task_id, request_id, trace_id, iteration, seq, verdict, objectives_met, objectives_total` |
| `evaluation.progress_detected` | `5.12.10` | `tenant_id, task_id, request_id, trace_id, iteration, seq` |
| `evaluation.stuck_detected` | `5.12.10` | `tenant_id, task_id, request_id, trace_id, iteration, seq, no_progress_counter` |
| `evaluation.hint_injected` | `5.12.10` | `tenant_id, task_id, request_id, trace_id, iteration, seq` |
| `evaluation.completed` | `5.12.10` | `tenant_id, task_id, request_id, trace_id, iteration, seq, final_verdict` |

### A.13 Runtime Mode Events

| event_type | source_section | required_fields |
|---|---|---|
| `runtime.mode.started` | `11.13` | `mode, topology_fingerprint, node_id, role_set` |
| `runtime.unsafe_single_leader_enabled` | `11.13` | `node_id` |
| `runtime.node.joined` | `11.13` | `node_id, role_set` |
| `runtime.node.left` | `11.13` | `node_id, reason` |
| `runtime.leader.elected` | `11.13` | `leader_node_id, term` |
| `runtime.failover.started` | `11.13` | `failed_node_id` |
| `runtime.failover.completed` | `11.13` | `failed_node_id, new_leader_id, duration_ms` |
| `runtime.mode.transition.started` | `11.13` | `from_mode, to_mode` |
| `runtime.mode.transition.completed` | `11.13` | `from_mode, to_mode, duration_ms` |
| `cluster.metadata.stale_breach` | `11.13` | `node_id, stale_ms, cap_ms` |
| `cluster.below_quorum` | `11.13` | `alive_count, required_count` |
| `cluster.node.heartbeat_missed` | `11.7` | `node_id, missed_count` |
| `cluster.node.suspect` | `11.7` | `node_id, suspect_duration_ms` |
| `cluster.node.down` | `11.7` | `node_id` |
| `cluster.node.recovered` | `11.7` | `node_id, recovery_streak` |

### A.14 Placement Events

| event_type | source_section | required_fields |
|---|---|---|
| `placement.decision.made` | `11.9` | `task_id, target_node_id, load_score` |
| `placement.candidate.poisoned` | `11.9` | `node_id, reason` |
| `placement.no_candidate` | `11.9` | `task_id, candidate_count` |

### A.15 Mailbox Events

| event_type | source_section | required_fields |
|---|---|---|
| `mailbox.message_sent` | `11.12.8` | `message_id, topic, source.node_id, destination.node_id, trace_id` |
| `mailbox.message_delivered` | `11.12.8` | `message_id, topic, source.node_id, destination.node_id, trace_id, delivery_attempt` |
| `mailbox.message_retried` | `11.12.8` | `message_id, topic, delivery_attempt, backoff_ms` |
| `mailbox.message_expired` | `11.12.8` | `message_id, topic, ttl_ms` |
| `mailbox.dead_lettered` | `11.12.8` | `message_id, topic, delivery_attempt, reason` |
| `mailbox.gap_detected` | `11.12.8` | `topic, source.node_id, expected_seq, actual_seq` |
| `mailbox.dlq.replayed` | `11.12.8` | `message_id, topic` |
| `mailbox.dlq.purged` | `11.12.8` | `message_id, topic` |

### A.16 Stream Events

| event_type | source_section | required_fields |
|---|---|---|
| `stream.cancelled` | `4.7` | `tenant_id, request_id, trace_id` |
| `stream.resume_expired` | `4.7` | `tenant_id, request_id, trace_id, last_event_id` |

### A.17 Security and Audit Events

| event_type | source_section | required_fields |
|---|---|---|
| `security.permission.granted` | `4.4` | `tenant_id, trace_id, principal, resource, verb` |
| `security.permission.denied` | `4.4` | `tenant_id, trace_id, principal, resource, verb` |
| `security.scope.escalation_attempted` | `4.4` | `tenant_id, trace_id, principal, scope` |
| `marketplace.plugin.installed` | `5.9` | `plugin_id, version, tenant_id` |
| `marketplace.plugin.updated` | `5.9` | `plugin_id, old_version, new_version, tenant_id` |
| `marketplace.plugin.uninstalled` | `5.9` | `plugin_id, version, tenant_id` |
| `marketplace.signature.verified` | `4.1` | `plugin_id, key_id` |
| `marketplace.signature.rejected` | `4.1` | `plugin_id, reason` |
