"""Durable harness state.

Each turn of the loop produces a journal: a list of site outcomes, model calls,
tool results, and decisions. Persisted to MongoDB so that:

  - A process crash mid-loop can be resumed (Site 7 reads the journal and picks up).
  - Replay/debugging shows exactly what happened, in order.
  - The KAIROS daemon can mine completed turns for memory consolidation.

Storage: per-tenant Mongo DB, ``harness_journal`` collection. One document per turn.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Any
from uuid import uuid4

from veda_shared.infra.mongo import get_tenant_db


class SiteName(str, Enum):
    PERMISSION = "site1_permission"
    TOOLS = "site2_tools"
    MEMORY_VERIFY = "site3_memory_verify"
    CRITIC = "site4_critic"
    COMPACTION = "site5_compaction"
    SWARM = "site6_swarm"
    OUTPUT = "site7_output"


class TurnOutcome(str, Enum):
    PENDING = "pending"
    ITERATE = "iterate"          # loop continues
    FINALIZE = "finalize"        # send accumulated output to user, exit cleanly
    FAIL = "fail"                # mark turn errored, nothing sent
    CANCEL = "cancel"             # user-initiated cancellation
    EXPIRE = "expire"             # cap reached (calls / time / cost)
    # Suspend variants (Yggdrasil: suspended_at_<x>)
    SUSPEND_PERMISSION = "suspended_at_permission"   # owner approval required
    SUSPEND_EXTERNAL = "suspended_at_external"       # async tool callback pending (V1.5)
    SUSPEND_SWARM = "suspended_at_swarm"             # waiting on sub-agent results
    SUSPEND_CRITIC = "suspended_at_critic"           # delegated long-running critic


# Machine-readable termination reason codes. Match Yggdrasil core_loop.md §7.
class TerminationCode(str, Enum):
    # finalize
    MODEL_EMITTED_FINAL_ANSWER = "model_emitted_final_answer"
    ITERATION_BUDGET_REACHED_WITH_ANSWER = "iteration_budget_reached_with_answer"
    # fail
    PARSER_ERROR = "parser_error"
    ALL_ACTIONS_FAILED = "iteration_all_actions_failed"
    CRITIC_ESCALATED = "critic_escalated"
    MODEL_REFUSED = "model_refused"
    INTERNAL_ERROR = "internal_error"
    ITERATION_DEADLINE_EXCEEDED = "iteration_deadline_exceeded"
    MODEL_OUTPUT_AMBIGUOUS = "model_output_ambiguous"
    # expire
    LOOP_MAX_ITERATIONS = "loop_max_iterations"
    LOOP_MAX_ACTIONS = "loop_max_actions"
    LOOP_MAX_SWARM_DEPTH = "loop_max_swarm_depth"
    LOOP_NO_PROGRESS = "loop_no_progress"
    TASK_DEADLINE_EXCEEDED = "task_deadline_exceeded"
    BUDGET_EXCEEDED = "budget_exceeded"
    # cancel
    USER_CANCELLED = "user_cancelled"
    ADMIN_CANCELLED = "admin_cancelled"
    PARENT_CANCELLED = "parent_cancelled"
    CLIENT_DISCONNECTED = "client_disconnected"


@dataclass
class SiteEntry:
    site: SiteName
    iteration: int
    started_at: str
    finished_at: str
    outcome: str                  # "ok" | "skip" | "fail:<reason>" | "suspend:<reason>"
    payload: dict[str, Any] = field(default_factory=dict)


@dataclass
class ModelCallEntry:
    iteration: int
    started_at: str
    finished_at: str
    provider: str
    model: str
    input_tokens: int
    output_tokens: int
    cached_tokens: int
    cost_paise: int
    response_xml: str             # full raw output, for debug + replay


@dataclass
class HarnessState:
    turn_id: str
    tenant_id: str | None
    thread_id: str | None
    principal_id: str
    started_at: str
    iteration: int = 0
    outcome: TurnOutcome = TurnOutcome.PENDING
    termination_code: str | None = None        # one of TerminationCode values when terminal
    model_calls: list[ModelCallEntry] = field(default_factory=list)
    sites: list[SiteEntry] = field(default_factory=list)
    accumulated_say: list[str] = field(default_factory=list)
    accumulated_ask: dict[str, Any] | None = None
    pending_approval: dict[str, Any] | None = None
    final_outbound: dict[str, Any] | None = None
    total_cost_paise: int = 0
    total_wallclock_ms: int = 0
    # Progress signal for the no-progress breaker (Yggdrasil core_loop §9).
    last_context_digest: str | None = None
    no_progress_streak: int = 0

    @classmethod
    def new(cls, *, tenant_id: str | None, thread_id: str | None, principal_id: str) -> "HarnessState":
        return cls(
            turn_id=str(uuid4()),
            tenant_id=tenant_id,
            thread_id=thread_id,
            principal_id=principal_id,
            started_at=datetime.now(timezone.utc).isoformat(),
        )

    def append_site(
        self, site: SiteName, *, outcome: str = "ok", payload: dict[str, Any] | None = None
    ) -> SiteEntry:
        now = datetime.now(timezone.utc).isoformat()
        entry = SiteEntry(
            site=site,
            iteration=self.iteration,
            started_at=now,
            finished_at=now,
            outcome=outcome,
            payload=payload or {},
        )
        self.sites.append(entry)
        return entry


async def save_state(state: HarnessState) -> None:
    """Upsert the journal entry for this turn."""
    tenant_key = state.tenant_id or "veda"
    db = get_tenant_db(tenant_key)
    doc = asdict(state)
    # asdict() converts dataclasses but enums stay; coerce for Mongo
    doc["outcome"] = state.outcome.value if isinstance(state.outcome, TurnOutcome) else state.outcome
    for s in doc.get("sites", []):
        if isinstance(s.get("site"), SiteName):
            s["site"] = s["site"].value
    await db["harness_journal"].update_one(
        {"turn_id": state.turn_id}, {"$set": doc}, upsert=True
    )


async def load_pending_state(tenant_id: str | None, thread_id: str) -> HarnessState | None:
    """If a turn was suspended (awaiting approval) for this thread, return it."""
    tenant_key = tenant_id or "veda"
    db = get_tenant_db(tenant_key)
    suspend_states = [
        TurnOutcome.SUSPEND_PERMISSION.value,
        TurnOutcome.SUSPEND_EXTERNAL.value,
        TurnOutcome.SUSPEND_SWARM.value,
        TurnOutcome.SUSPEND_CRITIC.value,
    ]
    doc = await db["harness_journal"].find_one(
        {"thread_id": thread_id, "outcome": {"$in": suspend_states}},
        sort=[("started_at", -1)],
    )
    if not doc:
        return None
    doc.pop("_id", None)
    sites = [SiteEntry(site=SiteName(s["site"]), **{k: v for k, v in s.items() if k != "site"})
             for s in doc.get("sites", [])]
    model_calls = [ModelCallEntry(**m) for m in doc.get("model_calls", [])]
    return HarnessState(
        turn_id=doc["turn_id"],
        tenant_id=doc.get("tenant_id"),
        thread_id=doc.get("thread_id"),
        principal_id=doc["principal_id"],
        started_at=doc["started_at"],
        iteration=doc.get("iteration", 0),
        outcome=TurnOutcome(doc.get("outcome", TurnOutcome.PENDING.value)),
        model_calls=model_calls,
        sites=sites,
        accumulated_say=doc.get("accumulated_say", []),
        accumulated_ask=doc.get("accumulated_ask"),
        pending_approval=doc.get("pending_approval"),
        final_outbound=doc.get("final_outbound"),
        total_cost_paise=doc.get("total_cost_paise", 0),
        total_wallclock_ms=doc.get("total_wallclock_ms", 0),
    )
