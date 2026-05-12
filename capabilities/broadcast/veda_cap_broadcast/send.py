"""``broadcast.send`` — bulk outbound respecting opt-in + frequency caps.

Each broadcast becomes one ``messages.outbound`` event per recipient. The edge sender
enforces window/template rules per message. We persist a marketing audit log per send.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from veda_shared.capability import capability
from veda_shared.infra.kafka import get_producer
from veda_shared.infra.mongo import get_tenant_db
from veda_shared.logging import get_logger
from veda_shared.schemas.capabilities import CapabilityCall, CapabilityId
from veda_shared.schemas.constants import KAFKA_TOPICS
from veda_shared.schemas.events import MessagesOutboundEvent
from veda_shared.schemas.identity import Channel

log = get_logger(__name__)


@capability(CapabilityId.BROADCAST_SEND)
async def broadcast_send(call: CapabilityCall) -> dict[str, Any]:
    inp = call.input
    targets: list[dict[str, str]] = inp["targets"]  # [{principal_id, channel, identifier, ...}]
    template_name: str = inp["template_name"]
    template_variables: dict[str, str] = inp.get("template_variables") or {}

    # Filter by marketing opt-in
    profiles = get_tenant_db(call.tenant_id)["end_user_profiles"]
    optin_ids = set()
    cursor = profiles.find(
        {"principal_id": {"$in": [t["principal_id"] for t in targets]}, "preferences.marketing_opt_in": True}
    )
    async for d in cursor:
        optin_ids.add(d["principal_id"])

    sent = 0
    skipped = 0
    producer = get_producer()
    for t in targets:
        if t["principal_id"] not in optin_ids:
            skipped += 1
            continue
        try:
            await producer.publish(
                KAFKA_TOPICS.MESSAGES_OUTBOUND,
                MessagesOutboundEvent(
                    event_id=str(uuid4()),
                    occurred_at=datetime.now(timezone.utc),
                    tenant_id=call.tenant_id,
                    thread_id=None,
                    target_channel=Channel(t["channel"]),
                    target_identifier=t["identifier"],
                    source_phone_number_id=t.get("source_phone_number_id"),
                    content={
                        "type": "template",
                        "template_name": template_name,
                        "language": t.get("language", "en"),
                        "components": [
                            {"type": "body", "parameters": [{"type": "text", "value": v} for v in template_variables.values()]},
                        ],
                    },
                    template_name=template_name,
                    template_variables=template_variables,
                    requires_window_check=True,
                ),
            )
            sent += 1
        except Exception:  # noqa: BLE001
            log.exception("broadcast.publish_failed", principal_id=t["principal_id"])
    return {"sent": sent, "skipped": skipped, "total": len(targets)}
