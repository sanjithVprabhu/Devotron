# 14B — Daemon: Execution, Outcomes, and Learning

> Companion to the daemon documentation in `03_SYSTEM_ARCHITECTURE.md` (architecture), `05_DATA_MODEL.md` (schemas), `06_BUSINESS_BLUEPRINT.md` (configuration), and `14_THROUGH_23_REMAINING_DOCS.md` (Section 14: analysis jobs).
>
> This doc fills the gap on what happens **after** a proposal is created: how it gets executed when approved, how outcomes are tracked, and how the daemon learns to make better proposals.

---

## The Full Daemon Lifecycle

The previous docs cover steps 1-5 below. This doc focuses on steps 6-10.

```
┌──────────────────────────────────────────────────────────────────┐
│ 1. Daemon wakes (scheduled, every N hours per tenant)            │
│ 2. Reads events + state, runs analysis jobs                      │
│ 3. Generates Proposals                                           │
│ 4. Writes proposals to daemon.proposals (Postgres + Kafka)       │
│ 5. Owner sees proposals in dashboard                             │
│ ──────────── Previous docs cover up to here ──────────────────── │
│ 6. Owner approves / edits / dismisses                            │
│ 7. Approved proposal → Proposal Executor service                 │
│ 8. Executor dispatches action via capabilities                   │
│ 9. Outcomes tracked (was the action effective?)                  │
│ 10. Outcome data feeds back to daemon for future runs            │
└──────────────────────────────────────────────────────────────────┘
```

---

## Step 6: Owner Decision

When the owner reviews a proposal in the dashboard, they have four choices:

| Decision | UX | Effect |
|---|---|---|
| **Approve as-is** | Click "Approve & Send" | Proposal status → `approved`, queued for execution |
| **Edit then approve** | Click "Edit" → modify draft → "Approve & Send" | Proposal status → `approved` with modified action payload |
| **Dismiss** | Click "Dismiss" | Proposal status → `rejected`, never executed |
| **Snooze** | Click "Remind me tomorrow" | Proposal `expires_at` extended by 24h |

Every decision is recorded as an event in `audit.events`:

```json
{
  "event_type": "daemon_proposal_decision",
  "tenant_id": "uuid",
  "principal_id": "uuid",  // who made the decision
  "entity_id": "proposal_uuid",
  "payload": {
    "decision": "approve" | "approve_edited" | "dismiss" | "snooze",
    "edits": { ... },  // diff if edited
    "decision_latency_seconds": 12453  // how long after creation
  }
}
```

These decision events are critical inputs to the learning loop (Step 10).

---

## Step 7: The Proposal Executor Service

A new service: `proposal-executor`. Sits in the orchestration layer (Python, FastAPI). Subscribes to:
- Postgres `daemon.proposals` table changes (via Postgres logical replication or polling)
- An internal API endpoint called when the dashboard records an approval

### Service Responsibilities

```python
# proposal_executor/service.py

class ProposalExecutor:
    """
    Consumes approved proposals and dispatches their actions.
    Records execution status and emits outcome-tracking hooks.
    """

    async def on_proposal_approved(self, proposal: DaemonProposal) -> None:
        """Triggered when a proposal transitions to 'approved' status."""

        # Idempotency check — proposals can only be executed once
        if await self._already_executed(proposal.id):
            return

        # Acquire lock
        lock_key = f"proposal:exec:{proposal.id}"
        if not await redis.set(lock_key, "executing", ex=300, nx=True):
            return  # another worker is handling it

        try:
            # Dispatch by proposal type
            execution_result = await self._dispatch(proposal)

            # Record execution
            await self._record_execution(proposal, execution_result)

            # Schedule outcome measurement
            await self._schedule_outcome_measurement(proposal, execution_result)

        except Exception as e:
            await self._record_failure(proposal, e)
            raise
        finally:
            await redis.delete(lock_key)

    async def _dispatch(self, proposal: DaemonProposal) -> ExecutionResult:
        """Type-specific dispatch."""
        match proposal.proposal_type:
            case "reengagement":
                return await self._execute_reengagement(proposal)
            case "faq_update":
                return await self._execute_faq_update(proposal)
            case "catalog_gap":
                return await self._execute_catalog_gap(proposal)
            case "conversation_review":
                return await self._execute_conversation_review(proposal)
            case "broadcast":
                return await self._execute_broadcast(proposal)
            case _:
                raise UnknownProposalTypeError(proposal.proposal_type)
```

