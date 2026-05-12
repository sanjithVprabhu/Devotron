"""Async Redis client (singleton)."""

from __future__ import annotations

import redis.asyncio as redis

from veda_shared.settings import get_settings

_client: redis.Redis | None = None


def get_redis() -> redis.Redis:
    global _client
    if _client is None:
        _client = redis.from_url(get_settings().redis_url, decode_responses=True)
    return _client


def tenant_key(tenant_id: str, *parts: str) -> str:
    return ":".join(["tenant", tenant_id, *parts])


def global_key(*parts: str) -> str:
    return ":".join(["global", *parts])
