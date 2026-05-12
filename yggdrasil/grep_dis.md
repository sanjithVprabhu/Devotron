# Greptime Distributed-System Deep Dive (`grep_dis.md`)

## 1) Scope, Method, and Evidence Quality

This document is a source-guided dissection of how Greptime's distributed system works in this repository snapshot, with focus on:

- control plane (metasrv leadership, metadata, coordination)
- data plane (datanode/frontend/flownode behavior)
- node-to-node communication (gRPC + heartbeat + mailbox + cache invalidation)
- synchronization, liveness, failover, and recovery mechanics

Important evidence note:

- In this repo snapshot, almost all Greptime source is represented as generated module docs (`*.md`) rather than raw `.rs` implementation files.
- Only one raw Rust file exists in-tree; all other behavior is inferred from module docs/contracts.
- So this write-up is comprehensive against available code documentation, and explicitly marks where low-level implementation details are summarized rather than line-by-line proven.

---

## 2) Cluster Topology and Node Roles

Greptime distributed mode is built around four runtime roles:

1. `metasrv` (control-plane authority)
- leader election
- metadata storage and coordination
- procedure orchestration (DDL, migration, reconcile)
- node health and lease tracking
- instruction dispatch to runtime nodes

2. `datanode` (storage/data-plane executor)
- hosts regions
- applies region lifecycle instructions (open/close/upgrade/downgrade/sync/flush/gc)
- reports region + node stats in heartbeat

3. `frontend` (query/API ingress)
- protocol endpoints (HTTP/gRPC/MySQL/Postgres/etc.)
- distributed query routing to region leaders via partition metadata
- heartbeat with metasrv for instructions (cache invalidation, suspend)

4. `flownode` (flow/pipeline executor)
- participates in lease/heartbeat and instruction ecosystem
- tracked as independent node class in discovery and mailbox channels

Control-plane authority is explicitly centralized to metasrv leader semantics; followers proxy/selectively serve reads depending on subsystem.

---

## 3) Bootstrap and Service Surfaces

### 3.1 Metasrv bootstrap

`meta-srv/bootstrap` wires:

- KV backend (memory/etcd/RDS variants)
- election implementation
- selector strategy (`RoundRobin`, `LoadBased`, `LeaseBased`)
- gRPC services + admin HTTP surface
- peer client and cache behavior

### 3.2 Metasrv gRPC services

Core gRPC services exposed by metasrv:

- `HeartbeatService`
- `ClusterService`
- `StoreService`
- `ProcedureService`
- mailbox/admin-adjacent services

### 3.3 Runtime nodes startup

- Datanode builds `RegionServer`, opens assigned regions, then starts heartbeat task.
- Frontend builds `Instance` + protocol servers, then starts heartbeat task.
- Flownode starts similarly with its own heartbeat + service wiring.

Distributed mode is activated by metasrv client presence; standalone mode bypasses control-plane heartbeat/coordination.

---

## 4) Leadership Model (Metasrv Core)

## 4.1 Election contract

Election subsystem supports etcd and RDS-style backends, with common semantics:

- candidate lease seconds: `600`
- keep-alive interval: `candidate_lease / 2`
- leader-change broadcast channel (`Elected`, `StepDown`)

`Election` trait includes:

- `is_leader()`
- `in_leader_infancy()` (first-cycle-after-election behavior)
- `campaign()`, `leader()`, `resign()`
- candidate registration/listing

`in_leader_infancy()` is a key operational detail: enables one-time leader initialization logic without repeating it on every request.

## 4.2 Metasrv state transitions

Metasrv state model:

- `Leader(LeaderState { enable_leader_cache, server_addr })`
- `Follower(FollowerState { server_addr })`

Transitions are explicit (`become_leader`, `become_follower`) and represented under shared `Arc<RwLock<State>>`.

## 4.3 Leadership coupling to procedures

Procedure manager is leadership-coupled:

- `on_leader_start`: start procedure manager
- `on_leader_stop`: stop procedure manager

This prevents split execution of distributed procedures during leadership changes.

---

## 5) Metadata Consistency Plane (KV + Cache + Routing)

## 5.1 KV backend abstraction

`KvBackend` provides distributed metadata primitives:

- `range`, `put`, `batch_put`, `batch_get`, `delete_range`, `batch_delete`
- CAS-style operations (`compare_and_put` via transactions)

