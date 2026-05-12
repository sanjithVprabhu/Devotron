"""Load + cache a tenant's Blueprint. Hot path for every business message."""

from __future__ import annotations

import json
from typing import Any

from sqlalchemy import text

from veda_shared.infra.postgres import with_tenant
from veda_shared.infra.redis import get_redis, tenant_key
from veda_shared.schemas.constants import BLUEPRINT_CACHE_TTL_SECONDS
from veda_shared.schemas.errors import ERROR_CODES, VedaError


def _ensure_dict(value: Any) -> dict[str, Any]:
    """asyncpg returns JSONB columns as Python str by default; the application
    expects dict. Be tolerant of both."""
    if isinstance(value, dict):
        return value
    if isinstance(value, (bytes, bytearray)):
        value = value.decode("utf-8")
    if isinstance(value, str):
        return json.loads(value)
    raise VedaError(
        ERROR_CODES.BLUEPRINT_VALIDATION_FAILED,
        f"unexpected blueprint type from DB: {type(value).__name__}",
    )


async def load_blueprint(tenant_id: str) -> dict[str, Any]:
    r = get_redis()
    cache = await r.get(tenant_key(tenant_id, "blueprint", "current"))
    if cache:
        return _ensure_dict(cache)

    async with with_tenant(tenant_id) as session:
        row = await session.execute(
            text(
                """
                SELECT content
                FROM blueprints.versions
                WHERE tenant_id = :tid AND is_current = TRUE
                ORDER BY version DESC LIMIT 1
                """
            ),
            {"tid": tenant_id},
        )
        record = row.mappings().first()
        if not record:
            raise VedaError(ERROR_CODES.BLUEPRINT_NOT_FOUND, f"no current blueprint for tenant {tenant_id}")
        blueprint = _ensure_dict(record["content"])

    await r.set(
        tenant_key(tenant_id, "blueprint", "current"),
        json.dumps(blueprint, default=str),
        ex=BLUEPRINT_CACHE_TTL_SECONDS,
    )
    return blueprint


def _normalize_language_label(item: Any) -> str:
    """Languages may be either ['en', 'hi'] (Veda-generated) or
    [{'code': 'en', 'name': 'English'}, ...] (manually-authored). Return a
    short string label suitable for the system prompt."""
    if isinstance(item, str):
        return item
    if isinstance(item, dict):
        return str(item.get("name") or item.get("code") or "")
    return ""


def render_blueprint_for_prompt(blueprint: dict[str, Any]) -> str:
    """Render a stable, cache-eligible system context block from a Blueprint."""
    identity = blueprint.get("identity", {})
    persona = blueprint.get("persona", {})
    capabilities = blueprint.get("capabilities", {})
    policies = blueprint.get("policies", {})
    raw_langs = persona.get("languages", []) or []
    languages = ", ".join(filter(None, (_normalize_language_label(l) for l in raw_langs)))
    return (
        f"## Business Context\n"
        f"You are the AI agent for {identity.get('business_name', '')}.\n"
        f"{identity.get('description', '')}\n\n"
        f"## Your Persona\n"
        f"Name: {persona.get('agent_name', '')}\n"
        f"Tone: {persona.get('base_tone', 'friendly')}. "
        f"Adapt to user tone: {persona.get('adapts_to_user_tone', True)}.\n"
        f"Languages: {languages}.\n"
        f"Do not discuss: {', '.join(persona.get('prohibited_topics', []) or [])}.\n\n"
        f"## What You Can Do\n"
        f"Enabled capabilities: {', '.join(capabilities.get('enabled', []))}.\n\n"
        f"## Key Policies\n"
        f"Haggling: {policies.get('haggling', {}).get('mode', 'escalate')}\n"
        f"Payments: {', '.join(policies.get('payment', {}).get('accepted_methods', []))}\n"
    )
