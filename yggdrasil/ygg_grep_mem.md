# Yggdrasil Memory Fabric Design Derived from Greptime Internals (`ygg_grep_mem.md`)

Status: Draft V1 mapping spec  
Purpose: Translate Greptime storage/query architecture into a concrete Yggdrasil-native distributed memory-node design.

## 1. Objective

Build Yggdrasil Memory Fabric as a first-class distributed subsystem inside Yggdrasil, not an external dependency.

This document converts the architectural lessons from `grep_mem.md` into:

1. explicit Yggdrasil component boundaries
2. protocol and data contracts
3. durability/recovery semantics
4. multi-tenant and distributed operation defaults

## 2. What We Borrow vs What We Keep Custom

### 2.1 Borrowed from Greptime (design patterns)

1. Region-oriented storage ownership and lifecycle.
2. WAL-first write durability (before memory mutation).
3. Memtable -> flush -> Parquet segment pipeline.
4. Manifest action log + checkpoint replay model.
5. Background compaction + GC with lingering protection.
6. Query planner with partition pruning + parallel scan.
7. Multi-layer cache design (file/index/manifest/write).

### 2.2 Kept Yggdrasil-native

1. Memory semantics centered on conversations, agents, tools, graph edges, and context packs.
2. Ingress/Tool/Context contracts from `ygg_v1.md` remain canonical.
3. Per-tenant monetization and policy controls are first-class.
4. Memory nodes are part of Yggdrasil topology and event model.

## 3. Component Mapping (Greptime -> Yggdrasil)

| Greptime Concept | Yggdrasil Concept | Role in Yggdrasil |
|---|---|---|
| RegionServer | Memory Region Router | Runtime region ownership/routing on each memory node |
| RegionEngine trait | Memory Engine trait | Standard engine contract for write/read/flush/compact |
| WAL provider | Memory WAL Provider | Local or remote WAL backend |
| Memtable | Hot Memory Buffer | In-memory mutable + immutable buffers |
| SST (Parquet) | Memory Segment (Parquet) | Durable columnar segment files |
| Manifest | Segment Manifest | Authoritative metadata/history of segment state |
| Compaction picker/run | Segment Compaction Scheduler | Merge/optimize segments |
| GC worker | Segment Reclaimer | Deletes obsolete/orphaned files |
| AccessLayer | Segment Access Layer | Read/write/upload/download abstraction |
| Partition rule manager | Memory Partition Manager | Route by tenant/session/entity/time |
| Query planner + scanner | Context Retrieval Planner | Build retrieval plan for Context Assembly |

## 4. Yggdrasil Memory Node Architecture

## 4.1 Planes

1. Control Plane:
   1. Region assignment and rebalancing.
   2. Lease and role management (leader/follower/staging).
   3. Schema/config propagation.
2. Data Plane:
   1. Ingest writes through WAL -> Hot Buffer -> Segment pipeline.
   2. Serve query/retrieval from hot + durable layers.
3. Background Plane:
   1. Flush scheduler.
   2. Compaction scheduler.
   3. Segment reclaim/GC.

## 4.2 Node Internal Modules

1. `memory_region_router`
2. `memory_engine`
3. `memory_wal`
4. `hot_buffer`
5. `segment_access_layer`
6. `segment_manifest`
7. `compaction_scheduler`
8. `segment_reclaimer`
9. `memory_cache_manager`
10. `retrieval_planner`

## 5. Data Model (Yggdrasil Memory Fabric)

V1 stores memory in logical datasets, physically partitioned per tenant and region.

## 5.1 Canonical datasets

1. `conversation_events`
   1. user/model/daemon/tool turns
   2. trace + request references
2. `tool_events`
   1. tool request/response/status
   2. callback lineage
3. `context_snapshots`
   1. assembled context bundles (summaries, citations, selected tools)
4. `graph_edges_current`
   1. live relationship graph (tenant scoped)
5. `graph_edges_history`
   1. immutable edge mutation history
6. `knowledge_assets`
   1. uploaded files metadata + storage references
7. `embedding_index`
   1. vector metadata for retrieval candidate selection

## 5.2 Required key columns (common)

1. `tenant_id`
2. `region_id`
3. `event_id` (ULID)
4. `trace_id`
5. `request_id`
6. `session_id`
7. `message_id`
8. `event_ts`
9. `sequence_no`
10. `payload_json`

## 5.3 Tenant isolation

1. All region ownership and data paths are tenant-scoped.
2. Cross-tenant reads are forbidden by default.
3. Any ownership mismatch is returned as NOT_FOUND style responses to avoid enumeration leaks.

## 6. Partitioning and Regioning Strategy

## 6.1 Primary partition key

`(tenant_id, logical_stream, time_bucket)`

Where `logical_stream` in V1 is one of:

1. `conversation`
2. `tooling`
3. `graph`
4. `knowledge`