This is the base consistency substrate for metadata.

## 5.2 MetaPeerClient leader/follower behavior

`MetaPeerClient` is cluster-aware:

- if local node is leader: read from local in-memory backend
- if follower: route read RPC to leader
- retries on `IsNotLeader` and IO-like leader-transition errors

This keeps follower behavior consistent with moving leadership.

## 5.3 Leader-side cache

`LeaderCachedKvBackend` caches metadata only when current metasrv is leader:

- leader cache hit path for fast reads
- follower pass-through behavior
- version checks/invalidation on conflict-prone operations (CAS/txn patterns)

Cache preloading is tied to key-prefix sets (`table_name`, `catalog_name`, `schema_name`, `table_route`, `node_address`).

## 5.4 Distributed ID and lock primitives

Two critical consistency building blocks:

1. Sequence allocator
- range allocation + CAS in KV
- monotonic unique IDs across cluster
- local batch cache for performance

2. Lock keys
- catalog/schema/table/region/flow/topic lock domains
- read/write lock modes (`Share`/`Exclusive`)
- prevents concurrent conflicting procedures

---

## 6) Time, Lease, and Failure-Detection Contracts

From distributed constants:

- base heartbeat interval: `3s`
- frontend heartbeat interval: `base * 6` (18s)
- region lease: `heartbeat*3 + 1s` (default 10s)
- datanode lease: same as region lease
- flownode lease: same pattern
- metasrv leader lease: `5s`
- metasrv keepalive interval: `meta_lease/2`
- heartbeat channel HTTP2 keepalive interval: `15s`
- heartbeat keepalive timeout: `5s`
- default mailbox RTT timeout: `1s`

Failure detection in metasrv uses Phi Accrual strategy (Akka-style):

- probabilistic suspicion (`phi`)
- configurable threshold (default `8.0`)
- rolling heartbeat history and adaptive sensitivity

This is stronger than fixed-timeout detectors under jittery network conditions.

---

## 7) Node Discovery and Placement

## 7.1 Discovery

Peer discovery exposes:

- active frontends
- active datanodes (optional workload filter)
- active flownodes (optional workload filter)
- specific-node resolver by ID

Activity is lease-driven: missing heartbeats eventually remove node from active set.

## 7.2 Placement/allocation

Selectors:

- `RoundRobin`
- `LeaseBased`
- `LoadBased` (weighted by datanode stats/workload)

Allocator enforces constraints:

- min required peers
- optional max item cap
- optional exclusions

This drives region placement and migration target selection.

---

## 8) Inter-Node Communication Fabric

Greptime uses multiple communication lanes concurrently.

## 8.1 gRPC request/response APIs

Used for:

- metadata operations
- store operations
- procedure submission/query
- cluster peer queries

Leader checks are enforced for leader-only operations via shared service macros/utilities.

## 8.2 Bidirectional heartbeat streams

All runtime nodes maintain heartbeat streams to metasrv.

General flow:

1. node opens bidirectional stream
2. first message acts as handshake/registration context
3. node sends periodic status heartbeats
4. metasrv responds with lease + instructions + mailbox messages
5. stream aborts on leadership mismatch; client reconnects

## 8.3 Mailbox subsystem (async command/reply)

Mailbox supports:

- point-to-point send with timeout (`send`)
- fire-and-forget (`send_oneway`)
- broadcast by role class (`broadcast`)
- async response correlation (`on_recv`) via message IDs

Channels are role-scoped:

- datanode
- frontend
- flownode

Broadcast ranges and pusher registration are explicit; pending receivers fail if pusher disappears.

## 8.4 PubSub

PubSub includes topic-based message fanout (documented heartbeat topic), decoupling publishers from consumers for event pipelines.

---

## 9) Heartbeat Pipeline (What Actually Keeps the System Alive)

## 9.1 Metasrv side

Metasrv heartbeat service:

- accepts streams from datanode/frontend/flownode
- validates leader status continuously
- maintains pusher registry for reverse push
- runs handler chain to build heartbeat response

Handler group model composes heartbeat processing stages and accumulates response artifacts (`header`, mailbox message, stat, inactive regions, region lease).

## 9.2 Datanode side

Datanode `HeartbeatTask` does three jobs continuously:

