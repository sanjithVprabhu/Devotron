"""Async Qdrant client + per-tenant collection naming convention."""

from __future__ import annotations

from qdrant_client import AsyncQdrantClient

from veda_shared.settings import get_settings

_client: AsyncQdrantClient | None = None


def get_qdrant_client() -> AsyncQdrantClient:
    global _client
    if _client is None:
        s = get_settings()
        _client = AsyncQdrantClient(url=s.qdrant_url, api_key=s.qdrant_api_key)
    return _client


def tenant_collection_name(tenant_id: str, kind: str) -> str:
    """Match the naming convention from spec/05_DATA_MODEL.md.

    Args:
        tenant_id: tenant UUID
        kind: ``catalog`` | ``faq`` | ``conversation_memory``
    """
    return f"{tenant_id}_{kind}"


VEDA_BUSINESS_DIRECTORY = "veda_business_directory"
