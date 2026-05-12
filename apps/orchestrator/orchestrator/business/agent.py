"""Business Agent runtime — backed by the Yggdrasil-style 7-site harness.

What used to be a Supervisor + Sub-Agent dispatch is now a single tight loop. The
harness handles routing, tool calls, memory verification, critic, compaction,
swarm, and output decision. Sub-agents collapse into capability calls (which they
already were).

This module is the boundary between the Kafka dispatcher (which gives us a parsed
``MessagesInboundEvent``) and the harness (which expects a normalized text + history).
"""

from __future__ import annotations

from typing import Any

from sqlalchemy import text as sa_text

from veda_shared.infra.postgres import get_session
from veda_shared.logging import get_logger
from veda_shared.schemas.events import MessagesInboundEvent

from orchestrator.common.blueprint_loader import load_blueprint
from orchestrator.common.conversation import (
    append_inbound_message,
    append_outbound_message,
    get_or_create_thread,
    get_recent_messages,
)
from orchestrator.harness import HarnessResult, run_harness
from orchestrator.harness.loop import HarnessCaps, HarnessInputs

log = get_logger(__name__)


async def _resolve_principal_role(principal_id: str, tenant_id: str) -> str | None:
    """Return 'owner' / 'admin' / 'operator' / 'viewer' if the principal is a
    member of this tenant; None if they're a normal customer. Used to unlock
    admin-mode capabilities (catalog.add etc.) for the business owner when
    they chat with their own agent."""
    async with get_session() as session:
        row = (await session.execute(
            sa_text(
                "SELECT role FROM core.tenant_memberships "
                "WHERE principal_id = CAST(:p AS uuid) AND tenant_id = CAST(:t AS uuid) "
                "LIMIT 1"
            ),
            {"p": principal_id, "t": tenant_id},
        )).first()
        return row[0] if row else None


async def handle_business_message(msg: MessagesInboundEvent) -> dict[str, Any] | None:
    """Run one harness turn. Returns canonical content for the outbound message,
    or None if the turn produced no customer-facing reply (escalated, expired, etc.)."""
    assert msg.tenant_id is not None

    blueprint = await load_blueprint(msg.tenant_id)
    thread = await get_or_create_thread(msg)
    thread_id = str(thread.get("id") or thread.get("_id"))
    await append_inbound_message(thread_id, msg)

    text = _extract_text(msg)
    if not text:
        log.info("business.no_text", tenant_id=msg.tenant_id)
        return None

    recent = await get_recent_messages(msg.tenant_id, thread_id, limit=10)
    history = _to_chat_messages(recent)

    # Detect if the sender is a member of this tenant — unlocks admin-mode.
    role = await _resolve_principal_role(msg.principal_id, msg.tenant_id)
    if role:
        log.info("business.admin_mode", tenant_id=msg.tenant_id, principal_id=msg.principal_id, role=role)

    caps = _caps_from_blueprint(blueprint)
    inputs = HarnessInputs(
        tenant_id=msg.tenant_id,
        thread_id=thread_id,
        principal_id=msg.principal_id,
        user_message_text=text,
        history=history,
        blueprint=blueprint,
        principal_role=role,
    )

    result: HarnessResult = await run_harness(inputs, caps)
    log.info(
        "harness.turn_complete",
        tenant_id=msg.tenant_id,
        turn_id=result.turn_id,
        outcome=result.outcome.value,
        termination_code=result.termination_code,
        iterations=result.iterations,
        cost_paise=result.cost_paise,
        elapsed_ms=result.elapsed_ms,
    )

    outbound = result.outbound
    if outbound is not None:
        await append_outbound_message(
            msg.tenant_id,
            thread_id,
            outbound,
            {
                "harness_turn_id": result.turn_id,
                "outcome": result.outcome.value,
                "termination_code": result.termination_code,
                "iterations": result.iterations,
                "cost_paise": result.cost_paise,
            },
        )

    if result.pending_approval:
        log.info(
            "harness.suspended",
            tenant_id=msg.tenant_id,
            turn_id=result.turn_id,
            kind=result.pending_approval.get("kind"),
            capability=result.pending_approval.get("capability"),
        )
        # The Kafka dispatcher doesn't surface approvals directly — they flow
        # through the dashboard's daemon-proposal queue, which reads the
        # harness_journal Mongo collection.

    return outbound


def _extract_text(msg: MessagesInboundEvent) -> str | None:
    c = msg.content
    if hasattr(c, "type"):
        if c.type == "text":
            return getattr(c, "text", None)
        if c.type == "voice":
            return getattr(c, "transcription", None)
        if c.type in ("button_reply", "list_reply"):
            return getattr(c, "selected_title", None)
        if c.type == "image":
            return getattr(c, "caption", None)
    return None


def _to_chat_messages(recent: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Convert Mongo-stored conversation docs to the chat-message shape the harness expects."""
    out: list[dict[str, Any]] = []
    for d in recent[-10:]:
        c = d.get("content") or {}
        if not isinstance(c, dict):
            continue
        text: str | None = None
        if c.get("type") == "text":
            text = c.get("text")
        elif c.get("type") == "voice":
            text = c.get("transcription")
        elif c.get("type") in ("button_reply", "list_reply"):
            text = c.get("selected_title")
        if not text:
            continue
        role = "user" if d.get("direction") == "inbound" else "assistant"
        out.append({"role": role, "content": text})
    return out


def _caps_from_blueprint(blueprint: dict[str, Any] | None) -> HarnessCaps:
    """Pull per-tenant cap overrides from blueprint.policies.harness if set."""
    base = HarnessCaps()
    if not blueprint:
        return base
    h = blueprint.get("policies", {}).get("harness") or {}
    return HarnessCaps(
        max_iterations=int(h.get("max_iterations", base.max_iterations)),
        max_wallclock_ms=int(h.get("max_wallclock_ms", base.max_wallclock_ms)),
        max_iteration_wallclock_ms=int(
            h.get("max_iteration_wallclock_ms", base.max_iteration_wallclock_ms)
        ),
        max_cost_paise=int(h.get("max_cost_paise", base.max_cost_paise)),
        max_actions_per_iteration=int(
            h.get("max_actions_per_iteration", base.max_actions_per_iteration)
        ),
        max_total_actions=int(h.get("max_total_actions", base.max_total_actions)),
        max_swarm_depth=int(h.get("max_swarm_depth", base.max_swarm_depth)),
        max_no_progress_iterations=int(
            h.get("max_no_progress_iterations", base.max_no_progress_iterations)
        ),
        critic_enabled_default=bool(h.get("critic_enabled_default", base.critic_enabled_default)),
    )