1. send periodic heartbeat payload
- peer identity
- region stats
- topic stats
- workload types
- node epoch
- resource usage
- extensions (ex: GC stats)

2. receive and dispatch instruction responses
- instruction parsing
- suspend/invalidate handling
- region operation handler dispatch

3. maintain stream health
- reconnect with retry/backoff on failure
- update intervals/config from metasrv response

## 9.3 Frontend side

Frontend `HeartbeatTask` similarly:

- sends node info + resource stats periodically
- sends mailbox outbounds immediately when needed
- handles incoming instruction messages (notably cache invalidation and suspend behavior)
- retries stream establishment on disconnect

---

## 10) Region Synchronization and Role Safety on Datanode

## 10.1 Region server state model

`RegionServer` tracks region engine status (`Registering`, `Ready`, `Deregistering`) and supports:

- batch open/catchup
- read/write request dispatch
- role transitions with graceful semantics
- suspend-aware query rejection paths

## 10.2 Region lease enforcement (`RegionAliveKeeper`)

This is the core local liveness guardrail:

- per-region countdown tasks
- deadlines reset from granted region leases in heartbeat responses
- first startup deadline uses `4x heartbeat interval` grace
- on deadline expiry, region role is forced away from writable leader path

It also processes `closeable_region_ids` from metasrv lease response to close stale regions.

## 10.3 Instruction handlers and sync-critical transitions

Datanode instruction handlers include:

- `OpenRegions`
- `CloseRegions`
- `FlushRegions` (sync/async, fail-fast/try-all)
- `DowngradeRegions` (leader -> downgrading -> follower, optional flush with timeout)
- `UpgradeRegions` (catchup + set writable)
- `SyncRegions` (from manifest or other region source)
- `EnterStagingRegions`
- `ApplyStagingManifests`
- `RemapManifest`
- `GetFileRefs`
- `GcRegions`

Long-running operations are guarded by task trackers with dedup semantics (`Busy` vs `Running` registration and watcher-based completion).

---

## 11) Distributed Query Routing Path

In distributed mode frontend region reads use:

1. partition manager resolves leader for target region
2. node manager fetches/uses datanode client
3. query forwarded to datanode
4. stream result returned to frontend and then client

Read preference exists at API level, but leader routing is central for consistency-sensitive paths.

---

## 12) DDL and Multi-Step Coordination

Procedures are the distributed mutation framework:

- create/drop/alter table/database/view/flow
- region migration/repartition/reconciliation/wal prune
- progress tracking and resumability patterns

Procedure utilities explicitly use mailbox-driven datanode instructions (e.g., region flush before certain transitions), with retry/ignore strategies for transient channel failures.

Lock-key hierarchy and sequence allocator are foundational for safe concurrent DDL execution.

---

## 13) Cache-Coherence Story Across the Cluster

Cache invalidation is explicit and instruction-based:

1. metadata mutation computes `CacheIdent` set
2. metasrv builds `Instruction::InvalidateCaches`
3. mailbox broadcast to frontends + datanodes + flownodes
4. each node invalidates local cache keys derived from cache identifiers

This avoids waiting for TTL expiry and keeps routing/schema state fresh after writes.

---

## 14) Failure and Recovery Scenarios (Step-by-Step)

## 14.1 Metasrv leader failover

1. leader lease/election state changes
2. follower wins election
3. old leader heartbeat streams return not-leader/abort semantics
4. clients retry and reconnect to new leader
5. leader-coupled services (procedure manager, caches) switch behavior

## 14.2 Datanode heartbeat loss

1. lease entry ages out in metasrv discovery
2. node removed from active candidate lists
3. region lease renewals stop arriving at datanode
4. local countdown tasks expire and writable role is revoked
5. placement/migration/procedure layer can rebalance around missing node

## 14.3 Instruction timeout or mailbox breakage

1. mailbox receiver times out or pusher disappears
2. error surfaced with timeout/channel-closed semantics
3. procedure utility chooses retry/ignore based on operation strategy
4. eventual state converges via retry or supervisory compensation procedures

## 14.4 Upgrade/downgrade mismatch recovery

- upgrade waits for catchup and timeout-bounds readiness
- downgrade can force graceful demotion even if flush path is slow/failing
- explicit reply payload includes readiness/error context for control-plane decisions

---

