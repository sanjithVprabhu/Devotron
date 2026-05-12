# Context Assembler Specification (Locked V1)

## 1. Purpose and Placement

Context Assembler is the deterministic pre-model pipeline executed at the top of each core-loop iteration.

It produces a `ContextPackage` used by Model Runtime.

It is a core-loop subroutine and not an independent workflow engine.

## 2. Hard Boundaries

1. No filesystem rule loading in core.
2. No direct external system reads from assembler.
3. No internal LLM calls in assembler.
4. No randomness in ranking/selection.

Allowed I/O only:

1. Context Packs API (through Memory/Pack store).
2. Memory Fabric retrieval APIs.
3. Tool Registry discovery APIs.
4. Blob metadata reads for already-ingested attachment refs.

## 3. Rule Source (Locked)

Context rules source is `Context Packs` hierarchy only:

1. `global`
2. `org`
3. `project`
4. `session`

Merge precedence: later layer overrides earlier layer (`global -> org -> project -> session`).

No `.claude` or local filesystem traversal is allowed in core assembler.

## 4. Pipeline DAG (Locked)

Execution graph:

1. `Intent Resolver` (sequential root)
2. Parallel fan-out:
   1. `Memory Resolver`
   2. `Domain Snapshot Resolver`
   3. `Tool Resolver`
3. `Freshness Verifier` (sequential join)
4. `Context Ranker + Budgeter`
5. `Prompt Assembler`

## 5. Stage Contracts and Failure Policy

### 5.1 Intent Resolver

Inputs:

1. Trigger event
2. recent turns summary
3. active context pack rules

Outputs:

1. `intent_descriptor`
2. `entity_set`
3. `domain`
4. `critical_fact_candidates`

Failure policy: fail-closed.

### 5.2 Memory Resolver

Reads from Memory Fabric only:

1. recent session turns
2. semantic long-term episodes
3. graph subgraph around entities

Failure policy:

1. recent turns path: fail-closed
2. long-term and graph paths: fail-open with degraded flags

### 5.3 Domain Snapshot Resolver

Reads cached domain snapshot from memory/tool result artifacts.

No live direct fetch is allowed in assembler.

Failure policy: fail-open with `domain_snapshot_unavailable`.

### 5.4 Tool Resolver

Calls registry discover endpoint, tenant-filtered.

Failure policy:

1. fail-open with fallback toolset (cached previous discovery or minimal safe set)

### 5.5 Freshness Verifier

Critical fact checks must use tools (via Tool Bus contracts), never direct external DB/API calls.

Failure policy:

1. fail-closed for policy-tagged must-verify facts
2. fail-open for non-critical facts with `freshness=unverified`

### 5.6 Ranker + Budgeter

Ranks chunks and applies deterministic token budget trimming.

Failure policy: fail-closed.

### 5.7 Prompt Assembler

Builds final model-ready package from ranked chunks.

Failure policy: fail-closed.

## 6. Critical Fact Trigger (Locked)

Hybrid trigger with policy override:

1. policy `must_verify` always wins
2. policy `never_verify` always wins
3. model-inferred critical candidate applies only when policy is silent
4. session override can force verify patterns

## 7. Tool Ranking (Deterministic)

Score formula:

`final_score = 0.55*semantic + 0.25*keyword + 0.15*domain_match + 0.05*recency`

Ordering:

1. score descending
2. `tool_id` ascending

Constraints:

1. hard cap `top_k=20` before budget trim
2. tenant permission filtering must happen before scoring
3. same inputs must yield identical output order

## 8. Token Budget Split (Assembler Stage)

Locked split:

1. system instructions + personality: 40%
2. memory + graph: 25%
3. domain snapshot: 20%
4. tools: 10%
5. provenance overhead: 5%

Deterministic overflow trim order:

1. lowest-ranked semantic memory chunks
2. oldest non-protected turns
3. lowest-ranked tool descriptions
4. lowest-priority graph edges
5. non-critical domain snapshot detail

Never drop:

1. core safety/system rules
2. critical verified facts

## 9. ContextPackage Contract

Schema: `schemas/v1/context_package.schema.json`

Versioned envelope:

```json
{
  "schema_version": "1.0.0",
  "package_id": "cpk_01JY...",
  "task_id": "tsk_01JY...",
  "request_id": "req_01JY...",
  "trace_id": "trc_01JY...",
  "tenant_id": "tenant_42",
  "iteration": 3,
  "chunks": [],
  "compaction_signals": {},
  "metadata": {
    "assembled_at": "2026-04-09T13:00:00Z",
    "total_tokens": 8120,
    "budget_target_tokens": 10000,
    "degraded_stages": []
  }
}
```

## 10. Provenance Requirement (Mandatory)

Every injected chunk MUST carry provenance.

Minimum per-chunk provenance fields:

1. `source_type`
2. `source_ref`
3. `retrieved_at`
4. `freshness` (`verified|cached|stale|unverified`)
5. `token_count`

If chunk provenance is missing, assembler must fail-closed with an auditable context-assembly error.

## 11. Compaction Signal Contract

Assembler emits:

```json
{
  "needs_compaction": true,
  "reason": "context_near_budget",
  "recommended_strategy": "summarize_memory",
  "severity": "warning"
}
```

`Site 5` must consume this signal in the same iteration path.

## 12. Iteration and Resume Determinism

1. Assembler runs once per active loop iteration.
2. On resume, assembler behavior must honor checkpointed inputs and sequence lineage.
3. Event emission sequence continues from checkpoint `last_emitted_seq + 1`.

## 13. Observability Events (Required)

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

Each event MUST include:

1. `task_id`
2. `request_id`
3. `trace_id`
4. `tenant_id`
5. `iteration`
6. `seq`

## 14. Performance SLO (V1 Default)

Assembler target:

1. p95 assembly time <= 150ms excluding downstream tool execution latency

## 15. Domain-Agnostic Core Rule

Coding-specific examples (git, tree-sitter) are adapter-level documentation only and must not appear in core assembler contract logic.
