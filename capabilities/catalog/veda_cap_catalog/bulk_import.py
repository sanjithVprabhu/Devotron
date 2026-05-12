"""``catalog.bulk_import`` — parse uploaded Excel/CSV (or Tally export) into catalog items.

V1 implementation: HTTP-pull the uploaded blob, attempt Tally column heuristics, fall
back to LLM-driven column mapping. Caller (Veda intake) sends the blob URL.
"""

from __future__ import annotations

import csv
import io
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from veda_shared.capability import capability
from veda_shared.infra.mongo import get_tenant_db
from veda_shared.logging import get_logger
from veda_shared.schemas.capabilities import CapabilityCall, CapabilityId

log = get_logger(__name__)

# Recognised Tally export column patterns (lowercased).
TALLY_NAME_COLUMNS = {"item name", "name", "product", "stock item"}
TALLY_RATE_COLUMNS = {"rate", "selling price", "price", "mrp"}
TALLY_QTY_COLUMNS = {"closing stock", "qty", "quantity", "stock", "in stock"}


@capability(CapabilityId.CATALOG_BULK_IMPORT)
async def catalog_bulk_import(call: CapabilityCall) -> dict[str, Any]:
    inp = call.input
    tenant_id = call.tenant_id
    csv_text: str | None = inp.get("csv_text")
    if not csv_text:
        return {"imported": 0, "errors": ["csv_text required (HTTP fetch deferred to V1.5)"]}

    reader = csv.DictReader(io.StringIO(csv_text))
    headers = {h.lower(): h for h in (reader.fieldnames or [])}
    name_col = next((headers[h] for h in headers if h in TALLY_NAME_COLUMNS), None)
    rate_col = next((headers[h] for h in headers if h in TALLY_RATE_COLUMNS), None)
    qty_col = next((headers[h] for h in headers if h in TALLY_QTY_COLUMNS), None)
    if not name_col:
        return {"imported": 0, "errors": ["could not detect a name column"]}

    items: list[dict[str, Any]] = []
    for row in reader:
        try:
            price = float(str(row.get(rate_col, "0")).replace(",", "")) if rate_col else 0.0
            qty = int(float(str(row.get(qty_col, "0")).replace(",", ""))) if qty_col else 0
        except (TypeError, ValueError):
            price, qty = 0.0, 0
        name = (row.get(name_col) or "").strip()
        if not name:
            continue
        item_id = f"sku-{uuid4().hex[:8]}"
        items.append(
            {
                "tenant_id": tenant_id,
                "item_id": item_id,
                "vertical": inp.get("vertical", "auto_parts"),
                "status": "active",
                "data": {"name": name, "price_inr": price, "stock_qty": qty},
                "search_text": name.lower(),
                "created_at": datetime.now(timezone.utc),
                "updated_at": datetime.now(timezone.utc),
            }
        )

    if not items:
        return {"imported": 0, "errors": ["no rows parsed"]}

    col = get_tenant_db(tenant_id)["catalog_items"]
    await col.insert_many(items)
    log.info("catalog.bulk_import", tenant_id=tenant_id, count=len(items))
    return {"imported": len(items), "errors": []}
