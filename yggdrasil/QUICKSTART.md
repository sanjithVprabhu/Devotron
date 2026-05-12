# Yggdrasil Rust Quickstart

## 1) Build and verify

```bash
cargo test
cargo test -p ygg_memory
cargo test -p ygg_agent
cargo test -p ygg_runtime
cargo run --bin run_conformance
cargo run --bin run_e2e
cargo run --bin run_agent_prod
cargo run --bin run_os_pipeline
cargo run --bin yggd
```

## 2) Run Unified Daemon

```bash
cargo run --bin yggd
```

By default this starts the integrated pipeline on `127.0.0.1:8080`:
- ingress upload lifecycle
- task normalization
- context assembly
- async loop workers
- batched persistence pipeline
- durable egress queue

Override bind/root/config with env:

```bash
YGG_BIND=127.0.0.1:8088 YGG_ROOT_DIR=./target/custom_root YGG_RUNTIME_CONFIG=config/runtime.monolith.json cargo run --bin yggd
```

## 3) Optional upload lifecycle

```bash
curl -sS -X POST http://127.0.0.1:8080/v1/uploads \
  -H 'content-type: application/json' \
  -d '{
    "tenant_id":"tenant_demo",
    "filename_hint":"note.txt",
    "size_bytes":11,
    "sha256":"b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9"
  }' | jq
```

## 4) Execute a task

```bash
curl -sS -X POST http://127.0.0.1:8080/v1/tasks/execute \
  -H 'content-type: application/json' \
  -d '{
    "tenant_id":"tenant_demo",
    "conversation_session_id":"ses_demo_1",
    "request_id":"req_01JY8K3M6N7P8Q9R0STUVWXYZA",
    "trace_id":"trc_01JY8K3M6N7P8Q9R0STUVWXYZA",
    "parts":[{"text":"check inventory for SKU-123"}]
  }' | jq
```

## 5) Inspect runtime stats and outputs

```bash
curl -sS http://127.0.0.1:8080/v1/stats/tenant_demo | jq
curl -sS http://127.0.0.1:8080/v1/outputs | jq
```

## Unified API routes (`yggd`)

- `GET /health`
- `GET /v1/runtime/config`
- `POST /v1/uploads`
- `POST /v1/uploads/commit`
- `POST /v1/tasks/execute`
- `GET /v1/stats/{tenant_id}`
- `GET /v1/outputs`

## Compatibility daemon (`yggd_prod`)

`yggd_prod` runs the same integrated stack on port `8090` with baked-in high-concurrency defaults.
