"""Veda meta-agent — LLM-driven, vertical-agnostic.

When a message arrives without a tenant_id, it's routed here. Veda runs an
adaptive interview to set up a new business: asks one natural question at a
time, fills out a Blueprint draft, and provisions a real tenant when complete.

Replaces the older state machine + hardcoded auto-parts question tree.
"""

from __future__ import annotations

from typing import Any

from llm_router import get_router
from orchestrator.common.conversation import (
    append_inbound_message,
    append_outbound_message,
    get_or_create_thread,
)
from orchestrator.intake.interview import (
    drive_interview,
    opening_message,
)
from orchestrator.intake.provisioning import provision_tenant_from_draft
from orchestrator.veda.session import VedaSession, load_session, save_session
from veda_shared.logging import get_logger
from veda_shared.schemas.events import MessagesInboundEvent

log = get_logger(__name__)


async def handle_veda_message(msg: MessagesInboundEvent) -> dict[str, Any] | None:
    thread = await get_or_create_thread(msg)
    thread_id = str(thread.get("_id") or thread.get("id"))
    await append_inbound_message(thread_id, msg)

    session = await load_session(msg.principal_id)
    text = _extract_text(msg)
    if text is None:
        return None

    # Already onboarded — Veda's role here is over; this principal already has
    # a tenant. Return a brief acknowledgement.
    if session.state == "onboarded":
        result = {
            "type": "text",
            "text": (
                f"You're all set up with {session.draft_blueprint.get('business_name', 'your business')}. "
                "Manage it from your dashboard, or say 'modify' to change something."
            ),
        }
        await save_session(session)
        await append_outbound_message(None, thread_id, result, {"sub_agent": "veda"})
        return result

    # First contact — open the interview.
    if session.state == "new":
        opening = await opening_message(text)
        session.state = "interviewing"
        session.intake_history.append({"role": "user", "text": text})
        session.intake_history.append({"role": "veda", "text": opening})
        await save_session(session)
        result = {"type": "text", "text": opening}
        await append_outbound_message(None, thread_id, result, {"sub_agent": "veda"})
        return result

    # In progress — drive one interview turn.
    decision = await drive_interview(
        history=session.intake_history,
        current_draft=session.draft_blueprint,
        latest_user_message=text,
    )
    session.intake_history.append({"role": "user", "text": text})
    session.draft_blueprint.update(decision.draft_updates)

    if decision.next_action == "ask":
        session.intake_history.append({"role": "veda", "text": decision.say})
        await save_session(session)
        result = {"type": "text", "text": decision.say}
        await append_outbound_message(None, thread_id, result, {"sub_agent": "veda"})
        return result

    # Finalize: provision the tenant.
    try:
        provisioned = await provision_tenant_from_draft(
            owner_principal_id=msg.principal_id,
            draft=session.draft_blueprint,
        )
    except Exception as e:  # noqa: BLE001
        log.exception("veda.provisioning_failed", principal_id=msg.principal_id, error=str(e))
        # Don't lose the interview — keep state and surface the error.
        result = {
            "type": "text",
            "text": (
                "I have everything but ran into a setup issue on my end. "
                "Try once more — your answers are saved."
            ),
        }
        await append_outbound_message(None, thread_id, result, {"sub_agent": "veda", "error": str(e)})
        return result

    session.state = "onboarded"
    session.intake_history.append({"role": "veda", "text": decision.say})
    session.draft_blueprint = {**session.draft_blueprint, **provisioned}
    await save_session(session)

    chat_url = provisioned.get("chat_url")
    profile_url = provisioned.get("profile_url")
    confirmation_lines = [decision.say, ""]
    confirmation_lines.append(f"✓ {provisioned['business_name']} is live.")
    if chat_url:
        confirmation_lines.append("")
        confirmation_lines.append(
            f"📲 Your customers can now chat with your agent here: {chat_url}"
        )
    if profile_url:
        confirmation_lines.append(
            f"🔗 Share this profile link in your Instagram bio / Linktree: {profile_url}"
        )
    confirmation_lines.append("")
    confirmation_lines.append(
        "Go to your chat URL above and message your agent as the owner — "
        "say things like 'add a product' or 'list my items' and it'll help you "
        "populate the catalog. Or sign in to the dashboard for bulk management."
    )
    confirmation = "\n".join(confirmation_lines)
    result = {"type": "text", "text": confirmation}
    await append_outbound_message(
        None,
        thread_id,
        result,
        {"sub_agent": "veda", "tenant_provisioned": provisioned["tenant_id"]},
    )
    return result


def _extract_text(msg: MessagesInboundEvent) -> str | None:
    c = msg.content
    if hasattr(c, "type"):
        if c.type == "text":
            return getattr(c, "text", None)
        if c.type == "voice":
            return getattr(c, "transcription", None)
        if c.type in ("button_reply", "list_reply"):
            return getattr(c, "selected_title", None)
    return None