## 6.2 Secondary sharding

Inside a partition, shard by deterministic hash of high-cardinality identifier:

1. `session_id` for conversations
2. `entity_id` for graph edges
3. `asset_id` for knowledge

## 6.3 Time bucketing

1. Default segment window: 1 hour for high-volume streams.
2. Daily bucket rollover for low-volume tenants.
3. Compaction windows operate on time buckets (TWCS-like behavior).

## 6.4 Region role states

1. `Leader`
2. `Follower`
3. `DowngradingLeader`
4. `StagingLeader`

Staging allows writes but can defer checkpoint/compaction for controlled transitions.

## 7. Durability Pipeline (Write Path)

V1 write path is strict WAL-first.

## 7.1 Write stages

1. `ingress accepted`
2. `route to region leader`
3. `append wal_entry`
4. `apply to hot_buffer`
5. `ack write`
6. `background flush to segment`
7. `manifest action append`
8. `version advance`

## 7.2 Failure guarantees

1. If WAL append fails -> write fails, no buffer mutation.
2. If buffer apply fails after WAL append -> replay/catchup restores state.
3. If flush upload fails -> buffer remains recoverable; retry flush.
4. Manifest failure blocks durable version promotion.

## 7.3 Write contract (internal envelope)

```json
{
  "request_id": "req_...",
  "trace_id": "trc_...",
  "tenant_id": "tenant_...",
  "region_id": "rgn_...",
  "stream": "conversation",
  "sequence_hint": null,
  "idempotency_key": "idem_...",
  "payload": {
    "event_type": "user_message",
    "event_ts": "2026-04-09T10:00:00Z",
    "data": {}
  }
}
```

## 8. Hot Buffer and Flush Design

## 8.1 Buffer types

1. `mutable buffer`: receives fresh writes.
2. `immutable buffer`: frozen candidate for flush.

## 8.2 Flush triggers

1. memory threshold reached
2. periodic timer
3. manual/admin flush
4. role transition events (staging/downgrade/close)

## 8.3 Flush output

1. Parquet segment file
2. optional index sidecar metadata
3. manifest add-segment action

## 8.4 Flush ordering rule

Manifest update MUST succeed before source immutable buffer is discarded from recoverable state.

## 9. Segment Storage and Object Upload

## 9.1 Segment format

1. Parquet with ZSTD compression.
2. timestamp-aware encoding optimizations.
3. row-group statistics retained for pruning.

## 9.2 Object store support

1. S3-compatible
2. OSS-compatible
3. GCS/Azure via provider abstraction
4. local FS for dev/test

## 9.3 Upload policy defaults

1. multipart-capable buffering (`>=8MB` write buffers)
2. retry with jitter
3. tracing + metrics middleware
4. atomic temp path then finalize

## 9.4 Path layout (recommended)

`memory/{tenant_id}/{stream}/{table_id}/{region_name}/{yyyy}/{mm}/{dd}/{segment_id}.parquet`

Manifest path:

`memory/{tenant_id}/{stream}/{table_id}/{region_name}/manifest/`

## 10. Manifest and Versioning Model

## 10.1 Manifest actions

1. `ADD_SEGMENT`
2. `REMOVE_SEGMENT`
3. `ALTER_SCHEMA`
4. `ALTER_OPTIONS`
5. `SET_CHECKPOINT`

## 10.2 Replay model

Recovery state reconstruction:

1. load latest checkpoint
2. replay delta manifest actions
3. reconstruct active segment set + options

## 10.3 Version compatibility

1. action protocol versioned.
2. reader/writer compatibility enforced.
3. incompatible action stream rejects startup with explicit version error.

## 11. Query and Retrieval Pipeline (Context Assembly Input)

## 11.1 Retrieval sources

1. hot buffer (latest writes)
2. durable segments (Parquet)
3. graph current state
4. graph history when needed
5. knowledge metadata + embeddings

## 11.2 Retrieval request contract

```json
{
  "request_id": "req_...",
  "trace_id": "trc_...",
  "tenant_id": "tenant_...",
  "session_id": "ses_...",
  "query_kind": "context_assembly",
  "filters": {
    "time_range": {"start": "...", "end": "..."},
    "entities": ["customer:123", "order:abc"],
    "streams": ["conversation", "tooling", "graph"]
  },
  "limits": {
    "max_rows": 5000,
    "max_bytes": 4194304
  }
}
```

## 11.3 Query execution stages

1. partition pruning by tenant/stream/time
2. region fanout planning
3. parallel segment scans
4. sequence-aware dedup/merge
5. optional graph expansion (depth-limited)
6. output as context bundle inputs

## 11.4 Read consistency levels

1. `leader_strict`: includes latest acknowledged writes.
2. `follower_ok`: lower latency, eventually consistent.
3. `snapshot`: pinned to manifest/version checkpoint.

