Full, atomic logs of everything (user messages, daemon activity, model thinking/monologue, tool results, corrections, etc.) stored in a proper schema.
A per-tenant MEMORY.md index (lightweight pointers) — one for each customer/tenant.
Conversation logs and long-term data stored efficiently in Parquet format.
Support for graph relationships (entities, dependencies, customer-order-product links, etc.).
Large knowledge base files (text documents, PDFs, etc.) that can be uploaded and pulled on demand using embeddings to decide which files are relevant.
Everything stays inside the single Yggdrasil framework (custom memory nodes, not a full external GreptimeDB).
No constant network calls for every small read — data should be in “memory locations” (local or fast-access nodes) where possible, while still supporting distribution.

This is a strong, coherent design. It keeps the skeptical spirit of Claude Code but scales it to multi-tenant, distributed reality.

Per-Tenant Isolation

Each tenant gets its own logical memory namespace (e.g., tenant_abc123/).
Inside each namespace:
MEMORY.md (lightweight index — per tenant)
logs/ directory or Parquet tables for conversation history
knowledge/ for large uploaded files + their embeddings
graph/ for relationship data

Storage Strategy

Logs & Conversations → Stored in Parquet files (columnar, efficient for temporal data).
One Parquet table per tenant per day (e.g. tenant_abc123/logs/2026-04-08.parquet).
Schema columns: timestamp, turn_id, actor (user / model / daemon / tool), content, thinking (model monologue), tool_calls, tool_results, corrections, trace_id.
This makes logs immutable, queryable, and cheap to store long-term.

MEMORY.md Index → One small Markdown file per tenant (kept in fast local cache + replicated to memory nodes).
Contains short pointers like:text- customer:98765 → order:ORD-4452 (last updated 2026-04-08)
- product:XYZ → stock_level:low (verified against inventory)
- conversation_topic:refunds → see logs/2026-04-07.parquet:turn_42

Large Knowledge Base Files → Stored in cloud/object storage (S3-compatible).
Metadata + embeddings stored in the memory node.
When needed, Context Assembly uses embeddings to decide which files to download and inject.

Graph Relationships → Stored as a separate graph layer inside the memory node.
Simple key-value + adjacency list (e.g. using a small embedded graph DB like petgraph or a Parquet-based edge table).
Example: customer → order → product, order → payment_status, etc.
Can be queried via a query_graph(entities) operation.

Recommended Approach for Yggdrasil (Balanced & Practical)
We will do a lightweight hybrid that gives you most of the power of Neo4j without the complexity:

Persistent History Layer — Parquet (edges_history.parquet)
Every relationship creation, update, or deletion is appended as an immutable record.
This is your audit trail and source of truth.

Live Graph Layer — In-memory adjacency list + lightweight persistent snapshot
For each tenant, keep an in-memory graph using petgraph (or a simple HashMap + Vec of edges).
This is the "fast traversal" layer — exactly like Neo4j’s pointer following, but in RAM.
Periodically (by the daemon), we write a snapshot of the current live graph to a small Parquet file (current_graph.parquet) for durability.

How Changes Are Handled
When a relationship changes (new order, correction, preference update):
Append the change to edges_history.parquet (immutable).
Immediately update the in-memory adjacency list for that tenant.

The daemon runs periodic reconciliation to make sure the in-memory graph matches the latest history.


This gives you:

Fast traversal (in-memory pointer following, just like Neo4j).
Full history and auditability (Parquet).
Correct, up-to-date relationships (live graph is always current).
Simple storage (only Parquet + in-memory structures — no custom binary format).

How Context Assembly Uses It

It asks the live graph: get_subgraph(entities, depth=2)
The in-memory graph quickly returns the relevant relationships as clean text/Markdown.
If needed, it can also pull historical context from the Parquet history.

This is the honest best balance for V1: you get Neo4j-like intelligence and speed for relationships without the heavy engineering cost.

# Greptime Storage and Query Internals for Memory-Nodes Design (`grep_mem.md`)

## 1) Scope and Evidence Base

