"""identity-service — Principal CRUD, identifier resolution, cross-channel linking codes."""

from __future__ import annotations

import secrets
import string
from datetime import datetime, timedelta, timezone

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from sqlalchemy import text

from veda_shared.infra.postgres import get_session
from veda_shared.logging import get_logger
from veda_shared.otel import setup_otel
from veda_shared.schemas.identity import Channel, normalize_identifier
from veda_shared.schemas.constants import LINKING_CODE_TTL_SECONDS

setup_otel("veda-identity-service")
log = get_logger(__name__)
app = FastAPI(title="VEDA Identity", version="0.0.1")


@app.get("/healthz")
async def healthz() -> dict[str, str]:
    return {"status": "ok"}


class ResolveRequest(BaseModel):
    channel: Channel
    identifier: str


class ResolveResponse(BaseModel):
    principal_id: str
    created: bool
    normalized: str


@app.post("/principals/resolve", response_model=ResolveResponse)
async def resolve(req: ResolveRequest) -> ResolveResponse:
    norm = normalize_identifier(req.channel, req.identifier)
    async with get_session() as session:
        row = await session.execute(
            text(
                "SELECT principal_id::text FROM core.identifiers "
                "WHERE channel = :ch AND identifier = :id LIMIT 1"
            ),
            {"ch": req.channel.value, "id": norm},
        )
        existing = row.scalar_one_or_none()
        if existing:
            return ResolveResponse(principal_id=existing, created=False, normalized=norm)

        ins = await session.execute(
            text(
                "INSERT INTO core.principals (display_name, metadata) "
                "VALUES (NULL, '{}'::jsonb) RETURNING id::text"
            )
        )
        principal_id = ins.scalar_one()
        await session.execute(
            text(
                "INSERT INTO core.identifiers (principal_id, channel, identifier, verified) "
                "VALUES (:pid::uuid, :ch, :id, :v)"
            ),
            {
                "pid": principal_id,
                "ch": req.channel.value,
                "id": norm,
                "v": req.channel in (Channel.WHATSAPP, Channel.TWITTER),
            },
        )
        await session.commit()
        return ResolveResponse(principal_id=principal_id, created=True, normalized=norm)


class LinkingCodeRequest(BaseModel):
    principal_id: str
    source_channel: Channel


class LinkingCodeResponse(BaseModel):
    code: str
    expires_at: datetime


@app.post("/linking-codes", response_model=LinkingCodeResponse)
async def issue_linking_code(req: LinkingCodeRequest) -> LinkingCodeResponse:
    code = "VEDA-" + "".join(secrets.choice(string.ascii_uppercase + string.digits) for _ in range(6))
    expires = datetime.now(timezone.utc) + timedelta(seconds=LINKING_CODE_TTL_SECONDS)
    async with get_session() as session:
        await session.execute(
            text(
                "INSERT INTO core.linking_codes (code, principal_id, source_channel, expires_at) "
                "VALUES (:c, :p::uuid, :ch, :e)"
            ),
            {"c": code, "p": req.principal_id, "ch": req.source_channel.value, "e": expires},
        )
        await session.commit()
    return LinkingCodeResponse(code=code, expires_at=expires)


class ConsumeLinkingCodeRequest(BaseModel):
    code: str
    target_channel: Channel
    target_identifier: str


@app.post("/linking-codes/consume")
async def consume_linking_code(req: ConsumeLinkingCodeRequest) -> dict[str, str]:
    norm = normalize_identifier(req.target_channel, req.target_identifier)
    async with get_session() as session:
        row = await session.execute(
            text(
                "SELECT principal_id::text, expires_at, used_at FROM core.linking_codes WHERE code = :c"
            ),
            {"c": req.code},
        )
        rec = row.mappings().first()
        if not rec:
            raise HTTPException(404, "code not found")
        if rec["used_at"] is not None:
            raise HTTPException(410, "code already used")
        if rec["expires_at"] < datetime.now(timezone.utc):
            raise HTTPException(410, "code expired")
        principal_id = rec["principal_id"]

        # Attach the new identifier to this principal (or merge).
        await session.execute(
            text(
                "INSERT INTO core.identifiers (principal_id, channel, identifier, verified) "
                "VALUES (:p::uuid, :ch, :id, TRUE) "
                "ON CONFLICT (channel, identifier) DO NOTHING"
            ),
            {"p": principal_id, "ch": req.target_channel.value, "id": norm},
        )
        await session.execute(
            text("UPDATE core.linking_codes SET used_at = NOW() WHERE code = :c"),
            {"c": req.code},
        )
        await session.commit()
        return {"principal_id": principal_id}
