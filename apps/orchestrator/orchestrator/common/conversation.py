"""Conversation thread loading + persistence helpers shared by all agents."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from sqlalchemy import text

from veda_shared.infra.mongo import get_tenant_db
from veda_shared.infra.postgres import with_tenant
from veda_shared.schemas.events import MessagesInboundEvent

VEDA_TENANT_FOR_CONVERSATIONS = None  # threads with tenant_id NULL handled separately


async def get_or_create_thread(msg: MessagesInboundEvent) -> dict[str, Any]:
    """Find or create a conversations.threads row for the (tenant, principal, channel)."""
    if msg.tenant_id is None:
        # Veda threads — synthetic UUID per (principal, channel). Stored in a separate
        # table in production; for v1 we maintain in Mongo to keep Veda self-contained.
        db = get_tenant_db("veda")
        col = db["conversations"]
        existing = await col.find_one(
            {"principal_id": msg.principal_id, "channel": msg.channel.value}
        )
        if existing:
            return existing
        doc = {
            "tenant_id": None,
            "principal_id": msg.principal_id,
            "channel": msg.channel.value,
            "agent_type": "veda",
            "status": "active",
            "message_count": 0,
            "created_at": datetime.now(timezone.utc),
            "updated_at": datetime.now(timezone.utc),
        }
        result = await col.insert_one(doc)
        doc["_id"] = result.inserted_id
        return doc

    async with with_tenant(msg.tenant_id) as session:
        rows = await session.execute(
            text(
                """
                SELECT id::text AS id, status, message_count, last_message_at
                FROM conversations.threads
                WHERE tenant_id = :tid AND principal_id = :pid AND channel = :ch
                ORDER BY created_at DESC LIMIT 1
                """
            ),
            {"tid": msg.tenant_id, "pid": msg.principal_id, "ch": msg.channel.value},
        )
        row = rows.mappings().first()
        if row:
            return dict(row)
        ins = await session.execute(
            text(
                """
                INSERT INTO conversations.threads
                  (tenant_id, principal_id, channel, agent_type, status, message_count, last_message_at)
                VALUES (:tid, :pid, :ch, 'business', 'active', 0, NOW())
                RETURNING id::text AS id
                """
            ),
            {"tid": msg.tenant_id, "pid": msg.principal_id, "ch": msg.channel.value},
        )
        new_id = ins.scalar_one()
        return {"id": new_id, "status": "active", "message_count": 0}


async def append_inbound_message(thread_id: str | None, msg: MessagesInboundEvent) -> None:
    """Append the inbound message to MongoDB (full content + agent_metadata placeholder)."""
    tenant_key = msg.tenant_id or "veda"
    db = get_tenant_db(tenant_key)
    await db["messages"].insert_one(
        {
            "tenant_id": msg.tenant_id,
            "thread_id": thread_id,
            "message_id": msg.channel_message_id,
            "direction": "inbound",
            "channel": msg.channel.value,
            "sender_principal_id": msg.principal_id,
            "content": msg.content.model_dump(mode="json") if hasattr(msg.content, "model_dump") else msg.content,
            "agent_metadata": {},
            "delivery_status": "delivered",
            "created_at": datetime.now(timezone.utc),
        }
    )


async def append_outbound_message(
    tenant_id: str | None,
    thread_id: str | None,
    content: dict[str, Any],
    agent_metadata: dict[str, Any] | None = None,
) -> None:
    db = get_tenant_db(tenant_id or "veda")
    await db["messages"].insert_one(
        {
            "tenant_id": tenant_id,
            "thread_id": thread_id,
            "direction": "outbound",
            "content": content,
            "agent_metadata": agent_metadata or {},
            "delivery_status": "queued",
            "created_at": datetime.now(timezone.utc),
        }
    )


async def get_recent_messages(
    tenant_id: str | None, thread_id: str | None, limit: int = 10
) -> list[dict[str, Any]]:
    if thread_id is None:
        return []
    db = get_tenant_db(tenant_id or "veda")
    cursor = db["messages"].find({"thread_id": thread_id}).sort("created_at", -1).limit(limit)
    docs = await cursor.to_list(length=limit)
    docs.reverse()
    return docs
