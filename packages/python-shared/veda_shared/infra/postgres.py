"""Async SQLAlchemy engine + tenant-scoped session helper.

The TS edge layer is the source of truth for migrations (Drizzle). Python services
read/write through SQLAlchemy core/ORM but match the schemas in spec/05_DATA_MODEL.md.
"""

from __future__ import annotations

import re
from contextlib import asynccontextmanager
from typing import Any, AsyncIterator
from urllib.parse import parse_qs, urlencode, urlsplit, urlunsplit

from sqlalchemy import text
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from veda_shared.schemas.errors import ERROR_CODES, VedaError
from veda_shared.settings import get_settings

_engine: AsyncEngine | None = None
_session_factory: async_sessionmaker[AsyncSession] | None = None

_UUID_RE = re.compile(r"^[0-9a-fA-F-]{36}$")


# libpq query params that asyncpg doesn't understand — strip them and translate
# to connect_args. Neon/Postgres connection strings often carry these.
_LIBPQ_ONLY_PARAMS = {"sslmode", "channel_binding", "options", "application_name"}


def _to_async_url_and_args(url: str) -> tuple[str, dict[str, Any]]:
    """Return an asyncpg-compatible URL plus connect_args.

    libpq-style query params (sslmode, channel_binding, ...) are removed from
    the URL. ``sslmode`` is mapped to ``ssl=True`` for asyncpg when it asks for
    a secure connection.
    """
    if url.startswith("postgresql://") and "+asyncpg" not in url:
        url = url.replace("postgresql://", "postgresql+asyncpg://", 1)

    parts = urlsplit(url)
    raw_qs = parse_qs(parts.query, keep_blank_values=True)
    keep: dict[str, list[str]] = {}
    connect_args: dict[str, Any] = {}
    for key, values in raw_qs.items():
        v = values[-1] if values else ""
        if key.lower() in _LIBPQ_ONLY_PARAMS:
            if key.lower() == "sslmode" and v.lower() in {"require", "verify-ca", "verify-full", "prefer"}:
                connect_args["ssl"] = True
            continue
        keep[key] = values

    rebuilt_qs = urlencode([(k, v) for k, vs in keep.items() for v in vs])
    cleaned = urlunsplit((parts.scheme, parts.netloc, parts.path, rebuilt_qs, parts.fragment))
    return cleaned, connect_args


def get_engine() -> AsyncEngine:
    global _engine, _session_factory
    if _engine is None:
        url, connect_args = _to_async_url_and_args(get_settings().postgres_url)
        _engine = create_async_engine(
            url,
            pool_size=10,
            max_overflow=10,
            pool_pre_ping=True,
            pool_recycle=300,
            connect_args=connect_args,
        )
        _session_factory = async_sessionmaker(_engine, expire_on_commit=False)
    return _engine


def _factory() -> async_sessionmaker[AsyncSession]:
    if _session_factory is None:
        get_engine()
    assert _session_factory is not None
    return _session_factory


@asynccontextmanager
async def get_session() -> AsyncIterator[AsyncSession]:
    """Untenanted session — only use for cross-tenant ops (e.g. principal lookup,
    auth.* tables, audit log writes from system actors)."""
    async with _factory()() as session:
        yield session


@asynccontextmanager
async def with_tenant(tenant_id: str) -> AsyncIterator[AsyncSession]:
    """Tenant-scoped session. Sets ``app.tenant_id`` on the connection so RLS
    policies activate. Wraps work in a transaction. Always use this for any
    table with RLS (basically everything tenant-scoped)."""
    if not _UUID_RE.match(tenant_id):
        raise VedaError(ERROR_CODES.INVALID_INPUT, "tenant_id must be a UUID")
    async with _factory()() as session:
        async with session.begin():
            await session.execute(text(f"SET LOCAL app.tenant_id = '{tenant_id}'"))
            yield session
