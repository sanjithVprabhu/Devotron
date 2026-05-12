"""team-service — memberships, invites, permissions checks."""

from __future__ import annotations

import json
from typing import Any

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from sqlalchemy import text

from veda_shared.infra.postgres import get_session, with_tenant
from veda_shared.logging import get_logger
from veda_shared.otel import setup_otel
from veda_shared.schemas.identity import TenantRole
from veda_shared.schemas.permissions import Permission, has_permission

setup_otel("veda-team-service")
log = get_logger(__name__)
app = FastAPI(title="VEDA Team", version="0.0.1")


@app.get("/healthz")
async def healthz() -> dict[str, str]:
    return {"status": "ok"}


class InviteRequest(BaseModel):
    tenant_id: str
    invited_by: str
    phone_number: str | None = None
    email: str | None = None
    role: TenantRole


@app.post("/invites")
async def create_invite(req: InviteRequest) -> dict[str, Any]:
    async with get_session() as session:
        row = await session.execute(
            text(
                """
                INSERT INTO core.team_invites (tenant_id, invited_by, phone_number, email, role)
                VALUES (:tid::uuid, :inv::uuid, :phone, :email, :role)
                RETURNING id::text
                """
            ),
            {"tid": req.tenant_id, "inv": req.invited_by, "phone": req.phone_number, "email": req.email, "role": req.role.value},
        )
        invite_id = row.scalar_one()
        await session.commit()
    return {"invite_id": invite_id}


class AcceptInviteRequest(BaseModel):
    invite_id: str
    principal_id: str


@app.post("/invites/accept")
async def accept_invite(req: AcceptInviteRequest) -> dict[str, Any]:
    async with get_session() as session:
        row = await session.execute(
            text(
                "SELECT tenant_id::text, role, status, expires_at FROM core.team_invites WHERE id = :id"
            ),
            {"id": req.invite_id},
        )
        rec = row.mappings().first()
        if not rec:
            raise HTTPException(404, "invite not found")
        if rec["status"] != "pending":
            raise HTTPException(409, "invite no longer pending")

        await session.execute(
            text(
                """
                INSERT INTO core.tenant_memberships (tenant_id, principal_id, role, joined_at)
                VALUES (:tid::uuid, :pid::uuid, :role, NOW())
                ON CONFLICT (tenant_id, principal_id) DO NOTHING
                """
            ),
            {"tid": rec["tenant_id"], "pid": req.principal_id, "role": rec["role"]},
        )
        await session.execute(
            text("UPDATE core.team_invites SET status = 'accepted' WHERE id = :id"), {"id": req.invite_id}
        )
        await session.commit()
        return {"tenant_id": rec["tenant_id"], "role": rec["role"]}


class CheckPermissionRequest(BaseModel):
    tenant_id: str
    principal_id: str
    required: Permission  # type: ignore[type-arg]


@app.post("/check-permission")
async def check_permission(req: CheckPermissionRequest) -> dict[str, bool]:
    async with with_tenant(req.tenant_id) as session:
        row = await session.execute(
            text(
                "SELECT role, permissions FROM core.tenant_memberships "
                "WHERE tenant_id = :tid AND principal_id = :pid LIMIT 1"
            ),
            {"tid": req.tenant_id, "pid": req.principal_id},
        )
        rec = row.mappings().first()
    if not rec:
        return {"allowed": False}
    role = TenantRole(rec["role"])
    granted = rec["permissions"] if isinstance(rec["permissions"], list) else json.loads(rec["permissions"] or "[]")
    return {"allowed": has_permission(role, granted, req.required)}
