"""Orchestrator entrypoint.

Runs:
- A FastAPI server (health + admin endpoints)
- A Kafka consumer on ``veda.messages.inbound`` that dispatches to either Veda
  or a tenant's Business Agent based on ``tenant_id``.
"""

from __future__ import annotations

import asyncio
import os
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Any, AsyncIterator
from uuid import uuid4

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

from sqlalchemy import text as sa_text

from orchestrator import register_capabilities
from orchestrator.business.agent import handle_business_message
from orchestrator.dispatcher import start_dispatcher, stop_dispatcher
from orchestrator.veda.agent import handle_veda_message
from veda_shared.infra.postgres import get_session
from veda_shared.logging import get_logger
from veda_shared.otel import setup_otel
from veda_shared.schemas.canonical import TextContent
from veda_shared.schemas.events import MessagesInboundEvent
from veda_shared.schemas.identity import Channel
from veda_shared.settings import get_settings

log = get_logger(__name__)


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    setup_otel("veda-orchestrator")
    register_capabilities()  # registers @capability handlers into the global registry
    log.info("orchestrator.starting")
    consumer_task = asyncio.create_task(start_dispatcher())
    try:
        yield
    finally:
        await stop_dispatcher()
        consumer_task.cancel()
        try:
            await consumer_task
        except asyncio.CancelledError:
            pass
        log.info("orchestrator.stopped")


app = FastAPI(title="VEDA Orchestrator", version="0.0.1", lifespan=lifespan)


@app.get("/healthz")
async def healthz() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/readyz")
async def readyz() -> dict[str, str]:
    return {"status": "ready"}


# Synchronous agent test endpoint — bypasses Kafka, runs the harness directly,
# returns the agent's reply in the response. Gated behind ENABLE_TEST_API so it
# can never be enabled accidentally in prod. Use for Postman / curl / E2E tests.
class TestAgentRequest(BaseModel):
    tenant_id: str | None = Field(
        default=None,
        description="Tenant UUID for business agent. Set to null/omit to talk to Veda meta-agent.",
    )
    text: str = Field(min_length=1, max_length=4096, description="The customer's message")
    sender_identifier: str = Field(default="+919999999999", description="Customer's phone (E.164) — auto-creates principal if new")
    thread_id: str | None = Field(default=None, description="Optional — if omitted a new thread is created")
    channel: str = Field(default="whatsapp", description="whatsapp | telegram | internal")
    recipient_identifier: str = Field(default="+910000000000", description="Business's channel identifier")
    principal_id: str | None = Field(default=None, description="Optional — overrides phone-based lookup")


class TestAgentResponse(BaseModel):
    outbound_content: dict[str, Any] | None
    reply_text: str | None
    principal_id: str
    note: str


async def _resolve_or_create_principal(channel: str, identifier: str) -> str:
    """Mirrors the edge identity resolver: lookup by (channel, identifier),
    create principal + identifier row if missing. Used only by the test endpoint."""
    async with get_session() as session:
        async with session.begin():
            existing = await session.execute(
                sa_text("SELECT principal_id::text FROM core.identifiers WHERE channel = :c AND identifier = :i LIMIT 1"),
                {"c": channel, "i": identifier},
            )
            row = existing.first()
            if row:
                return row[0]
            new_principal = await session.execute(
                sa_text("INSERT INTO core.principals (display_name, metadata) VALUES (NULL, '{}'::jsonb) RETURNING id::text"),
            )
            principal_id = new_principal.scalar_one()
            verified = channel in ("whatsapp", "twitter")
            await session.execute(
                sa_text(
                    "INSERT INTO core.identifiers (principal_id, channel, identifier, verified) "
                    "VALUES (CAST(:p AS uuid), :c, :i, :v)"
                ),
                {"p": principal_id, "c": channel, "i": identifier, "v": verified},
            )
            return principal_id


@app.post("/test/agent", response_model=TestAgentResponse)
async def test_agent(req: TestAgentRequest) -> TestAgentResponse:
    if os.environ.get("ENABLE_TEST_API", "").lower() not in ("1", "true", "yes"):
        raise HTTPException(status_code=404, detail="test API disabled — set ENABLE_TEST_API=true")

    try:
        channel = Channel(req.channel)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"invalid channel: {req.channel}")

    principal_id = req.principal_id or await _resolve_or_create_principal(req.channel, req.sender_identifier)

    event = MessagesInboundEvent(
        event_id=str(uuid4()),
        occurred_at=datetime.now(timezone.utc),
        tenant_id=req.tenant_id,
        thread_id=req.thread_id,
        principal_id=principal_id,
        channel=channel,
        channel_message_id=f"test-{uuid4()}",
        sender_identifier=req.sender_identifier,
        recipient_identifier=req.recipient_identifier,
        content=TextContent(type="text", text=req.text),
        raw_payload={"source": "test_agent_endpoint"},
    )

    log.info("test_agent.invoked", tenant_id=req.tenant_id, principal_id=principal_id)
    if req.tenant_id is None:
        outbound = await handle_veda_message(event)
    else:
        outbound = await handle_business_message(event)

    reply_text: str | None = None
    if outbound is not None:
        if outbound.get("type") == "text":
            reply_text = outbound.get("text")
        elif outbound.get("type") == "buttons":
            reply_text = outbound.get("body_text")
        elif outbound.get("type") == "list":
            reply_text = outbound.get("body_text")

    return TestAgentResponse(
        outbound_content=outbound,
        reply_text=reply_text,
        principal_id=principal_id,
        note=(
            "Agent reply is in outbound_content. Full harness journal in MongoDB harness_journal collection."
            if outbound is not None
            else "Agent produced no reply (escalation or no-text input). Check MongoDB harness_journal for details."
        ),
    )


def cli() -> None:  # pragma: no cover
    import uvicorn

    uvicorn.run(
        "orchestrator.main:app",
        host="0.0.0.0",
        port=int(__import__("os").environ.get("PORT", "8081")),
        log_level=get_settings().log_level,
    )


if __name__ == "__main__":  # pragma: no cover
    cli()
