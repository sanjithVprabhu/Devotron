"""Mock LLM provider — emits canned harness XML so the full agent loop can run
without any external API key. Used for tests and the local demo path.

The fixture set is intentionally small. When the harness asks for a known task
we return a sensible scripted response; for anything else we return a brief
``<say>...</say><final/>`` so the loop terminates cleanly.

Set ``LLM_DEFAULT_PROVIDER=mock`` to route everything through here.
"""

from __future__ import annotations

import hashlib
import random
from dataclasses import dataclass
from typing import Any


@dataclass
class MockLLMResponse:
    text: str
    model: str
    input_tokens: int
    output_tokens: int


# Deterministic-ish replies keyed by task name. Each entry is a list of templated
# XML strings; we pick by hashing the user message so the same input → same output.
_FIXTURES: dict[str, list[str]] = {
    "support_response": [
        "<thinking>Customer asked a general question. Search FAQs first.</thinking>"
        '<call name="support.faq.search" id="q1">{"query": "{user}"}</call>',
        "<say>Thanks for reaching out — could you tell me a bit more about what you're looking for?</say><final/>",
    ],
    "transaction_handling": [
        "<thinking>Customer wants to transact. Need to look up the order or items first.</thinking>"
        "<say>Sure — confirming the details now. One moment.</say><final/>",
    ],
    "intent_classification": [
        "general_support",
        "product_inquiry",
        "order_placement",
    ],
    "language_detection": ["en"],
    "tone_inference": ["friendly"],
    "catalog_search_extraction": [
        '{"query": "{user}", "filters": {}}',
    ],
    "intake_question_generation": [
        "<say>Hi! I'm Veda. I help businesses come alive on WhatsApp. What kind of business are you running?</say><final/>",
    ],
    "image_analysis": [
        "An image showing a product. Cannot identify specifics in mock mode.",
    ],
    "market_analysis": [
        "<say>Mock market analysis: typical price band ₹800–₹2,500 for this category in metro cities.</say><final/>",
    ],
    "hindi_generation": [
        "<say>नमस्ते! आपकी कैसे मदद कर सकता हूँ?</say><final/>",
    ],
    "indic_deep_generation": [
        "<say>Mock Indic response.</say><final/>",
    ],
    "fallback_complex": [
        "<say>Mock complex response.</say><final/>",
    ],
    "fallback_simple": [
        "ok",
    ],
    "faq_response_formatter": [
        "<say>Based on what we know: this is a typical question with a typical answer. Let me know if you need more.</say><final/>",
    ],
    "admin_commands": [
        "<say>Got it — I'll make that change. Confirm? [CONFIRM:apply]</say><final/>",
    ],
}

_DEFAULT = "<say>Acknowledged.</say><final/>"


async def mock_complete(
    *, task: str, system: str, messages: list[dict[str, Any]], max_tokens: int,
) -> MockLLMResponse:
    last_user = ""
    for m in reversed(messages):
        if m.get("role") == "user":
            content = m.get("content")
            if isinstance(content, str):
                last_user = content
                break
    options = _FIXTURES.get(task, [_DEFAULT])
    seed = hashlib.sha256((task + "|" + last_user).encode("utf-8", errors="ignore")).hexdigest()
    idx = int(seed[:8], 16) % len(options)
    text = options[idx].replace("{user}", last_user[:120])
    return MockLLMResponse(
        text=text,
        model=f"mock-{task}",
        input_tokens=max(1, len(last_user) // 4),
        output_tokens=max(1, len(text) // 4),
    )


async def mock_embed(text: str) -> list[float]:
    """Deterministic 16-dim embedding based on the SHA-256 of the input."""
    digest = hashlib.sha256(text.encode("utf-8", errors="ignore")).digest()
    rng = random.Random(int.from_bytes(digest[:8], "big"))
    return [rng.uniform(-1.0, 1.0) for _ in range(1536)]
