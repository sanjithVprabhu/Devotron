"""Site 3 — Skeptical memory verification.

For every <call> that flagged ``memory_claim="true"``, the harness re-reads the
underlying source-of-truth before letting Site 2 execute. If the claim doesn't
hold, the call is removed from the cleared list and a corrective note is fed
back to the model on the next iteration.

This is the single most important reason the Claude Code harness rarely
hallucinates file contents — verify before commit.
"""

from __future__ import annotations

from typing import Any

from veda_shared.logging import get_logger

from orchestrator.harness.memory import verify_memory_claim
from orchestrator.harness.state import HarnessState, SiteName
from orchestrator.harness.tags import CallEvent, RecallEvent

log = get_logger(__name__)


async def verify(
    *,
    state: HarnessState,
    cleared_calls: list[CallEvent],
    recalls: list[RecallEvent],
    tenant_id: str | None,
    principal_id: str,
    thread_id: str | None,
) -> tuple[list[CallEvent], list[dict[str, Any]], list[dict[str, Any]]]:
    """Returns (still_cleared, corrective_notes, recall_results)."""
    still_cleared: list[CallEvent] = []
    corrections: list[dict[str, Any]] = []

    for call in cleared_calls:
        if not call.memory_claim:
            still_cleared.append(call)
            continue
        ok, _corrected_args, note = await verify_memory_claim(
            capability=call.name,
            args=call.args,
            tenant_id=tenant_id,
            principal_id=principal_id,
        )
        if ok:
            still_cleared.append(call)
        else:
            corrections.append(
                {
                    "call": call.name,
                    "id": call.correlation_id,
                    "ok": False,
                    "output": None,
                    "error": f"memory verification failed: {note}",
                }
            )

    # <recall> lookups: read live memory and inject the result.
    recall_results: list[dict[str, Any]] = []
    for r in recalls:
        from orchestrator.harness.memory import read_memory

        value = await read_memory(
            scope=r.scope,
            key=r.key,
            tenant_id=tenant_id,
            principal_id=principal_id,
            thread_id=thread_id,
        )
        recall_results.append(
            {
                "call": "recall",
                "id": r.key,
                "ok": True,
                "output": {"key": r.key, "scope": r.scope, "value": value},
                "error": None,
            }
        )

    state.append_site(
        SiteName.MEMORY_VERIFY,
        outcome="ok" if not corrections else "ok:with_corrections",
        payload={
            "verified": len([c for c in cleared_calls if c.memory_claim]),
            "corrected": len(corrections),
            "recalls": len(recalls),
        },
    )
    return still_cleared, corrections, recall_results