### Per-Type Execution

#### Re-engagement Execution

```python
async def _execute_reengagement(self, proposal: DaemonProposal) -> ExecutionResult:
    """Sends re-engagement messages to dormant customers."""

    targets = proposal.action["targets"]              # principal IDs
    message_draft = proposal.action["message_draft"]  # may have been edited

    sent = 0
    failed = 0
    target_records = []  # for outcome tracking

    for principal_id in targets:
        try:
            # Personalize the draft for each recipient
            personalized = await self._personalize_message(
                draft=message_draft,
                principal_id=principal_id,
                tenant_id=proposal.tenant_id
            )

            # Call broadcast.send capability
            result = await capability_call(
                "broadcast.send",
                tenant_id=proposal.tenant_id,
                target_principal_id=principal_id,
                content=personalized,
                source="daemon_reengagement",
                source_proposal_id=str(proposal.id)
            )

            target_records.append({
                "principal_id": principal_id,
                "delivery_status": result.status,
                "channel_message_id": result.message_id,
                "sent_at": now()
            })
            sent += 1

        except Exception as e:
            target_records.append({
                "principal_id": principal_id,
                "delivery_status": "failed",
                "error": str(e)
            })
            failed += 1

    return ExecutionResult(
        success=(failed == 0),
        targets_attempted=len(targets),
        targets_succeeded=sent,
        targets_failed=failed,
        target_records=target_records,
        executed_at=now()
    )
```

#### FAQ Update Execution

```python
async def _execute_faq_update(self, proposal: DaemonProposal) -> ExecutionResult:
    """Adds the proposed FAQ entry to the knowledge base."""

    question = proposal.action["question"]
    answer = proposal.action["answer_draft"]  # may have been edited

    # Call support.faq.add capability
    faq_entry = await capability_call(
        "support.faq.add",
        tenant_id=proposal.tenant_id,
        question=question,
        answer=answer,
        source="daemon_proposal",
        source_proposal_id=str(proposal.id)
    )

    return ExecutionResult(
        success=True,
        artifact_id=faq_entry.id,
        executed_at=now()
    )
```

#### Catalog Gap Execution

A catalog gap proposal *cannot* be auto-executed (you can't add a product the business doesn't actually stock). It produces a different action: prompts the owner to take action manually.

```python
async def _execute_catalog_gap(self, proposal: DaemonProposal) -> ExecutionResult:
    """For catalog gaps: marks the gap as acknowledged, doesn't auto-add."""

    # Just record the acknowledgment — no system action
    # The "execution" is the owner deciding to act on the insight (or not)

    await self._mark_gap_acknowledged(
        tenant_id=proposal.tenant_id,
        query=proposal.action["query"]
    )

    return ExecutionResult(
        success=True,
        execution_type="acknowledgment_only",
        executed_at=now()
    )
```

#### Conversation Review Execution

Similar to catalog gap — review proposals are informational. The "execution" is the owner viewing the conversation in the dashboard. We track that they viewed it.

```python
async def _execute_conversation_review(self, proposal: DaemonProposal) -> ExecutionResult:
    """For conversation reviews: link to the conversation, track view."""

    # No automated action — owner clicks through to conversation
    # Track when they actually viewed it

    return ExecutionResult(
        success=True,
        execution_type="view_tracking",
        thread_id=proposal.action["thread_id"],
        executed_at=now()
    )
```

#### Broadcast Execution

Identical structure to re-engagement, but for general broadcasts (not necessarily dormancy-based).

---

## Step 8: Recording Execution

After dispatch, the proposal record is updated:

```sql
UPDATE daemon.proposals SET
  status = 'executed',
  executed_at = NOW(),
  execution_result = $1::jsonb
WHERE id = $2;
```

And an event is emitted:

