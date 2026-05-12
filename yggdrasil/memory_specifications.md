## Final Hardened Memory Layer Specification (V3 - Locked)

### 1. Ordering Truth Source

1. `logical_sequence` (`seq:u64`) is the single ordering truth source per tenant.
2. `event_time` is for display/audit only.
3. `ingest_time` is operational/latency only.
4. All replay/reconciliation/order-sensitive queries MUST order by `seq`.

### 2. Source of Truth

1. Append-only history is source of truth:
   1. conversation logs
   2. `edges_history.parquet`
2. Live in-memory graph is a derived materialized view only.
3. On doubt, drift, or recovery, rebuild from append-only history.

### 3. Sequence Allocation Owned by WAL

1. No separate sequence KV authority is used.
2. Sequence is allocated as part of WAL append flow.
3. WAL record format (minimum required fields):
   1. `tenant_id`
   2. `seq:u64`
   3. `event_type`
   4. `payload`
   5. `trace_id`
   6. `request_id`
   7. `timestamp`
4. Write flow:
   1. read cached last tenant seq (cache hydrated from WAL tail)
   2. allocate `next_seq = last_seq + 1`
   3. append WAL record containing `next_seq` + payload
5. Crash recovery:
   1. read tenant WAL tail and find highest committed seq
   2. set next seq to `highest_seq + 1`
6. Rewinds are forbidden.
7. Forward gaps are tolerated and logged as `memory.sequence_gap`.

### 4. Write Durability and ACK Semantics

1. Durability contract: write is durable only after WAL `fsync`.
2. ACK contract: caller ACK is returned only after `fsync` of the group containing that write.
3. Group commit defaults (V1):
   1. `fsync_interval_ms = 2`
   2. `fsync_batch_entries = 64`
   3. trigger on either condition, whichever comes first
4. `durability_mode=sync` MAY be requested for critical writes (immediate fsync path).
5. Un-ACKed writes are retry-safe via idempotency.

### 5. Canonical IDs and ULID Format

1. Event-related IDs use prefixed ULID format:
   1. regex: `^<prefix>_[0-9A-HJKMNP-TV-Z]{26}$`
2. Memory prefixes:
   1. `mev_` memory event
   2. `edg_` edge event
   3. `snp_` snapshot
   4. `kbf_` knowledge file
   5. `chk_` knowledge chunk
   6. `rqy_` retrieval query
   7. `rec_` reconciliation run
3. `trace_id` remains tracing-standard (`trc_` per ingress contract).
4. `tenant_id` and `session_id` remain non-ULID patterned strings.

### 6. Snapshot Metadata Contract

1. Snapshot artifacts are a pair:
   1. `current_graph.parquet`
   2. `current_graph.meta.json`
2. Metadata required fields:
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
3. Snapshot commit point is metadata rename last (atomic write pattern).
4. Snapshot must be rejected on checksum/schema/tenant mismatch.

### 7. Deterministic Recovery

1. Load latest valid snapshot pair.
2. Replay append-only history from `snapshot_seq + 1` to current head.
3. Rebuild live graph and in-memory caches from replayed records.
4. Fixed time windows (for example “last 24h”) are not allowed for recovery.

### 8. Graph Consistency and Reconciliation

1. Conflict policy: sequence-based last-write-wins on `(src, edge_type, dst)`.
2. Deletes use tombstones in history.
3. Reconciliation defaults:
   1. every `60s` for active tenants
   2. max drift `5m`
   3. drift breach triggers full rebuild from history

### 9. Retention Defaults

1. short-term conversation logs: `90d` (tenant overridable)
2. long-term knowledge: `indefinite`
3. graph history: `indefinite`
4. optional graph-history compaction after `365d`

### 10. Security and Key Rotation

1. At-rest encryption: AES-256 on persisted memory artifacts.
2. In-transit encryption: TLS 1.3 on internal communication.
3. Per-tenant keying is mandatory.
4. Redaction must remove PII/sensitive fields before `MEMORY.md` write and prompt injection.
5. In-memory data is not encrypted; isolation is enforced by process/node tenancy boundaries.
6. Envelope encryption (`KEK`/`DEK`) is required.
7. Rotation defaults:
   1. KEK monthly with 30-day rollback window
   2. DEK yearly or admin-triggered
8. Tenant delete must support cryptoshred via key destruction.

---
