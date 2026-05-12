"""Geocoding helper — converts a free-text address into (lat, lng, city).

Uses OpenStreetMap Nominatim (free, no API key). Has a 1-req/sec rate limit;
we just call it once per provisioning event so this is fine in v1.

If geocoding fails (rate limit, no match, network error), we return None and
the caller stores the address but no lat/lng — search by city still works
because the raw address is also persisted.
"""

from __future__ import annotations

import asyncio
from typing import Any

import httpx

from veda_shared.logging import get_logger

log = get_logger(__name__)

NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
USER_AGENT = "VEDA/0.1 (https://github.com/veda — agent platform)"
TIMEOUT_SECONDS = 8


async def geocode(address: str) -> dict[str, Any] | None:
    """Resolve a free-text address to {lat, lng, city, display_name} or None.

    `address` should be a single-line string like "Indiranagar, Bangalore" or
    "Koramangala 5th block, Bangalore, India". The function adds ", India"
    when no country token is detected to nudge Nominatim toward Indian results.
    """
    addr = address.strip()
    if not addr:
        return None
    if "india" not in addr.lower():
        addr = f"{addr}, India"

    try:
        async with httpx.AsyncClient(timeout=TIMEOUT_SECONDS) as client:
            resp = await client.get(
                NOMINATIM_URL,
                params={
                    "q": addr,
                    "format": "json",
                    "limit": 1,
                    "addressdetails": 1,
                },
                headers={"User-Agent": USER_AGENT, "Accept-Language": "en"},
            )
            resp.raise_for_status()
            data = resp.json()
    except (httpx.HTTPError, ValueError) as e:
        log.warning("geocode.failed", address=addr, error=str(e))
        return None

    if not data or not isinstance(data, list):
        log.info("geocode.no_match", address=addr)
        return None

    hit = data[0]
    try:
        lat = float(hit["lat"])
        lng = float(hit["lon"])
    except (KeyError, TypeError, ValueError):
        log.warning("geocode.bad_response", address=addr, hit=str(hit)[:200])
        return None

    addr_obj = hit.get("address") or {}
    city = (
        addr_obj.get("city")
        or addr_obj.get("town")
        or addr_obj.get("village")
        or addr_obj.get("state_district")
        or addr_obj.get("state")
        or ""
    )

    return {
        "lat": lat,
        "lng": lng,
        "city": city,
        "display_name": hit.get("display_name", ""),
    }


async def geocode_with_retry(address: str, attempts: int = 2) -> dict[str, Any] | None:
    """Geocode with one retry after a short backoff (Nominatim is sometimes flaky)."""
    for i in range(attempts):
        result = await geocode(address)
        if result is not None:
            return result
        if i + 1 < attempts:
            await asyncio.sleep(1.2)
    return None
