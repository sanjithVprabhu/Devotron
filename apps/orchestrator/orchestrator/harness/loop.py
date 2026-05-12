"""The top-level harness loop.

One ``run_harness()`` call = one customer message processed end-to-end. The loop
walks the 7 continue-sites in fixed order each iteration, accumulates say/ask
events, and exits with a TurnOutcome.

Caps:
  - max_iterations    8
  - max_wallclock_ms  30_000
  - max_cost_paise    200    (= ₹2)
All overridable per-tenant via blueprint.policies.harness.

Resumability:
  - State is persisted to Mongo (``harness_journal``) at every site boundary.
  - When TurnOutcome.SUSPEND is reached, the state is left intact; an external
    approval flow calls ``resume_harness(turn_id, approval_decision)`` later.
"""

from __future__ import annotations

import time
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

from llm_router import get_router
from veda_shared.logging import get_logger

from orchestrator.harness.parser import parse
from orchestrator.harness.prompt import build_system_prompt, render_tool_result
from orchestrator.harness.sites import compaction, critic, memory_verify, output, permission, swarm, tools
from orchestrator.harness.state import (
    HarnessState,
    ModelCallEntry,
    TerminationCode,
    TurnOutcome,
    save_state,
)
from orchestrator.harness.tags import (
    AskEvent,
    CallEvent,
    EscalateEvent,
    FinalEvent,
    HarnessEvent,
    PlanEvent,
    RecallEvent,
    RememberEvent,
    RequestApprovalEvent,
    SayEvent,
    SwarmEvent,
    ThinkingEvent,
)

log = get_logger(__name__)


@dataclass
class HarnessCaps:
    """Hard limits per Yggdrasil core_loop §9.

    A turn terminates with a machine-readable TerminationCode the moment any cap is
    exceeded. Defaults are chosen for SMB chat workloads: tighter than Yggdrasil's
    generic defaults so the agent can't run away on a single customer message.
    """

    max_iterations: int = 8                     # LOOP_MAX_ITERATIONS
    max_wallclock_ms: int = 60_000              # TASK_DEADLINE_EXCEEDED (1 min for full turn)
    max_iteration_wallclock_ms: int = 20_000    # ITERATION_DEADLINE_EXCEEDED (20s per iteration)
    # Per-turn cost cap. ₹50 default — comfortable for a 3-iteration GPT-4o flow with
    # prompt caching active. Override per-tenant via blueprint.policies.harness.
    max_cost_paise: int = 5_000
    max_actions_per_iteration: int = 6
    max_total_actions: int = 32                 # LOOP_MAX_ACTIONS
    max_swarm_depth: int = 2                    # LOOP_MAX_SWARM_DEPTH
    max_no_progress_iterations: int = 4         # LOOP_NO_PROGRESS
    critic_enabled_default: bool = False
    # Max prior turns to feed the model. Conversation history is unbounded in
    # the source store (Mongo); we truncate at the harness boundary to keep
    # the prompt under the LLM's context window. 20 user+assistant pairs is
    # typically ~6000 tokens, well under GPT-4o's 128k window even with system
    # prompt + tool docs, but keeps cost predictable.
    max_history_messages: int = 20


@dataclass
class HarnessInputs:
    tenant_id: str | None
    thread_id: str | None
    principal_id: str
    user_message_text: str
    history: list[dict[str, Any]]   # prior turns: [{role, content}, ...]
    blueprint: dict[str, Any] | None
    # The sender's role against this tenant. None for normal customers
    # (non-members). 'owner' / 'admin' / 'operator' / 'viewer' if the sender
    # is a tenant member — unlocks admin-mode capabilities (catalog.add etc.).
    principal_role: str | None = None


@dataclass
class HarnessResult:
    turn_id: str
    outcome: TurnOutcome
    termination_code: str | None        # machine-readable reason; see TerminationCode
    outbound: dict[str, Any] | None     # CanonicalContent dict, or None if escalated
    pending_approval: dict[str, Any] | None
    cost_paise: int
    iterations: int
    elapsed_ms: int