This document is a code-guided architecture dissection of the Greptime snapshot currently present in this repo, focused on:

- how data is ingested and persisted
- how it is turned into Parquet/SST and uploaded to object storage
- how it is indexed/manifested/garbage-collected
- how queries are planned and executed back from storage
- how region/partition management and caches are wired

Important context:

- The repository snapshot mainly contains module-level generated docs (`*.md`) for Greptime source files, not full raw `.rs` files for most modules.
- So this write-up is precise to the available docs and contracts, with explicit callouts where low-level implementation internals are summarized rather than line-by-line raw code.

Primary modules used in this analysis include:

- `src/mito2/*` (engine, region, WAL, memtable, flush, compaction, access layer, GC, cache)
- `src/store-api/*` (region engine traits, storage requests/types, path layout, manifest contracts)
- `src/log-store/*` (Kafka and RaftEngine WAL backends)
- `src/object-store/*` and `src/common/datasource/*` (object storage abstraction + parquet writer stack)
- `src/datanode/*` (RegionServer and node lifecycle)
- `src/query/*` and `src/partition/*` (query planning/execution and partition routing)

---

## 2) System Shape at a Glance

Greptime storage path is a layered design:

1. **Region API layer** (`RegionServer`, `RegionEngine`) accepts region-level writes/reads.
2. **WAL layer** persists mutations first (Kafka or RaftEngine provider).
3. **Memtable layer** holds recent in-memory mutable/immutable data.
4. **Flush path** converts immutable memtables into **SST files (Parquet)**.
5. **Manifest layer** records metadata actions (add/remove SST, schema/option changes) with checkpointing.
6. **Compaction/GC** merges SSTs and eventually removes obsolete files/indexes.
7. **Object store layer** stores SST/index/manifests (S3/OSS/GCS/Azure/FS via OpenDAL).
8. **Query layer** (DataFusion + distributed region query handling) reads memtable + SST, prunes and merges results.

Greptime terms to keep straight:

- **Region**: physical storage unit and request boundary.
- **Partition rule**: logical routing rule that maps filters/keys to regions.
- **SST**: persisted on-disk/object-store file set (Parquet + optional index artifacts).
- **Manifest**: authoritative metadata log/checkpoint for region state over time.

---

## 3) Region and Partition Management (the “region manager” story)

## 3.1 `RegionServer` as runtime region manager

`RegionServer` (`src/datanode/05-region-server.md`) is the datanode-local control plane for regions.

Core internals:

- `engines: RwLock<HashMap<String, RegionEngineRef>>`
- `region_map: DashMap<RegionId, RegionEngineWithStatus>`
- `query_engine: QueryEngineRef`
- optional `mito_engine` handle
- region lifecycle event listener + query parallelism controls

Region lifecycle status machine inside server map:

- `Registering`
- `Ready`
- `Deregistering`

It handles:

- single and batch open/catchup requests
- request dispatch to correct engine
- role transitions (leader/follower/downgrading/staging)
- remote read serving (Arrow Flight) and local reads

## 3.2 Partition routing to regions

Partition module (`src/partition/src/lib.md`) provides logical partition rules and pruning/routing contracts:

- hash/range/list-style routing models
- `PartitionRule` abstraction (`find_region`, `find_regions`)
- overlap/collision/checking/splitting helpers for distributed scans

Meta-based partition expression fetcher (`src/datanode/28-partition-expr-fetcher.md`) loads partition expression from table route metadata (KV) during region open/validation.

## 3.3 Region roles and transitions

`store-api` region engine contract (`src/store-api/topic-region_engine.md`) defines role/state semantics:

- `Follower`
- `Leader`
- `DowngradingLeader`
- plus settable state `StagingLeader`

This matters because write acceptance, compaction/checkpoint behavior, and catch-up behavior are role-sensitive.

---

## 4) Storage Layout and IDs

## 4.1 Path layout

Path utility contracts (`src/store-api/topic-path_utils.md`):

- `DATA_DIR = "data/"`
- `WAL_DIR = "wal"`
- `CLUSTER_DIR = "cluster/"`

