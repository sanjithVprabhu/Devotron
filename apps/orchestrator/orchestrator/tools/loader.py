"""Load tenant API config + dynamic tool definitions.

Two tables:
  - business.api_config — one row per tenant; the locked API connection
    (base URL, machine token, acting-user header).
  - business.api_tools — many rows per tenant; each is an endpoint off the base.

A tool can't be invoked unless the tenant has a config AND base_url_locked=true.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Any

from sqlalchemy import text as sa_text

from veda_shared.infra.postgres import with_tenant
from veda_shared.infra.redis import get_redis, tenant_key
from veda_shared.infra.secrets import decrypt_secret
from veda_shared.logging import get_logger

log = get_logger(__name__)

CACHE_TTL_SECONDS = 300


@dataclass
class ApiConfig:
    """Tenant-level API connection — applies to all registered tools."""

    tenant_id: str
    base_url: str
    base_url_locked: bool
    auth_type: str                          # 'none' | 'bearer' | 'api_key_header' | 'basic'
    auth_secret_plaintext: str | None       # decrypted at load time
    auth_header_name: str | None
    pass_acting_user_default: bool
    acting_user_header: str
    notes: str | None = None


@dataclass
class ApiTool:
    """A single registered endpoint."""

    id: str
    tenant_id: str
    name: str                            # 'develup.jobs.search'
    display_name: str
    description: str
    http_method: str
    path: str                            # '/jobs?q={query}&loc={location}' — relative to api_config.base_url
    static_headers: dict[str, str] = field(default_factory=dict)
    body_template: str | None = None
    pass_acting_user_override: bool | None = None
    input_schema: dict[str, Any] = field(default_factory=dict)
    output_shape_hint: str | None = None
    side_effect: bool = False
    risk_override: str | None = None
    status: str = "draft"
    rate_limit_per_minute: int = 60


def _config_from_row(row: dict[str, Any]) -> ApiConfig:
    auth_secret = None
    if row.get("auth_secret_enc"):
        try:
            auth_secret = decrypt_secret(row["auth_secret_enc"])
        except Exception as e:  # noqa: BLE001
            log.warning("api_config.decrypt_failed", tenant_id=row.get("tenant_id"), error=str(e))
    return ApiConfig(
        tenant_id=str(row["tenant_id"]),
        base_url=row["base_url"].rstrip("/"),
        base_url_locked=bool(row["base_url_locked"]),
        auth_type=row.get("auth_type") or "none",
        auth_secret_plaintext=auth_secret,
        auth_header_name=row.get("auth_header_name"),
        pass_acting_user_default=bool(row.get("pass_acting_user_default", True)),
        acting_user_header=row.get("acting_user_header") or "X-Acting-User-Id",
        notes=row.get("notes"),
    )


def _tool_from_row(row: dict[str, Any]) -> ApiTool:
    static_headers = row.get("static_headers") or {}
    if isinstance(static_headers, str):
        static_headers = json.loads(static_headers)
    input_schema = row.get("input_schema") or {}
    if isinstance(input_schema, str):
        input_schema = json.loads(input_schema)
    return ApiTool(
        id=str(row["id"]),
        tenant_id=str(row["tenant_id"]),
        name=row["name"],
        display_name=row["display_name"],
        description=row["description"],
        http_method=row["http_method"],
        path=row["path"],
        static_headers=static_headers,
        body_template=row.get("body_template"),
        pass_acting_user_override=row.get("pass_acting_user_override"),
        input_schema=input_schema,
        output_shape_hint=row.get("output_shape_hint"),
        side_effect=bool(row.get("side_effect")),
        risk_override=row.get("risk_override"),
        status=row.get("status") or "draft",
        rate_limit_per_minute=int(row.get("rate_limit_per_minute") or 60),
    )


async def load_api_config(tenant_id: str) -> ApiConfig | None:
    """Tenant's API connection (base_url + auth). Cached in Redis."""
    r = get_redis()
    key = tenant_key(tenant_id, "api_config")
    cached = await r.get(key)
    if cached:
        return _config_from_row(json.loads(cached))

    async with with_tenant(tenant_id) as session:
        result = await session.execute(
            sa_text(
                "SELECT tenant_id::text, base_url, base_url_locked, "
                "       auth_type, auth_secret_enc, auth_header_name, "
                "       pass_acting_user_default, acting_user_header, notes "
                "  FROM business.api_config WHERE tenant_id = CAST(:t AS uuid)"
            ),
            {"t": tenant_id},
        )
        row = result.first()
    if not row:
        return None
    row_dict = dict(row._mapping)
    await r.set(key, json.dumps(row_dict, default=str), ex=CACHE_TTL_SECONDS)
    return _config_from_row(row_dict)


async def load_active_tools(tenant_id: str) -> list[ApiTool]:
    """All ACTIVE tools for this tenant. Cached. Returns [] if tenant has no
    api_config or base_url not locked yet — tools without a locked config are
    not safe to invoke."""
    cfg = await load_api_config(tenant_id)
    if cfg is None or not cfg.base_url_locked:
        return []

    r = get_redis()
    key = tenant_key(tenant_id, "api_tools", "active")
    cached = await r.get(key)
    if cached:
        rows = json.loads(cached)
    else:
        async with with_tenant(tenant_id) as session:
            result = await session.execute(
                sa_text(
                    "SELECT id::text, tenant_id::text, name, display_name, description, "
                    "       http_method, path, static_headers, body_template, "
                    "       pass_acting_user_override, "
                    "       input_schema, output_shape_hint, "
                    "       side_effect, risk_override, status, rate_limit_per_minute "
                    "  FROM business.api_tools "
                    " WHERE tenant_id = CAST(:t AS uuid) AND status = 'active'"
                ),
                {"t": tenant_id},
            )
            rows = [dict(row._mapping) for row in result]
        await r.set(key, json.dumps(rows, default=str), ex=CACHE_TTL_SECONDS)

    return [_tool_from_row(row) for row in rows]


async def load_tool_by_name(tenant_id: str, name: str) -> ApiTool | None:
    """Single tool lookup by callable name. Used by the dispatcher."""
    for t in await load_active_tools(tenant_id):
        if t.name == name:
            return t
    return None


async def invalidate_cache(tenant_id: str) -> None:
    """Called by the dashboard BFF when api_config or any tool changes."""
    r = get_redis()
    await r.delete(tenant_key(tenant_id, "api_config"))
    await r.delete(tenant_key(tenant_id, "api_tools", "active"))
