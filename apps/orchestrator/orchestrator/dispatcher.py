"""Top-level dispatcher: consumes ``veda.messages.inbound`` and routes each
message to either the Veda meta-agent or a tenant's Business Agent."""

from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

from pydantic import BaseModel

from orchestrator.business.agent import handle_business_message
from orchestrator.veda.agent import handle_veda_message
from veda_shared.infra.kafka import KafkaConsumer, get_producer
from veda_shared.logging import get_logger
from veda_shared.schemas.constants import KAFKA_TOPICS
from veda_shared.schemas.events import MessagesInboundEvent, MessagesOutboundEvent

log = get_logger(__name__)

_consumer: KafkaConsumer | None = None


async def _publish_outbound(envelope: MessagesOutboundEvent) -> None:
    await get_producer().publish(KAFKA_TOPICS.MESSAGES_OUTBOUND, envelope)


async def _dispatch(event: BaseModel) -> None:
    msg = event  # type: ignore[assignment]
    assert isinstance(msg, MessagesInboundEvent)
    log.info(
        "inbound.received",
        tenant_id=msg.tenant_id,
        principal_id=msg.principal_id,
        channel=msg.channel.value,
        type=msg.content.type if hasattr(msg.content, "type") else "unknown",
    )

    try:
        if msg.tenant_id is None:
            outbound = await handle_veda_message(msg)
        else:
            outbound = await handle_business_message(msg)
    except Exception:
        log.exception("dispatch.handler_failed", tenant_id=msg.tenant_id, message_id=msg.channel_message_id)
        # Per spec: never send "sorry I'm having trouble" — escalate silently.
        return

    if outbound is None:
        return  # handler chose not to respond (e.g. interactive ack)

    envelope = MessagesOutboundEvent(
        event_id=str(uuid4()),
        occurred_at=datetime.now(timezone.utc),
        tenant_id=msg.tenant_id,
        thread_id=msg.thread_id,
        target_channel=msg.channel,
        target_identifier=msg.sender_identifier,
        source_phone_number_id=None,  # Resolved by sender from tenant context
        content=outbound,
    )
    await _publish_outbound(envelope)


async def start_dispatcher() -> None:
    global _consumer
    if _consumer is not None:
        return
    _consumer = KafkaConsumer(KAFKA_TOPICS.MESSAGES_INBOUND, group_id="agent-orchestrator")
    log.info("dispatcher.starting")
    await _consumer.run(_dispatch)


async def stop_dispatcher() -> None:
    global _consumer
    if _consumer is not None:
        await _consumer.stop()
        _consumer = None
