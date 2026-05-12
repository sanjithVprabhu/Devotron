"""Site 4 — Critic / safety review.

Optional cheap-LLM pass that scans the iteration's tool results + any pending
<say>/<ask> for problems before the loop continues. Catches:

  - Hallucinated specifics (price, stock, IDs that aren't in tool results).
  - Apologetic non-answers ("Sorry, I'm having trouble").
  - Confidence gap (tool returned empty + agent is about to confirm anyway).

When the critic flags an issue, the harness either:
  - Forces another iteration with a corrective note, or
  - Escalates to a human if the issue repeats.

Disabled by default in v1 to control cost; enable via blueprint
``policies.critic.enabled: true``. When disabled this site is a fast no-op.
"""

from __future__ import annotations

from typing import Any

from llm_router import get_router
from veda_shared.logging import get_logger

from orchestrator.harness.state import HarnessState, SiteName
from orchestrator.harness.tags import AskEvent, SayEvent

log = get_logger(__name__)


async def review(
    *,
    state: HarnessState,
    blueprint: dict[str, Any] | None,
    say_events: list[SayEvent],
    ask_events: list[AskEvent],
    tool_results: list[dict[str, Any]],
    tenant_id: str | None,
) -> dict[str, Any] | None:
    """Returns a corrective note dict (to feed back) when revision is needed,
    else None."""
    enabled = bool(
        (blueprint or {}).get("policies", {}).get("critic", {}).get("enabled", False)
    )
    if not enabled or (not say_events and not ask_events):
        state.append_site(SiteName.CRITIC, outcome="skip", payload={"enabled": enabled})
        return None

    draft = "\n".join(s.text for s in say_events)
    if ask_events:
        draft += "\n[Ask] " + ask_events[-1].body_text

    summary = _summarise_results(tool_results)

    resp = await get_router().complete(
        task="intent_classification",  # cheapest route — Haiku
        tenant_id=tenant_id,
        system=(
            "You are a safety reviewer for a customer-facing AI agent. "
            "Given the tool results and the agent's draft reply, decide whether "
            "the reply contains anything fabricated, evasive, or unsafe.\n"
            "Reply with exactly one line:\n"
            "OK\n"
            "or\n"
            "REVISE: <one-sentence reason>"
        ),
        messages=[
            {
                "role": "user",
                "content": f"Tool results:\n{summary}\n\nDraft reply:\n{draft}",
            }
        ],
        max_tokens=80,
        temperature=0,
    )
    decision = resp.text.strip().splitlines()[0] if resp.text.strip() else "OK"
    if decision.upper().startswith("REVISE"):
        reason = decision.split(":", 1)[1].strip() if ":" in decision else "unspecified"
        state.append_site(SiteName.CRITIC, outcome="revise", payload={"reason": reason})
        return {
            "call": "critic",
            "id": None,
            "ok": False,
            "output": None,
            "error": f"reviewer flagged this draft: {reason}. Revise or escalate.",
        }
    state.append_site(SiteName.CRITIC, outcome="ok", payload={})
    return None


def _summarise_results(results: list[dict[str, Any]]) -> str:
    if not results:
        return "(no tool calls this iteration)"
    lines = []
    for r in results:
        ok = "OK" if r.get("ok") else "ERROR"
        out = r.get("output") if r.get("ok") else r.get("error")
        out_str = str(out)
        if len(out_str) > 240:
            out_str = out_str[:240] + "…"
        lines.append(f"[{ok}] {r.get('call')}: {out_str}")
    return "\n".join(lines)
