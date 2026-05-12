"""Veda's per-principal session — Redis-backed."""

from __future__ import annotations

import json
from dataclasses import asdict, dataclass, field
from typing import Any

from veda_shared.infra.redis import get_redis, global_key
from veda_shared.schemas.constants import SESSION_TTL_SECONDS


@dataclass
class VedaSession:
    principal_id: str
    state: str = "new"  # new|greeting|mode_detected|onboarded
    mode: str | None = None  # business_setup|consumer_discovery|existing_business_help
    language: str | None = None
    persona_mode: str | None = None
    intake_step: int = 0
    draft_blueprint: dict[str, Any] = field(default_factory=dict)
    intake_history: list[dict[str, Any]] = field(default_factory=list)


def _key(principal_id: str) -> str:
    return global_key("veda", "session", principal_id)


async def load_session(principal_id: str) -> VedaSession:
    raw = await get_redis().get(_key(principal_id))
    if not raw:
        return VedaSession(principal_id=principal_id)
    data = json.loads(raw)
    return VedaSession(**data)


async def save_session(session: VedaSession) -> None:
    await get_redis().set(
        _key(session.principal_id),
        json.dumps(asdict(session), default=str),
        ex=SESSION_TTL_SECONDS,
    )
