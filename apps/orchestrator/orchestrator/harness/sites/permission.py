"""Site 1 — Permission gate.

For each <call> emitted this iteration, classify risk against the blueprint and
decide:

  - LOW    → run freely
  - MEDIUM → run unless blueprint policy explicitly requires approval for this call
  - HIGH   → always suspend turn; create a daemon-style proposal for owner approval
  - DENY   → drop the call; inject an error so the model knows it's not available
  - UNKNOWN capability → drop the call with an "unknown capability" error

Side effects:
  - Mutates `pending_calls` in place — only cleared calls remain.
  - Appends a SiteEntry summarising the gate decision per call.
  - May set TurnOutcome.SUSPEND when an approval is required.
"""

from __future__ import annotations

from typing import Any

from orchestrator.harness.risk import RiskLevel, classify, known_capability
from orchestrator.harness.state import HarnessState, SiteName, TurnOutcome
from orchestrator.harness.tags import CallEvent, RequestApprovalEvent
from veda_shared.logging import get_logger

log = get_logger(__name__)


async def gate(
    *,
    state: HarnessState,
    blueprint: dict[str, Any] | None,
    pending_calls: list[CallEvent],
    explicit_approvals: list[RequestApprovalEvent],
) -> tuple[list[CallEvent], list[dict[str, Any]], TurnOutcome | None]:
    """
    Returns (cleared_calls, denied_with_reason, maybe_short_circuit).

    `denied_with_reason` is a list of `{call, reason}` dicts that should be fed
    back to the model as tool_result errors.

    If any call requires approval, the harness short-circuits to SUSPEND and
    persists a pending_approval payload on the state.
    """
    cleared: list[CallEvent] = []
    denied: list[dict[str, Any]] = []

    # Explicit <request_approval> tags always suspend before any call runs.
    if explicit_approvals:
        ra = explicit_approvals[0]
        state.pending_approval = {
            "kind": "explicit",
            "capability": ra.capability,
            "label": ra.action_label,
            "payload": ra.payload,
        }
        state.append_site(
            SiteName.PERMISSION,
            outcome="suspend:explicit_approval_request",
            payload={"capability": ra.capability, "label": ra.action_label},
        )
        return cleared, denied, TurnOutcome.SUSPEND_PERMISSION

    # Resolve all dynamic tools for this tenant once per gate call so we can
    # classify capability names that aren't in the built-in enum.
    dynamic_tool_index: dict[str, Any] = {}
    if state.tenant_id:
        try:
            from orchestrator.tools import load_active_tools
            from orchestrator.tools.dispatcher import classify_risk as classify_dynamic_risk

            for tool in await load_active_tools(state.tenant_id):
                dynamic_tool_index[tool.name] = tool
        except Exception as e:  # noqa: BLE001
            log.warning("permission.dynamic_tool_load_failed", error=str(e))

    decisions: list[dict[str, Any]] = []
    for call in pending_calls:
        is_dynamic = call.name in dynamic_tool_index
        if not known_capability(call.name) and not is_dynamic:
            denied.append({"call": call.name, "reason": f"unknown capability: {call.name}"})
            decisions.append({"call": call.name, "decision": "deny:unknown"})
            continue

        if is_dynamic:
            risk_str = classify_dynamic_risk(dynamic_tool_index[call.name])  # 'low'|'medium'|'high'
            risk = RiskLevel(risk_str)
        else:
            risk = classify(call.name, blueprint)
        if risk == RiskLevel.DENY:
            denied.append({"call": call.name, "reason": "capability is disabled in v1"})
            decisions.append({"call": call.name, "decision": "deny:disabled"})
            continue

        if risk == RiskLevel.HIGH:
            # Side effect or money/messaging — always suspend for owner approval.
            state.pending_approval = {
                "kind": "high_risk_capability",
                "capability": call.name,
                "label": _label_for(call),
                "payload": call.args,
                "correlation_id": call.correlation_id,
            }
            state.append_site(
                SiteName.PERMISSION,
                outcome="suspend:high_risk",
                payload={"capability": call.name},
            )
            return cleared, denied, TurnOutcome.SUSPEND_PERMISSION

        if risk == RiskLevel.MEDIUM:
            # Honor blueprint policy: requires_approval array of capability ids.
            requires = (blueprint or {}).get("policies", {}).get("requires_approval", [])
            if call.name in requires:
                state.pending_approval = {
                    "kind": "policy_required",
                    "capability": call.name,
                    "label": _label_for(call),
                    "payload": call.args,
                    "correlation_id": call.correlation_id,
                }
                state.append_site(
                    SiteName.PERMISSION,
                    outcome="suspend:policy_required",
                    payload={"capability": call.name},
                )
                return cleared, denied, TurnOutcome.SUSPEND_PERMISSION

        # LOW risk — pass through.
        cleared.append(call)
        decisions.append({"call": call.name, "decision": f"allow:{risk.value}"})

    state.append_site(
        SiteName.PERMISSION,
        outcome="ok",
        payload={
            "cleared": [c.name for c in cleared],
            "denied": denied,
            "decisions": decisions,
        },
    )
    if denied and not cleared:
        log.info("harness.permission.all_denied", denied=denied)
    return cleared, denied, None


def _label_for(call: CallEvent) -> str:
    return f"{call.name}({', '.join(f'{k}={v!r}' for k, v in list(call.args.items())[:3])})"