```json
{
  "event_id": "uuid",
  "occurred_at": "ISO8601",
  "tenant_id": "uuid",
  "proposal_id": "uuid",
  "execution_result": {
    "success": true,
    "targets_attempted": 23,
    "targets_succeeded": 22,
    "targets_failed": 1,
    "executed_at": "ISO8601"
  }
}
```

This event is published to a new Kafka topic: `veda.daemon.executions`.

---

## Step 9: Outcome Tracking

This is the part that turns the daemon from "spam generator" into "intelligent advisor." For each proposal type, we define what "worked" means and measure it.

### Outcome Definitions per Type

| Proposal Type | Outcome Metric | Measurement Window |
|---|---|---|
| Re-engagement | Did the recipient reply within 7 days? Did they place an order within 30 days? | 30 days |
| FAQ Update | Has the new FAQ been triggered (matched user queries) at least 3 times? Has the unanswered-query cluster shrunk? | 14 days |
| Catalog Gap | Has the owner added related catalog items within 30 days? Has search-success rate improved for that query? | 30 days |
| Conversation Review | Did the owner view it? Did they take any follow-up action (escalate to operator, refund, etc.)? | 7 days |
| Broadcast | Open rate, reply rate, conversion rate (if commerce-tied) | 30 days |

### Outcome Schema (new Postgres table)

```sql
CREATE TABLE daemon.proposal_outcomes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES core.tenants(id),
  proposal_id     UUID NOT NULL REFERENCES daemon.proposals(id),
  proposal_type   TEXT NOT NULL,
  measurement_window_days INTEGER NOT NULL,
  measured_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metrics         JSONB NOT NULL,
  -- Examples of metrics keys per type:
  -- reengagement: { reply_rate, order_rate, revenue_attributed_paise, response_count }
  -- faq_update:   { faq_matches, unanswered_cluster_size_change, owner_acceptance_rate }
  -- catalog_gap:  { items_added_count, search_success_rate_change, query_volume }
  effectiveness_score NUMERIC(3,2),  -- 0.00–1.00, normalized score
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_outcomes_tenant ON daemon.proposal_outcomes (tenant_id, proposal_type, measured_at DESC);
ALTER TABLE daemon.proposal_outcomes ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON daemon.proposal_outcomes
  USING (tenant_id = current_setting('app.tenant_id')::UUID);
```

### Outcome Measurement Worker

A separate scheduled job: `outcome-measurer`. Runs daily.

