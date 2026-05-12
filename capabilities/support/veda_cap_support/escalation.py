"""``support.escalation.create`` — capability variant of the escalation sub-agent.

Lets non-orchestrator callers (e.g. dashboard) trigger escalation with the same effect.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from sqlalchemy import text

from veda_shared.capability import capability
from veda_shared.infra.kafka import get_producer
from veda_shared.infra.postgres import with_tenant
from veda_shared.schemas.capabilities import CapabilityCall, CapabilityId
from veda_shared.schemas.constants import KAFKA_TOPICS
from veda_shared.schemas.events import EscalationEvent


@capability(CapabilityId.SUPPORT_ESCALATION_CREATE)
async def support_escalation_create(call: CapabilityCall) -> dict[str, Any]:
    thread_id: str = call.input["thread_id"]
    reason: str = call.input["reason"]
    target: str = call.input.get("escalate_to", "operator")

    async with with_tenant(call.tenant_id) as session:
        await session.execute(
            text(
                """
                INSERT INTO conversations.escalations (tenant_id, thread_id, reason)
                VALUES (:tid, :thread_id, :reason)
                """
            ),
            {"tid": call.tenant_id, "thread_id": thread_id, "reason": reason},
        )
        await session.execute(
            text("UPDATE conversations.threads SET status='escalated' WHERE id = :tid"),
            {"tid": thread_id},
        )

    await get_producer().publish(
        KAFKA_TOPICS.ESCALATIONS,
        EscalationEvent(
            event_id=str(uuid4()),
            occurred_at=datetime.now(timezone.utc),
            tenant_id=call.tenant_id,
            thread_id=thread_id,
            reason=reason,
            escalate_to=target,  # type: ignore[arg-type]
        ),
    )
    return {"ok": True}