Canonical region naming format:

- `region_name(table_id, region_sequence) -> "{table_id}_{region_seq:010}"`

Canonical layout:

- `data/{catalog}/{schema}/{table_id}/{table_id}_{region_seq:010}/...`

This structure works for both local files and object store keys.

## 4.2 File identity model

`src/store-api/topic-storage_file.md`:

- `FileId` is UUID-backed (globally unique SST identity)
- `FileRef` couples `region_id + file_id + index_version`
- `FileRefsManifest` tracks active refs, manifest version, and cross-region refs
- `GcReport` tracks deleted files/indexes and retry-needed regions

Cross-region refs are explicitly modeled for repartition/migration scenarios.

## 4.3 Reserved internal columns and sequence semantics

`src/store-api/topic-storage_consts.md` + `topic-storage_types.md`:

- internal columns like `__sequence`, `__op_type`, `__primary_key`
- sequence numbers (`u64`) are central for write ordering, dedup, replay boundaries
- `SequenceRange` allows precise read filtering by sequence interval

---

## 5) WAL Layer: Durability Before Memtable

Mito write path explicitly follows **WAL first, memtable second** (`src/mito2/src/region_write_ctx.md`).

## 5.1 Provider abstraction

Provider model (`src/store-api/topic-logstore_provider.md`):

- `Provider::RaftEngine`
- `Provider::Kafka`
- `Provider::Noop`

`Provider` identifies WAL namespace and backend behavior.

## 5.2 Kafka WAL backend

`src/log-store/topic-kafka-log-store-rs.md`:

- distributed WAL using Kafka topic namespaces
- supports entry chunking for large entries (`First/Middle/Last` multipart record types)
- async producer/consumer path
- offset tracking and stats (`PeriodicOffsetFetcher`)
- `append_batch`, `read`, `obsolete`, namespace management

Notable behavior:

- Kafka offset becomes authoritative replay entry ID in read path.
- entries are grouped by region for ordered production.

## 5.3 RaftEngine WAL backend

`src/log-store/topic-raft-engine-log-store-rs.md`:

- local embedded WAL using `raft-engine`
- enforces entry continuity and prevents overriding compacted entries
- background periodic tasks for file purge and sync
- stream-based read batches
- namespace = region identity model

Both WAL backends expose the same `LogStore` contract (`append_batch`, `read`, `obsolete`, `latest_entry_id`, namespace ops).

---

## 6) Write Path: From API Request to Persistent SST

## 6.1 Request ingress to worker

Request model (`src/mito2/src/request.md`) separates:

- write operations
- DDL operations
- background notifications (flush/compaction/gc completion/failure)

`WorkerGroup`/`RegionWorkerLoop` (`src/mito2/src/worker.md`) routes region requests by region hash/index and executes main state transitions.

## 6.2 `RegionWriteCtx` lifecycle

`src/mito2/src/region_write_ctx.md`:

1. Construct write context with current region version state.
2. Buffer mutations and assign sequence numbers/entry IDs.
3. Build WAL entry.
4. Persist WAL entry.
5. Write buffered mutation into mutable memtable.
6. Notify waiters via notifier-on-drop semantics.

Failure rule is explicit:

- if WAL write fails, memtable write is skipped.

This is a critical durability contract.

## 6.3 Memory pressure and stalling/rejection

`flush.rs` docs (`src/mito2/src/flush.md`) + write handler summary:

- global write buffer manager tracks mutable+immutable memory usage
- flush trigger when mutable threshold reached
- hard pressure can stall and eventually reject writes

Write buffer manager interface:

- `should_flush_engine()`
- `should_stall()`
- `reserve_mem()`, `free_mem()`, etc.

This is where backpressure happens before OOM-level failure.

## 6.4 Flush to SST

Flush workflow (`src/mito2/src/flush.md`, `src/mito2/src/access_layer.md`):

1. Freeze mutable memtable into immutable set (versioned snapshot semantics).
2. `AccessLayer::write_sst(...)` iterates source rows.
3. Build Parquet + index artifacts.
4. Upload artifacts to object store.
5. Manifest edit records new files.
6. Region version is atomically moved to include new SSTs and remove flushed memtables.

