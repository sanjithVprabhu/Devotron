"""order-service — order state machine. Emits ``orders`` events on every transition."""

from __future__ import annotations

import json
import secrets
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from sqlalchemy import text

from veda_shared.infra.kafka import get_producer
from veda_shared.infra.postgres import with_tenant
from veda_shared.logging import get_logger
from veda_shared.otel import setup_otel
from veda_shared.schemas.constants import KAFKA_TOPICS
from veda_shared.schemas.events import OrderEvent

setup_otel("veda-order-service")
log = get_logger(__name__)
app = FastAPI(title="VEDA Orders", version="0.0.1")


@app.get("/healthz")
async def healthz() -> dict[str, str]:
    return {"status": "ok"}


VALID_TRANSITIONS = {
    "created": {"confirmed", "cancelled"},
    "confirmed": {"paid", "cancelled"},
    "paid": {"fulfilled", "refunded"},
    "fulfilled": {"closed", "refunded"},
    "closed": set(),
    "cancelled": set(),
    "refunded": set(),
}


def _short_code(prefix: str = "ORD") -> str:
    return f"{prefix}-{secrets.token_hex(3).upper()}"


class CreateOrderRequest(BaseModel):
    tenant_id: str
    principal_id: str
    thread_id: str | None = None
    line_items: list[dict[str, Any]]
    subtotal_paise: int
    tax_paise: int
    delivery_paise: int = 0
    discount_paise: int = 0
    total_paise: int
    delivery_address: dict[str, Any] | None = None
    notes: str | None = None


@app.post("/orders/create")
async def create_order(req: CreateOrderRequest) -> dict[str, Any]:
    order_number = _short_code()
    async with with_tenant(req.tenant_id) as session:
        row = await session.execute(
            text(
                """
                INSERT INTO commerce.orders
                  (tenant_id, principal_id, thread_id, order_number,
                   line_items, subtotal_paise, tax_paise, delivery_paise, discount_paise, total_paise,
                   delivery_address, notes)
                VALUES (:tid, :pid::uuid, :thr::uuid, :num,
                        :line_items::jsonb, :sub, :tax, :del, :disc, :total,
                        :addr::jsonb, :notes)
                RETURNING id::text
                """
            ),
            {
                "tid": req.tenant_id,
                "pid": req.principal_id,
                "thr": req.thread_id,
                "num": order_number,
                "line_items": json.dumps(req.line_items),
                "sub": req.subtotal_paise,
                "tax": req.tax_paise,
                "del": req.delivery_paise,
                "disc": req.discount_paise,
                "total": req.total_paise,
                "addr": json.dumps(req.delivery_address) if req.delivery_address else None,
                "notes": req.notes,
            },
        )
        order_id = row.scalar_one()

    await _emit(req.tenant_id, order_id, order_number, "->created", "created", req.total_paise, req.principal_id, req.line_items)
    return {"order_id": order_id, "order_number": order_number, "status": "created"}


class TransitionRequest(BaseModel):
    tenant_id: str
    order_id: str
    to_status: str
    payment_method: str | None = None
    payment_ref: str | None = None


@app.post("/orders/transition")
async def transition(req: TransitionRequest) -> dict[str, Any]:
    async with with_tenant(req.tenant_id) as session:
        row = await session.execute(
            text(
                "SELECT status, total_paise, principal_id::text, order_number, line_items "
                "FROM commerce.orders WHERE id = :oid LIMIT 1"
            ),
            {"oid": req.order_id},
        )
        rec = row.mappings().first()
        if not rec:
            raise HTTPException(404, "order not found")
        if req.to_status not in VALID_TRANSITIONS.get(rec["status"], set()):
            raise HTTPException(409, f"illegal transition {rec['status']}->{req.to_status}")

        await session.execute(
            text(
                "UPDATE commerce.orders SET status = :s, payment_method = COALESCE(:pm, payment_method), "
                "payment_ref = COALESCE(:pr, payment_ref) WHERE id = :oid"
            ),
            {"s": req.to_status, "pm": req.payment_method, "pr": req.payment_ref, "oid": req.order_id},
        )

    await _emit(
        req.tenant_id,
        req.order_id,
        rec["order_number"],
        f"{rec['status']}->{req.to_status}",
        req.to_status,
        rec["total_paise"],
        rec["principal_id"],
        rec["line_items"],
    )
    return {"order_id": req.order_id, "status": req.to_status}


async def _emit(
    tenant_id: str,
    order_id: str,
    order_number: str,
    transition: str,
    to_status: str,
    total_paise: int,
    principal_id: str,
    line_items: list[dict[str, Any]],
) -> None:
    await get_producer().publish(
        KAFKA_TOPICS.ORDERS,
        OrderEvent(
            event_id=str(uuid4()),
            occurred_at=datetime.now(timezone.utc),
            tenant_id=tenant_id,
            order_id=order_id,
            order_number=order_number,
            transition=transition,
            to_status=to_status,
            total_paise=total_paise,
            principal_id=principal_id,
            line_items=line_items or [],
        ),
    )