## 12. Compaction and Reclaim (GC)

## 12.1 Compaction goals

1. reduce read amplification
2. merge tiny segments
3. apply dedup/tombstone cleanup semantics
4. keep time-window locality

## 12.2 Compaction strategy V1

Time-windowed compaction with per-stream knobs:

1. `trigger_file_num`
2. `time_window`
3. `max_output_file_size`
4. `append_mode`

## 12.3 Reclaim policy

Delete candidate segment only when all conditions hold:

1. not active in current manifest
2. not referenced by in-flight query temp refs
3. past lingering window
4. object-store delete success

## 12.4 Orphan cleanup modes

1. Incremental mode: manifest-removed only.
2. Full listing mode: periodic orphan sweep.

## 13. Cache Topology

V1 cache layers:

1. `write_cache`: recent hot writes
2. `segment_meta_cache`: segment metadata
3. `index_cache`: bloom/inverted/vector metadata
4. `manifest_cache`: latest manifest snapshots
5. `object_read_cache`: page/range cache for remote segment reads

Cache invalidation rules:

1. segment removal invalidates meta/index/object cache entries.
2. manifest checkpoint rotates relevant manifest cache keys.
3. stale cache is bounded by explicit TTL.

## 14. Distributed Semantics and Region Mobility

## 14.1 Admission and leases

1. Node must hold region lease to accept leader writes.
2. Lease loss transitions region to non-writable role.

## 14.2 Catchup and open

1. Open region with checkpoint + manifest replay.
2. Replay WAL from checkpoint entry.
3. Validate expected last entry id before declaring ready.

## 14.3 Region remap/migration

1. Generate target manifest(s).
2. Map/copy segment references according to new partition expressions.
3. Validate file coverage and ownership.
4. Activate new region mapping atomically.

## 15. Security and Compliance

1. tenant-isolated namespaces everywhere.
2. no plaintext secret values in memory event payloads.
3. trace and audit IDs propagated in all memory operations.
4. storage refs and ownership checks enforced on every read path.
5. optional encryption at rest handled at object-store layer + key policy.

## 16. Observability

## 16.1 Required events

1. `memory.write.requested`
2. `memory.write.wal_appended`
3. `memory.write.buffer_applied`
4. `memory.flush.started`
5. `memory.flush.segment_uploaded`
6. `memory.manifest.updated`
7. `memory.query.requested`
8. `memory.query.completed`
9. `memory.compaction.completed`
10. `memory.gc.deleted`
11. `memory.gc.orphan_detected`
12. `memory.catchup.completed`

## 16.2 Core metrics

1. write p50/p95/p99 latency
2. WAL append latency and failure rate
3. flush queue depth and flush duration
4. segment scan bytes and query latency
5. cache hit/miss by cache type
6. compaction backlog
7. GC backlog and reclaimed bytes

## 17. V1 Defaults (Recommended)

1. `flush.mutable_threshold_ratio = 0.5`
2. `flush.total_buffer_limit_ratio = 1.0`
3. `segment.write_buffer_size = 8MB`
4. `segment.write_concurrency = 8`
5. `compaction.trigger_file_num = 4`
6. `compaction.window = 1h`
7. `gc.lingering_time = 60s`
8. `gc.unknown_file_lingering_time = 1h`
9. `query.max_concurrent_scan_files = 512`
10. `manifest.checkpoint_distance = 10 actions`

## 18. V1 Implementation Plan (Practical)

## Phase 1: Foundation

1. Memory Engine trait + region router + WAL provider abstraction.
2. Hot buffer implementation and WAL-first write API.
3. Parquet segment writer + object upload plumbing.

## Phase 2: Durability and Query

1. Manifest action log + checkpoint support.
2. Region open/catchup replay flow.
3. Retrieval planner + partition pruning + segment scan pipeline.

## Phase 3: Lifecycle Ops

1. Compaction scheduler (TWCS-like).
2. Segment reclaimer (incremental mode first).
3. Cache manager and observability events.

## Phase 4: Distribution Hardening

1. Lease-aware role transitions.
2. Region remap/migration flow.
3. Full orphan sweep mode + advanced retry policies.

## 19. Non-negotiable V1 Rules

1. No memory write acknowledged before WAL append success.
2. No segment considered active before manifest add action persists.
3. No segment delete while still query-referenced or within linger window.
4. No cross-tenant visibility in any listing/query/discovery path.
5. Every write/query must carry `tenant_id`, `request_id`, `trace_id`.

## 20. Final Outcome

With this mapping, Yggdrasil Memory Fabric gets:

1. Greptime-level storage discipline.
2. Yggdrasil-native multi-tenant memory semantics.
3. A clear path from current spec to distributed production memory nodes.

This is now implementation-grade for your next step: defining concrete Rust traits/modules and schema files for `memory_write`, `memory_query`, `manifest_action`, and `segment_meta`.
