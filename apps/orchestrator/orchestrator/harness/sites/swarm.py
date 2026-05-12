"""Site 6 — Swarm handoff.

When the model emits ``<swarm name="..." objective="...">`` it asks for a
specialised sub-agent to solve a focused sub-task in an isolated context. The
sub-agent gets a fresh prompt (no parent transcript) plus the swarm context,
runs its own short loop, returns a structured summary.

V1 sub-agents are kept simple — single-shot LLM calls scoped to one of:
  - ``research:vertical_intel`` — competitive landscape for a vertical
  - ``research:product_specs``  — look up technical specs for a part by OEM number
  - ``draft:longform``          — draft a long message (newsletter, FAQ entry)

Each sub-agent has a tight token budget so it can't run away.
"""

from __future__ import annotations

from typing import Any

from llm_router import get_router
from veda_shared.logging import get_logger

from orchestrator.harness.state import HarnessState, SiteName
from orchestrator.harness.tags import SwarmEvent

log = get_logger(__name__)

SUB_AGENT_PROMPTS: dict[str, str] = {
    "research:vertical_intel": (
        "You are a research sub-agent. Given a vertical and location, output a brief "
        "competitive analysis: typical price points, common customer questions, "
        "key suppliers. <= 200 words. No fabrication; if unsure, say so."
    ),
    "research:product_specs": (
        "You are a parts-spec sub-agent. Given OEM numbers and a vehicle, output "
        "fitment notes (variants, years), known compatible aftermarket brands, "
        "common failure modes. <= 200 words."
    ),
    "draft:longform": (
        "You are a drafting sub-agent. Given a target audience and a topic, "
        "produce a clean draft suitable for sending or publishing. <= 400 words."
    ),
}


async def maybe_run(
    *, state: HarnessState, swarms: list[SwarmEvent], tenant_id: str | None
) -> list[dict[str, Any]]:
    if not swarms:
        state.append_site(SiteName.SWARM, outcome="skip", payload={})
        return []

    results: list[dict[str, Any]] = []
    for s in swarms:
        sys_prompt = SUB_AGENT_PROMPTS.get(s.sub_agent_name)
        if not sys_prompt:
            results.append(
                {
                    "call": "swarm",
                    "id": s.sub_agent_name,
                    "ok": False,
                    "output": None,
                    "error": f"unknown sub-agent: {s.sub_agent_name}",
                }
            )
            continue
        try:
            resp = await get_router().complete(
                task="market_analysis",
                tenant_id=tenant_id,
                system=sys_prompt,
                messages=[
                    {
                        "role": "user",
                        "content": f"Objective: {s.objective}\n\nContext: {s.context}",
                    }
                ],
                max_tokens=600,
            )
            results.append(
                {
                    "call": "swarm",
                    "id": s.sub_agent_name,
                    "ok": True,
                    "output": {
                        "sub_agent": s.sub_agent_name,
                        "objective": s.objective,
                        "summary": resp.text.strip(),
                    },
                    "error": None,
                }
            )
        except Exception as e:  # noqa: BLE001
            log.exception("harness.swarm.failed", sub_agent=s.sub_agent_name)
            results.append(
                {
                    "call": "swarm",
                    "id": s.sub_agent_name,
                    "ok": False,
                    "output": None,
                    "error": str(e),
                }
            )

    state.append_site(
        SiteName.SWARM,
        outcome="ok",
        payload={"sub_agents": [s.sub_agent_name for s in swarms], "results": len(results)},
    )
    return results
