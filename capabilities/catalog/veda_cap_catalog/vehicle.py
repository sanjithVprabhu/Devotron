"""``catalog.vehicle_compat_lookup`` — auto_parts specific."""

from __future__ import annotations

from typing import Any

from veda_shared.capability import capability
from veda_shared.infra.mongo import get_tenant_db
from veda_shared.schemas.capabilities import CapabilityCall, CapabilityId


@capability(CapabilityId.CATALOG_VEHICLE_COMPAT_LOOKUP)
async def vehicle_compat_lookup(call: CapabilityCall) -> dict[str, Any]:
    make = call.input.get("make")
    model = call.input.get("model")
    year = call.input.get("year")
    if not make or not model:
        return {"items": []}
    col = get_tenant_db(call.tenant_id)["catalog_items"]
    elem: dict[str, Any] = {"make": make, "model": model}
    if year is not None:
        elem.update({"year_from": {"$lte": year}, "year_to": {"$gte": year}})
    cursor = col.find(
        {"status": "active", "data.compatible_vehicles": {"$elemMatch": elem}}
    ).limit(int(call.input.get("limit", 10)))
    items = await cursor.to_list(length=10)
    for it in items:
        it.pop("_id", None)
    return {"items": items}