```python
# outcome_measurer/service.py

class OutcomeMeasurer:
    """Runs daily. Measures outcomes for proposals whose window has elapsed."""

    async def run(self) -> None:
        # Find executed proposals whose measurement window has elapsed
        ready_proposals = await self._find_ready_for_measurement()

        for proposal in ready_proposals:
            try:
                metrics = await self._measure(proposal)
                effectiveness = self._compute_effectiveness_score(proposal, metrics)

                await self._record_outcome(
                    proposal=proposal,
                    metrics=metrics,
                    effectiveness_score=effectiveness
                )

                await kafka.publish("veda.daemon.outcomes", {
                    "tenant_id": str(proposal.tenant_id),
                    "proposal_id": str(proposal.id),
                    "proposal_type": proposal.proposal_type,
                    "effectiveness_score": effectiveness,
                    "metrics": metrics
                })

            except Exception as e:
                logger.error(f"Outcome measurement failed for {proposal.id}: {e}")

    async def _measure(self, proposal: DaemonProposal) -> dict:
        match proposal.proposal_type:
            case "reengagement":
                return await self._measure_reengagement(proposal)
            case "faq_update":
                return await self._measure_faq_update(proposal)
            case "catalog_gap":
                return await self._measure_catalog_gap(proposal)
            case "conversation_review":
                return await self._measure_conversation_review(proposal)
            case "broadcast":
                return await self._measure_broadcast(proposal)

    async def _measure_reengagement(self, proposal: DaemonProposal) -> dict:
        """Did recipients reply? Did they order?"""
        targets = proposal.action["targets"]
        executed_at = proposal.executed_at

        replies = 0
        orders = 0
        revenue_paise = 0

        for principal_id in targets:
            # Did they reply within 7 days?
            had_inbound = await message_service.has_inbound_after(
                tenant_id=proposal.tenant_id,
                principal_id=principal_id,
                after=executed_at,
                before=executed_at + timedelta(days=7)
            )
            if had_inbound:
                replies += 1

            # Did they order within 30 days?
            recent_orders = await order_service.get_orders_since(
                tenant_id=proposal.tenant_id,
                principal_id=principal_id,
                since=executed_at,
                until=executed_at + timedelta(days=30)
            )
            if recent_orders:
                orders += 1
                revenue_paise += sum(o.total_paise for o in recent_orders)

        return {
            "targets_count": len(targets),
            "reply_count": replies,
            "reply_rate": replies / len(targets) if targets else 0,
            "order_count": orders,
            "order_rate": orders / len(targets) if targets else 0,
            "revenue_attributed_paise": revenue_paise
        }

    async def _measure_faq_update(self, proposal: DaemonProposal) -> dict:
        """Has the new FAQ been useful?"""
        faq_id = proposal.execution_result.get("artifact_id")
        executed_at = proposal.executed_at
        window_end = executed_at + timedelta(days=14)

        # How often has the FAQ been retrieved + used?
        faq_matches = await analytics.count_faq_matches(
            tenant_id=proposal.tenant_id,
            faq_id=faq_id,
            window=(executed_at, window_end)
        )

        # Did the unanswered cluster shrink?
        original_query = proposal.action["question"]
        cluster_before = proposal.action.get("similar_queries_count", 0)
        cluster_after = await analytics.count_similar_unanswered(
            tenant_id=proposal.tenant_id,
            query=original_query,
            window=(executed_at, window_end)
        )

        return {
            "faq_matches": faq_matches,
            "cluster_size_before": cluster_before,
            "cluster_size_after": cluster_after,
            "cluster_shrinkage": cluster_before - cluster_after
        }

    def _compute_effectiveness_score(self, proposal, metrics: dict) -> float:
        """Normalize per-type metrics to a 0-1 effectiveness score."""
        match proposal.proposal_type:
            case "reengagement":
                # Weighted: reply rate (30%) + order rate (50%) + revenue (20%)
                reply_score = min(metrics["reply_rate"] / 0.20, 1.0)  # 20% reply = great
                order_score = min(metrics["order_rate"] / 0.10, 1.0)  # 10% order = great
                revenue_score = min(metrics["revenue_attributed_paise"] / 5000000, 1.0)  # ₹50k = great
                return round(0.3 * reply_score + 0.5 * order_score + 0.2 * revenue_score, 2)

            case "faq_update":
                # Weighted: matches (60%) + cluster shrinkage (40%)
                match_score = min(metrics["faq_matches"] / 10, 1.0)
                shrinkage = metrics["cluster_shrinkage"]
                shrinkage_score = min(max(shrinkage, 0) / max(metrics["cluster_size_before"], 1), 1.0)
                return round(0.6 * match_score + 0.4 * shrinkage_score, 2)

            # ... other types
```

---

## Step 10: The Learning Loop

The daemon learns what works for each tenant. Two levels of learning:

### Level 1: Per-Tenant Calibration (v1)

For each tenant, we maintain rolling averages of effectiveness by proposal type:

```sql
-- Materialized view, refreshed daily
CREATE MATERIALIZED VIEW daemon.tenant_proposal_stats AS
SELECT
  tenant_id,
  proposal_type,
  COUNT(*) as proposal_count,
  AVG(effectiveness_score) as avg_effectiveness,
  COUNT(*) FILTER (WHERE p.status = 'executed') as executed_count,
  COUNT(*) FILTER (WHERE p.status = 'rejected') as rejected_count,
  AVG(EXTRACT(EPOCH FROM (p.reviewed_at - p.created_at)) / 60) as avg_review_minutes
FROM daemon.proposals p
LEFT JOIN daemon.proposal_outcomes o ON p.id = o.proposal_id
WHERE p.created_at > NOW() - INTERVAL '90 days'
GROUP BY tenant_id, proposal_type;
```

The daemon reads these stats at the start of each run and adjusts behavior:

