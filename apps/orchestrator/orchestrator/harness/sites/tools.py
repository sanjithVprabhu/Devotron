"""Site 2 — Tool execution.

Runs the cleared <call>s the model emitted this iteration. Calls that are
read-only and side-effect-free run in parallel for latency. Calls flagged
``side_effect=True`` run sequentially and are journaled both before (intent) and
after (result) so that a process crash mid-call can be reconciled.

Returns the list of tool-result records that get fed back to the model on the
next iteration.
"""

from __future__ import annotations

import asyncio
from typing import Any

from veda_shared.capability import registry
from veda_shared.logging import get_logger
from veda_shared.schemas.capabilities import CapabilityCall, CapabilityId, CapabilityResult

from orchestrator.harness.state import HarnessState, SiteName
from orchestrator.harness.tags import CallEvent

log = get_logger(__name__)


async def execute(
    *,
    state: HarnessState,
    cleared_calls: list[CallEvent],
    denied: list[dict[str, Any]],
    tenant_id: str | None,
    thread_id: str | None,
    principal_id: str,
) -> list[dict[str, Any]]:
    """Returns a list of tool_result records ready to feed back to the model.

    Shape: [{"call": str, "id": str|None, "ok": bool, "output": Any, "error": str|None}, ...]
    """
    if not cleared_calls and not denied:
        state.append_site(SiteName.TOOLS, outcome="skip", payload={"reason": "no calls"})
        return []

    # Denied first — feed each as a tool_result error.
    results: list[dict[str, Any]] = [
        {"call": d["call"], "id": None, "ok": False, "output": None, "error": d["reason"]}
        for d in denied
    ]

    parallel: list[CallEvent] = []
    sequential: list[CallEvent] = []
    for c in cleared_calls:
        (sequential if c.side_effect else parallel).append(c)

    # Run safe parallel reads first.
    if parallel:
        outcomes = await asyncio.gather(
            *(_invoke(c, tenant_id, thread_id, principal_id) for c in parallel),
            return_exceptions=False,
        )
        for c, r in zip(parallel, outcomes, strict=True):
            results.append(_to_result_record(c, r))

    # Sequential side-effecting calls — journal per call.
    for c in sequential:
        state.append_site(
            SiteName.TOOLS,
            outcome="intent",
            payload={"capability": c.name, "args": c.args, "correlation_id": c.correlation_id},
        )
        r = await _invoke(c, tenant_id, thread_id, principal_id)
        record = _to_result_record(c, r)
        results.append(record)
        state.append_site(
            SiteName.TOOLS,
            outcome="ok" if r.ok else "fail:tool_error",
            payload={"capability": c.name, "result": record},
        )

    if not sequential:
        state.append_site(
            SiteName.TOOLS,
            outcome="ok",
            payload={"calls": [c.name for c in cleared_calls], "results": len(results)},
        )
    return results


async def _invoke(
    call: CallEvent, tenant_id: str | None, thread_id: str | None, principal_id: str
) -> CapabilityResult:
    if not tenant_id:
        return CapabilityResult(
            capability=CapabilityId(call.name) if _is_known(call.name) else CapabilityId.SUPPORT_FAQ_SEARCH,
            ok=False,
            output=None,
            error=_err("tenant_required", "capability calls require tenant_id; you are in Veda mode"),
            duration_ms=0,
        )

    # Branch 1: built-in capability (Python-coded, registered at boot)
    if _is_known(call.name):
        return await registry.invoke(
            CapabilityCall(
                capability=CapabilityId(call.name),
                tenant_id=tenant_id,
                thread_id=thread_id,
                invoked_by_principal_id=principal_id,
                input=call.args,
            )
        )

    # Branch 2: dynamic tool (registered via dashboard UI, lives in business.api_tools)
    from orchestrator.tools import invoke_dynamic_tool, load_api_config, load_tool_by_name

    tool = await load_tool_by_name(tenant_id, call.name)
    if tool is None:
        return _synthetic_failure(call.name, "unknown_capability", f"no such capability or registered tool: {call.name}")
    config = await load_api_config(tenant_id)
    if config is None or not config.base_url_locked:
        return _synthetic_failure(call.name, "api_not_configured", "tenant has no locked api_config — tool can't run")

    # Acting-user injection: principal_id is the acting identity (Option A).
    # The tool / config controls whether to send it. The agent never invents an id.
    raw = await invoke_dynamic_tool(tool, call.args, config=config, acting_user_id=principal_id)

    # Pack as CapabilityResult. Use the fallback CapabilityId since the enum
    # doesn't know about dynamic tools — the harness preserves the original
    # name in the result record (see _to_result_record below).
    return CapabilityResult(
        capability=CapabilityId.SUPPORT_FAQ_SEARCH,  # placeholder — actual name kept in result record
        ok=bool(raw.get("ok")),
        output=raw.get("output"),
        error=_err("upstream_failure", str(raw.get("error"))) if not raw.get("ok") else None,
        duration_ms=int(raw.get("duration_ms") or 0),
    )


def _to_result_record(call: CallEvent, result: CapabilityResult) -> dict[str, Any]:
    return {
        "call": call.name,
        "id": call.correlation_id,
        "ok": result.ok,
        "output": result.output,
        "error": result.error.message if result.error else None,
        "duration_ms": result.duration_ms,
    }


def _is_known(name: str) -> bool:
    try:
        CapabilityId(name)
        return True
    except ValueError:
        return False


def _err(code: str, message: str):
    from veda_shared.schemas.capabilities import CapabilityErrorPayload

    return CapabilityErrorPayload(code=code, message=message)


def _synthetic_failure(name: str, code: str, message: str) -> CapabilityResult:
    fallback = CapabilityId.SUPPORT_FAQ_SEARCH
    return CapabilityResult(capability=fallback, ok=False, output=None, error=_err(code, message), duration_ms=0)
