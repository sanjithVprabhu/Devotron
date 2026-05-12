"""``integration.api_sandbox.call`` — call a Blueprint-registered custom API endpoint."""

from __future__ import annotations

from typing import Any

import httpx
from sqlalchemy import text

from veda_shared.capability import capability
from veda_shared.infra.postgres import with_tenant
from veda_shared.schemas.capabilities import CapabilityCall, CapabilityId
from veda_shared.schemas.errors import ERROR_CODES, VedaError


@capability(CapabilityId.INTEGRATION_API_SANDBOX_CALL)
async def api_sandbox_call(call: CapabilityCall) -> dict[str, Any]:
    inp = call.input
    integration_id = inp["integration_id"]
    endpoint_id = inp["endpoint_id"]
    params = inp.get("params") or {}

    async with with_tenant(call.tenant_id) as session:
        row = await session.execute(
            text(
                """
                SELECT content->'integrations'->'custom_apis' AS apis
                FROM blueprints.versions
                WHERE tenant_id = :tid AND is_current = TRUE LIMIT 1
                """
            ),
            {"tid": call.tenant_id},
        )
        apis = row.scalar_one_or_none() or []
    api = next((a for a in apis if a.get("id") == integration_id), None)
    if not api:
        raise VedaError(ERROR_CODES.CAPABILITY_NOT_ENABLED, f"integration {integration_id} not registered")
    endpoint = next((e for e in api.get("endpoints", []) if e.get("id") == endpoint_id), None)
    if not endpoint:
        raise VedaError(ERROR_CODES.CAPABILITY_NOT_ENABLED, f"endpoint {endpoint_id} not registered")

    base = api["base_url"].rstrip("/")
    path = endpoint["path"]
    method = endpoint["method"].upper()
    headers: dict[str, str] = {}
    if api.get("auth_type") == "bearer":
        headers["Authorization"] = f"Bearer {api.get('auth_value', '')}"
    elif api.get("auth_type") == "api_key":
        headers["X-API-Key"] = api.get("auth_value", "")

    async with httpx.AsyncClient(timeout=20) as client:
        resp = await client.request(method, f"{base}{path}", params=params if method == "GET" else None,
                                    json=params if method != "GET" else None, headers=headers)
        resp.raise_for_status()
        return {"status": resp.status_code, "body": resp.json()}