```python
async def run_daemon_for_tenant(tenant_id: str) -> None:
    stats = await get_tenant_proposal_stats(tenant_id)

    for job_type in config.enabled_jobs:
        tenant_stats = stats.get(job_type)

        if tenant_stats:
            # Skip job types this tenant consistently rejects
            if tenant_stats.rejection_rate > 0.7 and tenant_stats.proposal_count > 5:
                logger.info(f"Skipping {job_type} for {tenant_id} — high rejection rate")
                continue

            # Be more conservative with low-effectiveness types
            if tenant_stats.avg_effectiveness < 0.3 and tenant_stats.proposal_count > 10:
                # Reduce volume, raise quality bar
                proposals = await run_job(
                    job_type, tenant_id, blueprint,
                    quality_threshold=tenant_stats.avg_effectiveness + 0.2,
                    max_proposals=int(tenant_stats.proposal_count * 0.5)
                )
            else:
                proposals = await run_job(job_type, tenant_id, blueprint)
        else:
            # No history yet — run normally with conservative defaults
            proposals = await run_job(job_type, tenant_id, blueprint)
```

### Level 2: Cross-Tenant Pattern Learning (V2)

In V2, we'll aggregate (privacy-preserving, anonymized) patterns across tenants in the same vertical:
- "Re-engagement messages with 1-2 emojis perform 18% better in auto parts"
- "FAQ entries shorter than 30 words get matched 2x more often"
- "Catalog gap proposals for OEM-numbered parts have 80% acceptance rate"

For v1, we don't ship cross-tenant learning — but we record everything needed to enable it later (effectiveness scores per type, message structure metadata, etc.).

---

## Daemon-Owner Feedback Loop in the UX

The dashboard surfaces effectiveness data to the owner so they trust and engage with the daemon:

### "How Well Is My Daemon Doing?" Dashboard Panel

```
┌─────────────────────────────────────────────────────────────────┐
│ VEDA's Performance — Last 30 Days                              │
│                                                                 │
│ Proposals made:        47                                       │
│ You approved:          32  (68%)                                │
│ You dismissed:         12  (26%)                                │
│ Pending review:         3   (6%)                                │
│                                                                 │
│ Outcomes (32 executed):                                         │
│ ─ Re-engagement:    18 sent → 4 reorders → ₹38,400 revenue     │
│ ─ FAQ updates:      8 added → matched 47 times since           │
│ ─ Conversation reviews: 6 surfaced → 3 led to escalations      │
│                                                                 │
│ Best-performing this month: Re-engagement (₹2,133/proposal avg) │
│ Worst-performing: Conversation reviews (low action rate)        │
│                                                                 │
│ Want to adjust?  [Disable conversation reviews] [Tune frequency]│
└─────────────────────────────────────────────────────────────────┘
```

This isn't just nice-to-have UX. It's the trust mechanism. If the owner sees "the daemon's re-engagement proposals brought in ₹38,400 last month," they keep approving them. Without outcome visibility, daemon proposals feel like noise and get dismissed.

---

## Outcome-Aware Proposal Generation

When the daemon generates proposals, it includes its own confidence based on past outcomes:

```python
async def find_reengagement_candidates(tenant_id: str, config) -> List[Proposal]:
    candidates = await order_service.get_dormant_customers(...)

    # Look up historical effectiveness of re-engagement for this tenant
    historical_effectiveness = await get_avg_effectiveness(
        tenant_id=tenant_id,
        proposal_type="reengagement"
    )

    # Only proceed if historical data suggests it's worth it
    if historical_effectiveness is not None and historical_effectiveness < 0.15:
        # Past re-engagement attempts have been ineffective for this tenant
        # Don't generate this proposal type unless we have new approach
        return []

    proposal = Proposal(
        type="reengagement",
        title=f"Re-engage {len(candidates)} dormant customers",
        # ...
        confidence=historical_effectiveness or 0.5,  # surfaced in dashboard
        expected_outcome={
            "reply_rate": historical_effectiveness or 0.10,
            "order_rate": (historical_effectiveness or 0.10) * 0.4,
            "revenue_estimate_paise": estimate_revenue(candidates, historical_effectiveness)
        }
    )
    return [proposal]
```

This means the dashboard shows:

```
Re-engage 23 dormant customers
Past performance: 4-8 reorders typical, ~₹30k-50k revenue range
Confidence: ★★★☆☆ (based on your past 12 re-engagement proposals)
```

