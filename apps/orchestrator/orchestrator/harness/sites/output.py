"""Site 7 — Output decision.

The terminal site of every iteration. Decides what happens next:

  - FINALIZE: model emitted <final/> (or implicit final via <ask>). Build the
    outbound canonical message from accumulated <say>/<ask>, attach to state.
  - ITERATE: model called tools, hasn't finalised. Loop continues.
  - SUSPEND: an upstream site (permission, request_approval) wants to pause.
  - EXPIRE: caps reached (calls / time / cost).
  - FAIL: hard error (e.g. all model calls failed, no tool worked).
  - CANCEL: user-initiated; surfaced via parent dispatcher.

Site 7 is also where the outbound CanonicalContent is assembled. Multiple
<say> tags concatenate with newlines; <ask> takes precedence if present.
"""

from __future__ import annotations

from typing import Any

from veda_shared.logging import get_logger

from orchestrator.harness.state import HarnessState, SiteName, TurnOutcome
from orchestrator.harness.tags import AskEvent, CallEvent, FinalEvent, SayEvent, SwarmEvent

log = get_logger(__name__)


def decide(
    *,
    state: HarnessState,
    say_events: list[SayEvent],
    ask_events: list[AskEvent],
    has_final: bool,
    cleared_calls: list[CallEvent],
    swarms: list[SwarmEvent],
    forced_outcome: TurnOutcome | None,
    iteration: int,
    max_iterations: int,
    elapsed_ms: int,
    max_wallclock_ms: int,
    cost_paise: int,
    max_cost_paise: int,
) -> TurnOutcome:
    if forced_outcome is not None:
        state.outcome = forced_outcome
        state.append_site(SiteName.OUTPUT, outcome=f"forced:{state.outcome.value}", payload={})
        if state.outcome == TurnOutcome.FINALIZE:
            _build_outbound(state, say_events, ask_events)
        return state.outcome

    # Cap checks come first so a runaway turn doesn't leak.
    if iteration >= max_iterations:
        state.outcome = TurnOutcome.EXPIRE
        state.append_site(
            SiteName.OUTPUT,
            outcome="expire:max_iterations",
            payload={"iteration": iteration, "max": max_iterations},
        )
        _build_outbound(state, say_events, ask_events, fallback=True)
        return state.outcome

    if elapsed_ms >= max_wallclock_ms:
        state.outcome = TurnOutcome.EXPIRE
        state.append_site(
            SiteName.OUTPUT,
            outcome="expire:wallclock",
            payload={"elapsed_ms": elapsed_ms, "max_ms": max_wallclock_ms},
        )
        _build_outbound(state, say_events, ask_events, fallback=True)
        return state.outcome

    if cost_paise >= max_cost_paise:
        state.outcome = TurnOutcome.EXPIRE
        state.append_site(
            SiteName.OUTPUT,
            outcome="expire:cost",
            payload={"cost_paise": cost_paise, "max_paise": max_cost_paise},
        )
        _build_outbound(state, say_events, ask_events, fallback=True)
        return state.outcome

    # Implicit finalize: model emitted a customer-facing message and no tool calls.
    implicit_final = (
        not cleared_calls
        and not swarms
        and (say_events or ask_events)
        and not has_final  # log it but treat as final
    )
    if has_final or implicit_final:
        state.outcome = TurnOutcome.FINALIZE
        _build_outbound(state, say_events, ask_events)
        state.append_site(
            SiteName.OUTPUT,
            outcome="finalize" if has_final else "finalize:implicit",
            payload={"say_count": len(say_events), "has_ask": bool(ask_events)},
        )
        return state.outcome

    # Otherwise iterate — there's tool work to feed back.
    state.outcome = TurnOutcome.ITERATE
    state.append_site(
        SiteName.OUTPUT,
        outcome="iterate",
        payload={
            "calls": [c.name for c in cleared_calls],
            "swarms": [s.sub_agent_name for s in swarms],
        },
    )
    return state.outcome


def _build_outbound(
    state: HarnessState,
    say_events: list[SayEvent],
    ask_events: list[AskEvent],
    *,
    fallback: bool = False,
) -> None:
    """Assemble the final CanonicalContent and stash it on the state."""
    if ask_events:
        ask = ask_events[-1]
        if ask.list_items:
            state.final_outbound = {
                "type": "list",
                "body_text": ask.body_text,
                "button_text": ask.button_text,
                "list_sections": [
                    {
                        "title": ask.list_section_title,
                        "items": [
                            {"id": it.id, "title": it.title[:24], "description": it.description}
                            for it in ask.list_items[:10]
                        ],
                    }
                ],
            }
        else:
            state.final_outbound = {
                "type": "buttons",
                "body_text": ask.body_text,
                "buttons": [{"id": b.id, "title": b.title[:20]} for b in ask.buttons[:3]],
            }
        return

    text_lines = [s.text for s in say_events if s.text]
    if not text_lines:
        if fallback:
            # Don't fabricate; escalate silently per spec rule.
            state.final_outbound = None
            return
        state.final_outbound = None
        return
    state.final_outbound = {"type": "text", "text": "\n".join(text_lines)}


# Re-export for the loop module.
__all__ = ["decide"]


def _unused_imports() -> tuple[FinalEvent, Any]:  # pragma: no cover
    return FinalEvent(), None