Flush reasons include: manual, memory pressure, alter, periodic, staging transitions, close/downgrade.

---

## 7) Parquet and SST Mechanics

## 7.1 SST formats

From `src/mito2/src/sst.md`:

- `FormatType::PrimaryKey` (Parquet with PK encoding)
- `FormatType::Flat` (flat Parquet)

SST combines:

- Parquet data file
- optional index side files (bloom/inverted/fulltext/vector related artifacts, depending on config)

## 7.2 Parquet write implementation details

From datasource parquet stack:

- `stream_to_parquet(...)` (`src/common/datasource/file_format/parquet.md`)
- OpenDAL writer is wrapped by `AsyncWriter` bridge (`src/common/datasource/parquet_writer.md`)
- writer used via async Arrow/Parquet writer

Important defaults/choices:

- compression: **ZSTD**
- timestamp columns:
  - dictionary encoding disabled
  - encoding set to `DELTA_BINARY_PACKED`
- write buffer defaults around multipart-friendly sizes (`DEFAULT_WRITE_BUFFER_SIZE = 8MB`), intentionally > S3 5MB minimum

## 7.3 AccessLayer timing decomposition

`src/mito2/src/access_layer.md` tracks write stage timing:

- source iteration
- batch writing
- index update
- parquet upload
- index upload

So you can isolate whether bottlenecks are encode CPU, storage network, or indexing.

---

## 8) Object Storage Upload and Cloud Integration

## 8.1 Unified object store abstraction

`src/object-store/src/lib.md`:

- OpenDAL-backed `ObjectStore` abstraction
- multiple schemes (S3, GCS, OSS, Azure blob, FS, HTTP)
- layered middleware support (retry, tracing, logging, metrics, optional cache)

## 8.2 Backend creation and URL routing

`src/common/datasource/object_store.md` routes by scheme:

- `s3://...` -> S3 builder
- `oss://...` -> OSS builder
- filesystem path/`fs://` -> FS builder

## 8.3 S3 behavior

`src/common/datasource/object_store/s3.md`:

- supports endpoint, region, access key, secret, session token, virtual-host mode, EC2 metadata toggle
- middleware stack includes:
  - retry with jitter
  - logging
  - tracing
  - Prometheus metrics

This is the exact cloud upload/read plumbing used by Parquet/object artifacts.

## 8.4 Atomic write conventions

Object-store constants include temp write directories:

- `ATOMIC_WRITE_DIR = "tmp/"`
- legacy `OLD_ATOMIC_WRITE_DIR = ".tmp/"`

Meaning: writes are staged then finalized to reduce partial-write visibility.

---

## 9) Manifest, Versioning, and Recovery Model

## 9.1 Manifest architecture

Manifest subsystem (`src/mito2/src/manifest.md`, `src/store-api/topic-manifest_storage.md`, `topic-manifest_action.md`):

- append action logs for metadata transitions
- periodic checkpoints for compact recovery snapshots
- replay = last checkpoint + subsequent log actions

Manifest storage trait supports:

- `scan(start,end)`
- `save(version, bytes)`
- checkpoint save/load/delete
- delete ranges and full cleanup

## 9.2 Version control in region

`src/mito2/src/region/version.md`:

- region version is immutable snapshot of metadata + memtable state + SST view
- updates use copy-on-write/replace pattern via `VersionBuilder`
- readers observe consistent snapshot while writes proceed on newer versions

## 9.3 Region open/catchup

`src/mito2/src/region/opener.md` and `region/catchup.md`:

- region open wires metadata, manifest manager, access layer, memtable builders, WAL readers
- catchup task replays WAL into memtable state (local or remote WAL mode)
- can enforce expected last entry IDs for correctness checks

This is the crash/restart and migration durability bridge.

---

## 10) Compaction, File Lifecycle, and Garbage Collection

## 10.1 Compaction

`src/mito2/src/compaction.md`, `compaction/twcs.md`:

