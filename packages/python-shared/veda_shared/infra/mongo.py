"""Async MongoDB client. Per-tenant database isolation enforced at access time."""

from __future__ import annotations

from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase

from veda_shared.settings import get_settings

_client: AsyncIOMotorClient | None = None


def get_mongo_client() -> AsyncIOMotorClient:
    global _client
    if _client is None:
        _client = AsyncIOMotorClient(get_settings().mongo_url)
    return _client


def get_tenant_db(tenant_id: str) -> AsyncIOMotorDatabase:
    """Returns the per-tenant database. Collections live inside this DB:
    ``catalog_items``, ``messages``, ``agent_checkpoints``, ``end_user_profiles``,
    ``integration_sync_state``."""
    prefix = get_settings().mongo_db_prefix
    return get_mongo_client()[f"{prefix}{tenant_id}"]