def _context_digest(messages: list[dict[str, Any]]) -> str:
    """Cheap digest of the message list — used to detect lack of progress between iterations."""
    import hashlib

    h = hashlib.sha256()
    for m in messages:
        c = m.get("content")
        if isinstance(c, str):
            h.update(c.encode("utf-8", errors="ignore"))
        elif isinstance(c, list):
            for p in c:
                if isinstance(p, dict):
                    t = p.get("text")
                    if isinstance(t, str):
                        h.update(t.encode("utf-8", errors="ignore"))
    return h.hexdigest()


def _terminate(state: HarnessState, outcome: TurnOutcome, code: TerminationCode) -> None:
    state.outcome = outcome
    state.termination_code = code.value


async def run_harness(inputs: HarnessInputs, caps: HarnessCaps | None = None) -> HarnessResult:
    caps = caps or HarnessCaps()
    state = HarnessState.new(
        tenant_id=inputs.tenant_id,
        thread_id=inputs.thread_id,
        principal_id=inputs.principal_id,
    )
    started = time.perf_counter()

    # Load the tenant's registered dynamic tools so the prompt can advertise
    # them. Failure to load is non-fatal — the agent still works with built-ins.
    dynamic_tools = []
    if inputs.tenant_id:
        try:
            from orchestrator.tools import load_active_tools

            dynamic_tools = await load_active_tools(inputs.tenant_id)
        except Exception as e:  # noqa: BLE001
            log.warning("harness.dynamic_tools_load_failed", tenant_id=inputs.tenant_id, error=str(e))

    system_prompt = build_system_prompt(
        inputs.blueprint,
        principal_role=inputs.principal_role,
        dynamic_tools=dynamic_tools or None,
    )

    # Truncate history at the harness boundary. Source store keeps the full
    # transcript; we feed the model only the last N turns to bound prompt cost.
    history = inputs.history[-caps.max_history_messages:] if inputs.history else []

    # Build messages: prior history (capped) + current user turn (no tool results yet).
    messages: list[dict[str, Any]] = list(history) + [
        {"role": "user", "content": inputs.user_message_text}
    ]

    accumulated_escalation: EscalateEvent | None = None
    total_actions = 0

    for iteration in range(caps.max_iterations):
        state.iteration = iteration
        iter_started_perf = time.perf_counter()

        # Per-iteration deadline. The model call below is allowed up to
        # caps.max_iteration_wallclock_ms; if it overshoots we abort the turn.
        # (Soft enforcement — check after the call returns. V1.5 will use httpx
        # request timeouts to hard-stop in-flight requests.)

        # Site 5 first: compact if needed (cheaper than letting Site 0 / model call run)
        messages = await compaction.maybe_compact(
            state=state, messages=messages, tenant_id=inputs.tenant_id
        )

        # Progress check (no-progress breaker, Yggdrasil core_loop §9)
        digest = _context_digest(messages)
        if digest == state.last_context_digest:
            state.no_progress_streak += 1
            if state.no_progress_streak >= caps.max_no_progress_iterations:
                _terminate(state, TurnOutcome.EXPIRE, TerminationCode.LOOP_NO_PROGRESS)
                state.append_site(
                    output.SiteName.OUTPUT,  # type: ignore[attr-defined]
                    outcome="expire:no_progress",
                    payload={"streak": state.no_progress_streak},
                )
                await save_state(state)
                return _result_from(state, started)
        else:
            state.no_progress_streak = 0
            state.last_context_digest = digest

        # Step A: call the LLM
        try:
            iter_started = datetime.now(timezone.utc).isoformat()
            resp = await get_router().complete(
                task="support_response",
                tenant_id=inputs.tenant_id,
                system=system_prompt,
                messages=messages,
                max_tokens=900,
                cache_system_prompt=True,
            )
            iter_finished = datetime.now(timezone.utc).isoformat()
        except Exception as e:  # noqa: BLE001
            log.exception("harness.model_call_failed", iteration=iteration)
            _terminate(state, TurnOutcome.FAIL, TerminationCode.INTERNAL_ERROR)
            state.append_site(
                output.SiteName.OUTPUT,  # type: ignore[attr-defined]
                outcome=f"fail:{type(e).__name__}",
                payload={},
            )
            await save_state(state)
            return _result_from(state, started)

        # Per-iteration deadline check
        iter_elapsed_ms = int((time.perf_counter() - iter_started_perf) * 1000)
        if iter_elapsed_ms > caps.max_iteration_wallclock_ms:
            _terminate(state, TurnOutcome.FAIL, TerminationCode.ITERATION_DEADLINE_EXCEEDED)
            state.append_site(
                output.SiteName.OUTPUT,  # type: ignore[attr-defined]
                outcome="fail:iteration_deadline",
                payload={"elapsed_ms": iter_elapsed_ms},
            )
            await save_state(state)
            return _result_from(state, started)

        state.model_calls.append(
            ModelCallEntry(
                iteration=iteration,
                started_at=iter_started,
                finished_at=iter_finished,
                provider=resp.provider,
                model=resp.model,
                input_tokens=resp.input_tokens,
                output_tokens=resp.output_tokens,
                cached_tokens=resp.cached_tokens,
                cost_paise=resp.cost_paise,
                response_xml=resp.text,
            )
        )
        state.total_cost_paise += resp.cost_paise

        # Step B: parse XML
        events = parse(resp.text)
        thinking_events: list[ThinkingEvent] = []
        plan_events: list[PlanEvent] = []
        call_events: list[CallEvent] = []
        say_events: list[SayEvent] = []
        ask_events: list[AskEvent] = []
        remember_events: list[RememberEvent] = []
        recall_events: list[RecallEvent] = []
        approval_requests: list[RequestApprovalEvent] = []
        swarms: list[SwarmEvent] = []
        has_final = False
        for e in events:
            _bucketize(
                e,
                thinking_events,
                plan_events,
                call_events,
                say_events,
                ask_events,
                remember_events,
                recall_events,
                approval_requests,
                swarms,
            )
            if isinstance(e, FinalEvent):
                has_final = True
            elif isinstance(e, EscalateEvent):
                accumulated_escalation = e

        # Output exclusivity rule (Yggdrasil core_loop §10): a turn cannot
        # contain BOTH an actionable directive (call/ask/swarm) AND <final/>.
        if has_final and (call_events or ask_events or swarms):
            log.warning(
                "harness.output_ambiguous",
                calls=len(call_events),
                asks=len(ask_events),
                swarms=len(swarms),
            )
            _terminate(state, TurnOutcome.FAIL, TerminationCode.MODEL_OUTPUT_AMBIGUOUS)
            state.append_site(
                output.SiteName.OUTPUT,  # type: ignore[attr-defined]
                outcome="fail:model_output_ambiguous",
                payload={"calls": len(call_events), "asks": len(ask_events)},
            )
            await save_state(state)
            return _result_from(state, started)

        # Hard cap on total actions across the whole turn
        total_actions += len(call_events)
        if total_actions > caps.max_total_actions:
            _terminate(state, TurnOutcome.EXPIRE, TerminationCode.LOOP_MAX_ACTIONS)
            state.append_site(
                output.SiteName.OUTPUT,  # type: ignore[attr-defined]
                outcome="expire:max_total_actions",
                payload={"total_actions": total_actions},
            )
            await save_state(state)
            return _result_from(state, started)

        # Per-iteration cap on action count
        if len(call_events) > caps.max_actions_per_iteration:
            log.warning(
                "harness.too_many_actions_in_iteration",
                count=len(call_events),
                cap=caps.max_actions_per_iteration,
            )
            # Trim to cap rather than fail — feed the trimmed-out calls back as errors next turn.
            call_events = call_events[: caps.max_actions_per_iteration]

        # Site 1: permission gate (async — also loads dynamic tools for risk classification)
        cleared_calls, denied_calls, gate_short_circuit = await permission.gate(
            state=state,
            blueprint=inputs.blueprint,
            pending_calls=call_events,
            explicit_approvals=approval_requests,
        )

        # Site 3: memory verification (before any tool runs)
        if cleared_calls or recall_events:
            cleared_calls, corrections, recall_results = await memory_verify.verify(
                state=state,
                cleared_calls=cleared_calls,
                recalls=recall_events,
                tenant_id=inputs.tenant_id,
                principal_id=inputs.principal_id,
                thread_id=inputs.thread_id,
            )
        else:
            corrections, recall_results = [], []

        # Process <remember> writes (low-risk, not gated by approval)
        for r in remember_events:
            from orchestrator.harness.memory import write_memory

            await write_memory(
                scope=r.scope,
                key=r.key,
                value=r.value,
                tenant_id=inputs.tenant_id,
                principal_id=inputs.principal_id,
                thread_id=inputs.thread_id,
            )

        # Site 2: tool execution
        if gate_short_circuit is None:
            tool_results = await tools.execute(
                state=state,
                cleared_calls=cleared_calls,
                denied=denied_calls,
                tenant_id=inputs.tenant_id,
                thread_id=inputs.thread_id,
                principal_id=inputs.principal_id,
            )
        else:
            tool_results = []

        # Site 6: swarm (after tools so it can see this iteration's results if needed)
        swarm_results = await swarm.maybe_run(
            state=state, swarms=swarms, tenant_id=inputs.tenant_id
        )

        # Site 4: critic — only after we have tool results AND a draft reply
        critic_correction = await critic.review(
            state=state,
            blueprint=inputs.blueprint,
            say_events=say_events,
            ask_events=ask_events,
            tool_results=tool_results,
            tenant_id=inputs.tenant_id,
        )

        # Accumulate say/ask onto state for the eventual outbound.
        state.accumulated_say.extend(s.text for s in say_events if s.text)
        if ask_events:
            state.accumulated_ask = {
                "body_text": ask_events[-1].body_text,
                "buttons": [(b.id, b.title) for b in ask_events[-1].buttons],
                "items": [(it.id, it.title, it.description) for it in ask_events[-1].list_items],
            }

        # Escalation short-circuits to FINALIZE with a "talk to team" message via the
        # escalation capability. Treat it specially.
        if accumulated_escalation:
            from veda_shared.capability import registry
            from veda_shared.schemas.capabilities import CapabilityCall, CapabilityId

            if inputs.tenant_id and inputs.thread_id:
                await registry.invoke(
                    CapabilityCall(
                        capability=CapabilityId.SUPPORT_ESCALATION_CREATE,
                        tenant_id=inputs.tenant_id,
                        thread_id=inputs.thread_id,
                        invoked_by_principal_id=inputs.principal_id,
                        input={
                            "thread_id": inputs.thread_id,
                            "reason": accumulated_escalation.reason,
                            "escalate_to": accumulated_escalation.escalate_to,
                        },
                    )
                )
            # Use blueprint's escalation message if set, else a sane default
            policy = (inputs.blueprint or {}).get("policies", {}).get("escalation", {})
            msg = policy.get(
                "escalation_message",
                "Let me connect you with our team for this. They'll be with you shortly.",
            )
            state.final_outbound = {"type": "text", "text": msg}
            _terminate(state, TurnOutcome.FINALIZE, TerminationCode.CRITIC_ESCALATED)
            await save_state(state)
            return _result_from(state, started)

        # Site 7: output decision
        elapsed_ms = int((time.perf_counter() - started) * 1000)
        state.total_wallclock_ms = elapsed_ms
        decision = output.decide(
            state=state,
            say_events=[SayEvent(text=t) for t in state.accumulated_say],
            ask_events=ask_events,
            has_final=has_final,
            cleared_calls=cleared_calls,
            swarms=swarms,
            forced_outcome=gate_short_circuit,
            iteration=iteration + 1,
            max_iterations=caps.max_iterations,
            elapsed_ms=elapsed_ms,
            max_wallclock_ms=caps.max_wallclock_ms,
            cost_paise=state.total_cost_paise,
            max_cost_paise=caps.max_cost_paise,
        )

        # Apply machine-readable termination code based on Site 7's decision.
        if decision == TurnOutcome.FINALIZE:
            state.termination_code = (
                TerminationCode.MODEL_EMITTED_FINAL_ANSWER.value
                if has_final
                else TerminationCode.ITERATION_BUDGET_REACHED_WITH_ANSWER.value
            )
        elif decision == TurnOutcome.EXPIRE:
            if elapsed_ms >= caps.max_wallclock_ms:
                state.termination_code = TerminationCode.TASK_DEADLINE_EXCEEDED.value
            elif state.total_cost_paise >= caps.max_cost_paise:
                state.termination_code = TerminationCode.BUDGET_EXCEEDED.value
            else:
                state.termination_code = TerminationCode.LOOP_MAX_ITERATIONS.value
        elif decision in (
            TurnOutcome.SUSPEND_PERMISSION,
            TurnOutcome.SUSPEND_EXTERNAL,
            TurnOutcome.SUSPEND_SWARM,
            TurnOutcome.SUSPEND_CRITIC,
        ):
            # No termination code — turn isn't terminal; resumes via approval flow.
            pass
        elif decision == TurnOutcome.FAIL:
            if not state.termination_code:
                state.termination_code = TerminationCode.INTERNAL_ERROR.value

        await save_state(state)

        if decision in (
            TurnOutcome.FINALIZE,
            TurnOutcome.FAIL,
            TurnOutcome.EXPIRE,
            TurnOutcome.SUSPEND_PERMISSION,
            TurnOutcome.SUSPEND_EXTERNAL,
            TurnOutcome.SUSPEND_SWARM,
            TurnOutcome.SUSPEND_CRITIC,
            TurnOutcome.CANCEL,
        ):
            return _result_from(state, started)

        # ITERATE: append model output + tool results to the message list and loop.
        messages.append({"role": "assistant", "content": resp.text})
        feedback_blocks: list[str] = []
        for r in tool_results + corrections + recall_results + swarm_results + ([critic_correction] if critic_correction else []):
            if r is None:
                continue
            feedback_blocks.append(
                render_tool_result(
                    call_name=r.get("call", "unknown"),
                    correlation_id=r.get("id"),
                    ok=bool(r.get("ok")),
                    output=r.get("output"),
                    error=r.get("error"),
                )
            )
        if feedback_blocks:
            messages.append({"role": "user", "content": "\n".join(feedback_blocks)})

    # Loop fell through without an explicit outcome — treat as expire.
    _terminate(state, TurnOutcome.EXPIRE, TerminationCode.LOOP_MAX_ITERATIONS)
    await save_state(state)
    return _result_from(state, started)