- merges many small SSTs into fewer larger SSTs
- strategies include TWCS focus for time-series workloads
- picker selects candidate groups
- compactor reads/merges/writes new SST outputs and updates metadata

TWCS controls include:

- trigger file count
- time window size
- max output file size
- append mode behavior

## 10.2 GC semantics

`src/mito2/src/gc.md`:

- deletes manifest-removed files after linger window
- optionally performs full listing to discover orphan files not in manifest
- respects temporary refs (in-flight query protection)
- invalidates cache for deleted files

Key timing concepts:

- expel time
- lingering time
- unknown file lingering time

GC supports incremental and full modes, with concurrency limits via semaphores.

---

## 11) Query Path: How Data Is Read Back From Memtable/SST/Object Store

## 11.1 Planner and execution engine

`src/query/src/datafusion.md`, `src/query/src/query_engine.md`:

- query parsing/planning done through DataFusion integration
- logical plan -> optimization -> physical plan -> stream execution
- distributed planning hooks and parallel scan hints are integrated

## 11.2 Distributed region reads

`src/query/src/region_query.md`:

- `RegionQueryHandler` abstraction routes query requests across regions
- read preference can target leader/follower/any/specific region
- region outputs are merged (merge scan path)

## 11.3 Region engine scan contract

`src/store-api/topic-region_engine.md` and storage request types:

- `RegionEngine::handle_query` returns a `RegionScanner`
- `ScanRequest` carries:
  - projection
  - filters (pushdown)
  - ordering/limit hints
  - memtable and SST sequence boundaries
  - time-series selector/distribution
  - optional vector search clause

## 11.4 Reading Parquet from object store

Parquet reader path (`src/common/datasource/file_format/parquet.md`):

- `LazyParquetFileReader` defers open until needed
- metadata and byte-ranges are fetched asynchronously via object store reader
- this enables selective reading and avoids loading full files eagerly

In practice, query path becomes:

1. scan request -> region scanner
2. scanner combines memtable + selected SST file streams
3. SST readers pull Parquet ranges from object store
4. results merged/deduped/sorted as needed
5. DataFusion executes final operator graph and returns stream

## 11.5 Parallel scan optimization

`src/query/src/optimizer/parallelize_scan.md`:

- region scan ranges redistributed across partitions using balancing heuristics
- improves parallelism and can reduce tail latency on large scans

---

## 12) Cache Topology

Caches are multi-layered:

## 12.1 Mito cache module (`src/mito2/src/cache/index.md`)

- file cache (SST hot data/metadata)
- index caches (bloom/inverted/etc.)
- write cache (hot recent writes)
- manifest cache (metadata)

Design intent is workload-shaped caching rather than a single generic cache.

## 12.2 AccessLayer-level cache use

`AccessLayer` includes optional cache manager/file cache references and is the convergence point for SST read/write cache interaction.

## 12.3 Object-store middleware cache

Object store module supports optional layered cache middleware (LRU-style layer capability) in addition to telemetry/retry/tracing layers.

## 12.4 Query memory controls

Mito/query docs mention query memory tracking and scan memory budgets to avoid unrestricted memory growth during large scans.

---

## 13) End-to-End Lifecycle Summaries

## 13.1 Write lifecycle (durable path)

1. Client request reaches `RegionServer`.
2. Request routed to region worker.
3. `RegionWriteCtx` batches rows and allocates sequence/entry IDs.
4. WAL entry appended (Kafka or RaftEngine).
5. Rows written to mutable memtable.
6. Memory pressure or policy triggers flush.
7. Immutable memtable converted to Parquet SST via `AccessLayer`.
8. SST/index files uploaded to object store.
9. Manifest action persisted; region version updated.
10. Compaction later merges SSTs; GC eventually removes obsolete files.

## 13.2 Read lifecycle (query path)

1. SQL/PromQL parsed and planned by query engine.
2. Distributed planner resolves target regions via partition/routing.
3. Region engine creates scanner with filter/projection/sequence constraints.
4. Scanner reads from memtable + relevant SST files.
5. Parquet readers fetch metadata/ranges from object store asynchronously.
6. Intermediate streams merged/coalesced/optimized.
7. Final record batch stream returned.