Instead of:

```
Re-engage 23 dormant customers
Maybe they'll come back!
```

The first version is honest, evidence-based, and actually useful.

---

## Edge Cases and Failure Modes

### What if Execution Fails Partially?

A re-engagement to 100 targets succeeds for 95 and fails for 5.
- Proposal status → `executed` (overall success)
- Execution result records per-target status
- Failed targets are *not* automatically retried (could be blocked, opted out, etc.)
- Owner sees "95/100 sent" with option to view failed ones

### What if Owner Approves Then Changes Mind?

If a re-engagement is approved but not yet sent (queue lag), can it be cancelled?
- Yes — within a 5-minute grace period
- After 5 minutes, the executor is past the point of no return
- Dashboard shows "Sending..." countdown for first 5 minutes with a Cancel button

### What if a Proposal Is Approved After Its Window Expired?

The proposal had an `expires_at` of 7 days from creation. Owner approves on day 8.
- Proposal had auto-expired on day 7 (status = `expired`)
- It cannot be approved
- Owner sees "This proposal has expired" with option to "Generate a fresh one" (queues a new run for that proposal type)

### What if the Same Customer Appears in Multiple Re-engagement Proposals?

Tenant A has weekly re-engagement runs. A customer appears in week 1's proposal (approved), then week 2's proposal (still dormant).
- Deduplication: a customer who received a daemon-sourced message in the last 21 days is excluded from new re-engagement proposals
- Configurable per tenant (`reengagement_config.cooloff_days`)

### What if Outcome Measurement Is Incomplete?

The 30-day window for re-engagement just elapsed but the customer ordered on day 31.
- Outcome is recorded based on the window
- A separate "delayed attribution" job runs monthly and surfaces "the daemon's October re-engagement campaign drove ₹22k of November revenue"
- Effectiveness scores can be revised once per quarter based on long-tail attribution

---

## Daemon's Own Cost Tracking

Every daemon run records its own LLM cost:

```sql
-- Add to billing.llm_usage_daily — already has 'task_type' field
-- Daemon usage gets task_type values like:
--   'daemon.reengagement'
--   'daemon.faq_patterns'
--   'daemon.catalog_gaps'
--   'daemon.conversation_review'
--   'daemon.outcome_measurement'
```

This lets the dashboard show:

```
Your daemon costs ₹4.50/day on average
Generated ₹38,400 in attributed revenue last month
ROI: ~285x
```

If ROI ever drops below 5x, the daemon should be auto-throttled and the owner notified.

---

## What Lives Where (Updated)

This gap-filler doc adds these new components — when implementing, here's where they go:

| Component | Location |
|---|---|
| `proposal-executor` service | `apps/proposal-executor/` (Python, FastAPI) |
| `outcome-measurer` service | `apps/outcome-measurer/` (Python, scheduled) |
| `daemon.proposal_outcomes` table | Postgres, new table in `daemon` schema |
| `veda.daemon.executions` Kafka topic | New topic |
| `veda.daemon.outcomes` Kafka topic | New topic |
| Effectiveness score computation | `proposal-executor/scoring.py` |
| Per-tenant calibration logic | `daemon-runner/calibration.py` |
| Dashboard "How is my daemon doing?" panel | `apps/dashboard/app/daemon/insights/page.tsx` |
| Approval grace period (5-min cancel) | `proposal-executor/queue.py` with delayed execution |

---

## Build Sequence Update

These components fit into Sprint 6 of the existing build plan (Daemon + Jobs Vertical):

**Original Sprint 6 scope:**
- Daemon runner (4 job types)
- Daemon proposals dashboard UI
- Broadcast capability

**Add to Sprint 6:**
- Proposal executor service (the dispatch layer)
- Outcome measurer service (basic version — re-engagement and FAQ outcomes)
- Per-tenant effectiveness tracking
- Dashboard performance panel

**Defer to Sprint 8 (post-launch):**
- Cross-tenant pattern learning (V2 territory)
- Delayed attribution jobs
- ROI auto-throttling
- Outcome-aware proposal generation refinement

This expands Sprint 6 by roughly 30%. Worth it — without these pieces, the daemon is just a proposal generator, not an intelligent system.
