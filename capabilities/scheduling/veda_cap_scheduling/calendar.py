"""``scheduling.calendar.*`` — Google Calendar integration.

⚠️  V1 STUB STATUS (as of audit 2026-05-11):
    - `check_availability`: returns 4 HARDCODED slots, not from any real calendar.
    - `book`: writes a row to Mongo `bookings` but does NOT create a calendar event.
    - `cancel`: marks the Mongo row as cancelled but does NOT delete the event.

Use cases this works for today:
    - Demos and walkthroughs where slot accuracy doesn't matter.
    - Internal-only bookings where the owner manually re-enters into their calendar.

Use cases this does NOT support yet:
    - Real-time availability against a busy owner's actual calendar.
    - Conflict detection.
    - Calendar invites to the customer.

Wiring real Google Calendar requires: OAuth flow per tenant, calendar_id column
in business.profiles, refresh-token storage in business.payment_credentials-like
encrypted table, and `google-api-python-client` / `google-auth` deps. ~2 days.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from veda_shared.capability import capability
from veda_shared.infra.mongo import get_tenant_db
from veda_shared.schemas.capabilities import CapabilityCall, CapabilityId


@capability(CapabilityId.SCHEDULING_CALENDAR_CHECK_AVAILABILITY)
async def check_availability(call: CapabilityCall) -> dict[str, Any]:
    # V1 stub returns 4 hourly slots from start_at.
    start = call.input.get("start_at")
    duration = int(call.input.get("duration_minutes", 30))
    if not start:
        return {"slots": []}
    base = datetime.fromisoformat(start.replace("Z", "+00:00"))
    return {
        "slots": [
            {
                "start_at": base.replace(microsecond=0, second=0, minute=0).isoformat(),
                "duration_minutes": duration,
            }
            for _ in range(4)
        ]
    }


@capability(CapabilityId.SCHEDULING_CALENDAR_BOOK)
async def book(call: CapabilityCall) -> dict[str, Any]:
    booking_id = str(uuid4())
    db = get_tenant_db(call.tenant_id)
    await db["bookings"].insert_one(
        {
            "_id": booking_id,
            "tenant_id": call.tenant_id,
            "principal_id": call.invoked_by_principal_id,
            "start_at": call.input.get("start_at"),
            "duration_minutes": call.input.get("duration_minutes"),
            "metadata": call.input.get("metadata") or {},
            "created_at": datetime.now(timezone.utc),
        }
    )
    return {"booking_id": booking_id}


@capability(CapabilityId.SCHEDULING_CALENDAR_CANCEL)
async def cancel(call: CapabilityCall) -> dict[str, Any]:
    booking_id = call.input["booking_id"]
    db = get_tenant_db(call.tenant_id)
    res = await db["bookings"].delete_one({"_id": booking_id})
    return {"cancelled": bool(res.deleted_count)}