## 15) What "Always in Sync" Means Here (Precise, Not Marketing)

Greptime synchronization model is mixed, by subsystem:

1. Strong/serialized (control plane)
- metadata writes through leader + transactional KV/CAS primitives
- lock-scoped procedure coordination

2. Lease-consistent soft state (node liveness/placement)
- active node sets derived from lease/heartbeat recency
- not instant but bounded by heartbeat/lease timing

3. Eventually convergent async state
- mailbox/pubsub instruction propagation
- cache invalidation fanout
- procedure retries on transient failures

So "always sync" is achieved as bounded convergence under continuous heartbeat + lease renewal + leader authority, not strict global linearizability for every runtime datapath.

---

## 16) Operational Liveness Guardrails

The system stays "alive" through layered safeguards:

- heartbeat bidirectional streams with reconnect loops
- lease expiration safety (auto-demotion from writable roles)
- leader checks on leader-only APIs
- adaptive failure detector for noisy networks
- task dedup + timeout controls in region operations
- admin runtime switches (maintenance/recovery/procedure pause)
- circuit-like behavior through retryable error classification and retry limits

---

## 17) Boundaries and Unresolved Depth (From This Snapshot)

Because raw `.rs` internals are mostly absent in this snapshot, the following are inferred from module contracts and docs rather than audited implementation lines:

- exact heartbeat handler ordering details inside some metasrv sub-handlers
- exact semantics of all `common_meta::heartbeat::handler/mailbox` internals
- low-level network/channel tuning in each gRPC client implementation
- precise ordering guarantees of all instruction reply races under stress

What is still high-confidence from available evidence:

- role model and leadership gating
- lease timing and failure-detection contracts
- instruction taxonomy and region transition semantics
- cache invalidation fanout mechanism
- procedure-leader coupling

---

## 18) Code Map Used for This Analysis

Primary evidence files:

- `src/meta-srv/src/bootstrap.md`
- `src/meta-srv/src/election.md`
- `src/meta-srv/src/state.md`
- `src/meta-srv/src/cluster.md`
- `src/meta-srv/src/discovery.md`
- `src/meta-srv/src/failure_detector.md`
- `src/meta-srv/src/service/heartbeat.md`
- `src/meta-srv/src/service/cluster.md`
- `src/meta-srv/src/service/store.md`
- `src/meta-srv/src/service/mailbox.md`
- `src/meta-srv/src/service/procedure.md`
- `src/meta-srv/src/cache_invalidator.md`
- `src/meta-srv/src/procedure.md`
- `src/meta-srv/src/procedure/utils.md`
- `src/common/meta/distributed_time_constants.md`
- `src/common/meta/kv_backend.md`
- `src/common/meta/peer.md`
- `src/common/meta/instruction.md`
- `src/common/meta/datanode.md`
- `src/common/meta/region_registry.md`
- `src/common/meta/lock_key.md`
- `src/common/meta/sequence.md`
- `src/common/meta/cache_invalidator.md`
- `src/common/meta/key.md`
- `src/meta-client/src/lib.md`
- `src/meta-client/src/client/*.md`
- `src/datanode/03-datanode.md`
- `src/datanode/05-region-server.md`
- `src/datanode/06-heartbeat.md`
- `src/datanode/07-heartbeat-handler.md`
- `src/datanode/08-handler-open-region.md`
- `src/datanode/09-handler-close-region.md`
- `src/datanode/10-handler-flush-region.md`
- `src/datanode/11-handler-downgrade-region.md`
- `src/datanode/12-handler-upgrade-region.md`
- `src/datanode/13-handler-gc-worker.md`
- `src/datanode/14-handler-enter-staging.md`
- `src/datanode/15-handler-apply-staging-manifest.md`
- `src/datanode/16-handler-sync-region.md`
- `src/datanode/17-handler-remap-manifest.md`
- `src/datanode/18-handler-file-ref.md`
- `src/datanode/19-task-tracker.md`
- `src/datanode/20-alive-keeper.md`
- `src/datanode/24-event-listener.md`
- `src/frontend/src/frontend.md`
- `src/frontend/src/heartbeat.md`
- `src/frontend/src/server.md`
- `src/frontend/src/instance/builder.md`
- `src/frontend/src/instance/region_query.md`
- `src/query/src/region_query.md`