---

## 14) What This Means for Yggdrasil Memory-Node Design

Directly reusable ideas if you are building distributed memory nodes:

1. **Region as failure and ownership unit**
   - keep ingestion/query/compaction scoped per region
   - manage role transitions explicitly

2. **WAL provider abstraction**
   - local WAL and remote WAL under one contract
   - preserve replay semantics independent of backend

3. **Versioned immutable snapshots**
   - readers always see stable snapshot while writers advance version

4. **Manifest + checkpoint model**
   - append metadata actions, periodically checkpoint
   - recover from checkpoint + deltas

5. **Asynchronous Parquet range reads**
   - object-store fetch by ranges, not full file loads

6. **GC with linger + active-reference protection**
   - avoid deleting files still needed by long-running queries

7. **Cache layering, not monolith cache**
   - separate data, index, write, and metadata cache concerns

---

## 15) Explicit Gaps in This Snapshot (So There Are No Hidden Assumptions)

Because this repo snapshot mostly contains generated module docs and not complete raw source for all files, these are the only unresolved depths:

- exact low-level implementations of some short modules that are summarized in 8-line docs (for example several `mito2/src/sst/parquet/*` internals and some cache submodules)
- exact byte-level file naming conventions for every index sidecar variant
- every branch-level error path in compact/flush/read workers

These are implementation-depth gaps, not architecture-flow gaps. The end-to-end persistence/query pipeline, ownership boundaries, and component contracts are covered above from available sources.

---

## 16) Source Index Used

- `src/mito2/README.md`
- `src/mito2/src/engine.md`
- `src/mito2/src/worker.md`
- `src/mito2/src/region.md`
- `src/mito2/src/region/opener.md`
- `src/mito2/src/region/version.md`
- `src/mito2/src/region/catchup.md`
- `src/mito2/src/region_write_ctx.md`
- `src/mito2/src/request.md`
- `src/mito2/src/wal.md`
- `src/mito2/src/memtable.md`
- `src/mito2/src/memtable/partition_tree.md`
- `src/mito2/src/flush.md`
- `src/mito2/src/access_layer.md`
- `src/mito2/src/sst.md`
- `src/mito2/src/manifest.md`
- `src/mito2/src/remap_manifest.md`
- `src/mito2/src/compaction.md`
- `src/mito2/src/compaction/twcs.md`
- `src/mito2/src/gc.md`
- `src/mito2/src/cache/index.md`
- `src/store-api/topic-region_engine.md`
- `src/store-api/topic-storage_requests.md`
- `src/store-api/topic-storage_types.md`
- `src/store-api/topic-storage_file.md`
- `src/store-api/topic-sst_entry.md`
- `src/store-api/topic-metadata.md`
- `src/store-api/topic-manifest_storage.md`
- `src/store-api/topic-manifest_action.md`
- `src/store-api/topic-logstore_provider.md`
- `src/store-api/topic-path_utils.md`
- `src/store-api/topic-mito_engine_options.md`
- `src/log-store/topic-log-store-overview.md`
- `src/log-store/topic-kafka-log-store-rs.md`
- `src/log-store/topic-raft-engine-log-store-rs.md`
- `src/log-store/topic-raft-engine-backend-rs.md`
- `src/object-store/src/lib.md`
- `src/common/datasource/lib.md`
- `src/common/datasource/object_store.md`
- `src/common/datasource/object_store/s3.md`
- `src/common/datasource/object_store/fs.md`
- `src/common/datasource/parquet_writer.md`
- `src/common/datasource/file_format/parquet.md`
- `src/datanode/03-datanode.md`
- `src/datanode/05-region-server.md`
- `src/datanode/28-partition-expr-fetcher.md`
- `src/query/src/datafusion.md`
- `src/query/src/region_query.md`
- `src/query/src/optimizer/parallelize_scan.md`
- `src/partition/src/lib.md`
