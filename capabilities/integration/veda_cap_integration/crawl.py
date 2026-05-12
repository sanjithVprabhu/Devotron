"""``integration.crawl.extract_catalog`` — crawl a website + extract product items.

V1 implementation: HTML fetch → schema.org / JSON-LD extraction → LLM fallback for
unstructured pages. Owner confirms the parsed list before final import.
"""

from __future__ import annotations

import json
import re
from typing import Any

import httpx

from llm_router import get_router
from veda_shared.capability import capability
from veda_shared.logging import get_logger
from veda_shared.schemas.capabilities import CapabilityCall, CapabilityId

log = get_logger(__name__)

JSONLD_RE = re.compile(r"<script[^>]+type=\"application/ld\+json\"[^>]*>(.*?)</script>", re.DOTALL | re.IGNORECASE)


@capability(CapabilityId.INTEGRATION_CRAWL_EXTRACT_CATALOG)
async def extract_catalog(call: CapabilityCall) -> dict[str, Any]:
    url: str = call.input["url"]
    max_items: int = int(call.input.get("max_items", 50))

    async with httpx.AsyncClient(timeout=30, follow_redirects=True) as client:
        resp = await client.get(url, headers={"User-Agent": "VedaBot/0.1"})
        resp.raise_for_status()
        html = resp.text

    structured = _extract_jsonld_products(html)
    if structured:
        return {"items": structured[:max_items], "method": "jsonld"}

    snippet = re.sub(r"<[^>]+>", " ", html)[:6000]
    extraction = await get_router().complete(
        task="market_analysis",
        tenant_id=call.tenant_id,
        system="You extract product listings from raw page text. Output a JSON array of {name, price_inr?, description?}.",
        messages=[{"role": "user", "content": snippet}],
        max_tokens=600,
        temperature=0,
    )
    try:
        match = re.search(r"\[.*\]", extraction.text, re.DOTALL)
        items = json.loads(match.group(0)) if match else []
    except (json.JSONDecodeError, AttributeError):
        items = []
    return {"items": items[:max_items], "method": "llm"}


def _extract_jsonld_products(html: str) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for blob in JSONLD_RE.findall(html):
        try:
            data = json.loads(blob)
        except json.JSONDecodeError:
            continue
        items = data if isinstance(data, list) else [data]
        for item in items:
            t = (item.get("@type") or "").lower()
            if t == "product":
                offers = item.get("offers", {}) or {}
                price = offers.get("price") or (offers[0].get("price") if isinstance(offers, list) and offers else None)
                out.append(
                    {
                        "name": item.get("name"),
                        "description": item.get("description"),
                        "price_inr": float(price) if price else None,
                        "images": [item.get("image")] if item.get("image") else [],
                    }
                )
    return out
