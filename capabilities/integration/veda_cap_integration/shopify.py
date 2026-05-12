"""``integration.shopify.sync_catalog`` — pull products from Shopify into the catalog."""

from __future__ import annotations

from typing import Any

import httpx
from sqlalchemy import text

from veda_shared.capability import capability
from veda_shared.infra.mongo import get_tenant_db
from veda_shared.infra.postgres import with_tenant
from veda_shared.logging import get_logger
from veda_shared.schemas.capabilities import CapabilityCall, CapabilityId
from veda_shared.schemas.errors import ERROR_CODES, VedaError

log = get_logger(__name__)


@capability(CapabilityId.INTEGRATION_SHOPIFY_SYNC_CATALOG)
async def shopify_sync(call: CapabilityCall) -> dict[str, Any]:
    async with with_tenant(call.tenant_id) as session:
        row = await session.execute(
            text(
                """
                SELECT content->'integrations'->'inventory'->'config' AS cfg
                FROM blueprints.versions
                WHERE tenant_id = :tid AND is_current = TRUE LIMIT 1
                """
            ),
            {"tid": call.tenant_id},
        )
        cfg = row.scalar_one_or_none() or {}
    shop = cfg.get("shop_url")
    token = cfg.get("access_token")
    if not shop or not token:
        raise VedaError(ERROR_CODES.CAPABILITY_NOT_ENABLED, "Shopify not configured")

    items: list[dict[str, Any]] = []
    cursor: str | None = None
    async with httpx.AsyncClient(timeout=30, headers={"X-Shopify-Access-Token": token}) as client:
        while True:
            params: dict[str, str] = {"limit": "250"}
            if cursor:
                params["page_info"] = cursor
            resp = await client.get(f"https://{shop}/admin/api/2024-10/products.json", params=params)
            resp.raise_for_status()
            page = resp.json().get("products", [])
            for p in page:
                for v in p.get("variants", []) or [{}]:
                    items.append(
                        {
                            "tenant_id": call.tenant_id,
                            "item_id": str(v.get("id") or p.get("id")),
                            "vertical": "retail",
                            "status": "active",
                            "data": {
                                "name": p.get("title"),
                                "price_inr": float(v.get("price", 0)),
                                "stock_qty": int(v.get("inventory_quantity") or 0),
                                "images": [img.get("src") for img in p.get("images", [])],
                            },
                            "search_text": (p.get("title") or "").lower(),
                        }
                    )
            link = resp.headers.get("Link", "")
            if "rel=\"next\"" in link:
                # Crude page_info parse
                import re

                m = re.search(r"<[^>]*page_info=([^&>]+)[^>]*>; rel=\"next\"", link)
                cursor = m.group(1) if m else None
                if not cursor:
                    break
            else:
                break

    if not items:
        return {"imported": 0, "errors": []}
    col = get_tenant_db(call.tenant_id)["catalog_items"]
    await col.insert_many(items)
    log.info("shopify.sync", tenant_id=call.tenant_id, count=len(items))
    return {"imported": len(items), "errors": []}