def _bucketize(
    e: HarnessEvent,
    thinking_events: list[ThinkingEvent],
    plan_events: list[PlanEvent],
    call_events: list[CallEvent],
    say_events: list[SayEvent],
    ask_events: list[AskEvent],
    remember_events: list[RememberEvent],
    recall_events: list[RecallEvent],
    approval_requests: list[RequestApprovalEvent],
    swarms: list[SwarmEvent],
) -> None:
    if isinstance(e, ThinkingEvent):
        thinking_events.append(e)
    elif isinstance(e, PlanEvent):
        plan_events.append(e)
    elif isinstance(e, CallEvent):
        call_events.append(e)
    elif isinstance(e, SayEvent):
        say_events.append(e)
    elif isinstance(e, AskEvent):
        ask_events.append(e)
    elif isinstance(e, RememberEvent):
        remember_events.append(e)
    elif isinstance(e, RecallEvent):
        recall_events.append(e)
    elif isinstance(e, RequestApprovalEvent):
        approval_requests.append(e)
    elif isinstance(e, SwarmEvent):
        swarms.append(e)


def _result_from(state: HarnessState, started_perf: float) -> HarnessResult:
    return HarnessResult(
        turn_id=state.turn_id,
        outcome=state.outcome,
        termination_code=state.termination_code,
        outbound=state.final_outbound,
        pending_approval=state.pending_approval,
        cost_paise=state.total_cost_paise,
        iterations=state.iteration + 1,
        elapsed_ms=int((time.perf_counter() - started_perf) * 1000),
    )
