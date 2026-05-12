"""``media.image_analyze`` — Claude Vision for product/document image understanding."""

from __future__ import annotations

from typing import Any

import httpx

from llm_router import get_router
from veda_shared.capability import capability
from veda_shared.schemas.capabilities import CapabilityCall, CapabilityId


@capability(CapabilityId.MEDIA_IMAGE_ANALYZE)
async def image_analyze(call: CapabilityCall) -> dict[str, Any]:
    media_url: str = call.input["media_url"]
    purpose: str = call.input.get("purpose", "describe")  # describe|extract_text|product_id

    async with httpx.AsyncClient(timeout=30) as client:
        img = await client.get(media_url)
        img.raise_for_status()

    instruction = {
        "describe": "Describe this image in 1-2 sentences. Focus on the visible product or scene.",
        "extract_text": "Extract any text visible in this image, exactly as written.",
        "product_id": "Identify the product in this image. If you can read brand/model/part number, output them.",
    }.get(purpose, "Describe this image briefly.")

    # We pipe the bytes through llm_router's complete() — it expects text messages.
    # For v1 use Claude with image content blocks via direct anthropic import.
    import base64

    b64 = base64.b64encode(img.content).decode("ascii")
    media_type = img.headers.get("content-type", "image/jpeg")

    resp = await get_router().complete(
        task="image_analysis",
        tenant_id=call.tenant_id,
        system="You analyze images for a business agent. Be concise and factual.",
        messages=[
            {
                "role": "user",
                "content": [
                    {"type": "image", "source": {"type": "base64", "media_type": media_type, "data": b64}},
                    {"type": "text", "text": instruction},
                ],
            }
        ],
        max_tokens=240,
    )
    return {"analysis": resp.text.strip(), "purpose": purpose}
