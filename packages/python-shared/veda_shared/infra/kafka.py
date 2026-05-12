"""Async Kafka producer/consumer (aiokafka) with Pydantic validation per topic.

Wire format mirrors packages/kafka-client (TS): JSON, key = tenant_id || event_id,
trace context in headers.
"""

from __future__ import annotations

import json
from collections.abc import Awaitable, Callable
from typing import Any, TypeVar

from aiokafka import AIOKafkaConsumer, AIOKafkaProducer
from pydantic import BaseModel

from veda_shared.logging import get_logger
from veda_shared.schemas.constants import KAFKA_TOPICS
from veda_shared.schemas.events import (
    AgentActionEvent,
    AuditEvent,
    BillingUsageEvent,
    BlueprintMutationEvent,
    DaemonProposalEvent,
    EscalationEvent,
    IntegrationEvent,
    MessagesInboundEvent,
    MessagesOutboundEvent,
    OrderEvent,
)
from veda_shared.settings import get_settings

log = get_logger(__name__)

E = TypeVar("E", bound=BaseModel)

TOPIC_SCHEMA: dict[str, type[BaseModel]] = {
    KAFKA_TOPICS.MESSAGES_INBOUND: MessagesInboundEvent,
    KAFKA_TOPICS.MESSAGES_OUTBOUND: MessagesOutboundEvent,
    KAFKA_TOPICS.AGENT_ACTIONS: AgentActionEvent,
    KAFKA_TOPICS.BLUEPRINT_MUTATIONS: BlueprintMutationEvent,
    KAFKA_TOPICS.ORDERS: OrderEvent,
    KAFKA_TOPICS.ESCALATIONS: EscalationEvent,
    KAFKA_TOPICS.DAEMON_PROPOSALS: DaemonProposalEvent,
    KAFKA_TOPICS.BILLING_USAGE: BillingUsageEvent,
    KAFKA_TOPICS.AUDIT_LOG: AuditEvent,
    KAFKA_TOPICS.INTEGRATIONS_EVENTS: IntegrationEvent,
}


def _bootstrap_kwargs() -> dict[str, Any]:
    s = get_settings()
    kwargs: dict[str, Any] = {"bootstrap_servers": s.kafka_brokers_list}
    if s.kafka_sasl_mechanism and s.kafka_sasl_username:
        kwargs.update(
            sasl_mechanism=s.kafka_sasl_mechanism.upper(),
            sasl_plain_username=s.kafka_sasl_username,
            sasl_plain_password=s.kafka_sasl_password or "",
            security_protocol="SASL_SSL",
        )
    return kwargs


class KafkaProducer:
    def __init__(self) -> None:
        self._producer: AIOKafkaProducer | None = None

    async def start(self) -> None:
        if self._producer is None:
            self._producer = AIOKafkaProducer(
                client_id=get_settings().kafka_client_id,
                enable_idempotence=True,
                acks="all",
                value_serializer=lambda v: json.dumps(v, default=str).encode("utf-8"),
                key_serializer=lambda k: k.encode("utf-8") if k else None,
                **_bootstrap_kwargs(),
            )
            await self._producer.start()

    async def stop(self) -> None:
        if self._producer is not None:
            await self._producer.stop()
            self._producer = None

    async def publish(self, topic: str, event: BaseModel) -> None:
        if self._producer is None:
            await self.start()
        assert self._producer is not None

        schema = TOPIC_SCHEMA.get(topic)
        if schema is not None and not isinstance(event, schema):
            # Round-trip through dict to enforce schema parsing.
            event = schema.model_validate(event.model_dump())

        payload = event.model_dump(mode="json")
        key = (
            payload.get("tenant_id") if isinstance(payload.get("tenant_id"), str) else None
        ) or payload.get("event_id")
        headers = []
        trace_id = payload.get("trace_id")
        if trace_id:
            headers.append(("trace-id", trace_id.encode("utf-8")))

        await self._producer.send_and_wait(topic, value=payload, key=key, headers=headers)


_producer: KafkaProducer | None = None


def get_producer() -> KafkaProducer:
    global _producer
    if _producer is None:
        _producer = KafkaProducer()
    return _producer


class KafkaConsumer:
    """One consumer per topic + group. Validates each message and delegates
    to the handler. Errors during handling raise; consumer stops to surface them."""

    def __init__(self, topic: str, group_id: str) -> None:
        if topic not in TOPIC_SCHEMA:
            raise ValueError(f"unknown topic {topic}")
        self.topic = topic
        self.group_id = group_id
        self._consumer: AIOKafkaConsumer | None = None

    async def start(self) -> None:
        if self._consumer is None:
            self._consumer = AIOKafkaConsumer(
                self.topic,
                group_id=self.group_id,
                client_id=f"{get_settings().kafka_client_id}-{self.group_id}",
                enable_auto_commit=False,
                auto_offset_reset="latest",
                value_deserializer=lambda v: json.loads(v.decode("utf-8")),
                key_deserializer=lambda k: k.decode("utf-8") if k else None,
                **_bootstrap_kwargs(),
            )
            await self._consumer.start()

    async def stop(self) -> None:
        if self._consumer is not None:
            await self._consumer.stop()
            self._consumer = None

    async def run(self, handler: Callable[[BaseModel], Awaitable[None]]) -> None:
        await self.start()
        assert self._consumer is not None
        schema = TOPIC_SCHEMA[self.topic]
        try:
            async for msg in self._consumer:
                try:
                    event = schema.model_validate(msg.value)
                except Exception as exc:  # noqa: BLE001
                    log.error(
                        "kafka.malformed",
                        topic=self.topic,
                        offset=msg.offset,
                        error=str(exc),
                    )
                    await self._consumer.commit()
                    continue
                try:
                    await handler(event)
                    await self._consumer.commit()
                except Exception:
                    log.exception("kafka.handler_failed", topic=self.topic, offset=msg.offset)
                    raise
        finally:
            await self.stop()
