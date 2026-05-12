"""Site 5 — Compaction.

When the per-turn message history (system + history + tool results) approaches
the model's context window, summarise older turns into a single ``<summary>``
block at the head of the prompt. The cached system prefix stays warm; only the
mutable suffix shrinks.

Trigger: estimated input tokens exceed THRESHOLD (default 80k for Sonnet 4.6).
"""

from __future__ import annotations

from typing import Any

from llm_router import get_router
from veda_shared.logging import get_logger

from orchestrator.harness.state import HarnessState, SiteName

log = get_logger(__name__)

# Conservative — Sonnet 4.6 has 200k context; we compact long before saturation
# so the harness still has room for fresh tool results + the model's response.
TOKEN_BUDGET = 80_000


def estimate_tokens(messages: list[dict[str, Any]]) -> int:
    """Rough estimate: ~4 chars per token for English; safe upper bound."""
    chars = 0
    for m in messages:
        c = m.get("content")
        if isinstance(c, str):
            chars += len(c)
        elif isinstance(c, list):
            for part in c:
                t = part.get("text") if isinstance(part, dict) else None
                if isinstance(t, str):
                    chars += len(t)
    return chars // 4


async def maybe_compact(
    *,
    state: HarnessState,
    messages: list[dict[str, Any]],
    tenant_id: str | None,
) -> list[dict[str, Any]]:
    est = estimate_tokens(messages)
    if est < TOKEN_BUDGET or len(messages) < 6:
        state.append_site(
            SiteName.COMPACTION, outcome="skip", payload={"est_tokens": est}
        )
        return messages

    # Keep the last 4 messages live; summarise everything before that.
    head = messages[:-4]
    tail = messages[-4:]
    transcript = []
    for m in head:
        c = m.get("content")
        if isinstance(c, str):
            transcript.append(f"{m.get('role')}: {c}")
        elif isinstance(c, list):
            text = " ".join(
                p.get("text", "") for p in c if isinstance(p, dict) and isinstance(p.get("text"), str)
            )
            if text:
                transcript.append(f"{m.get('role')}: {text}")

    raw = "\n".join(transcript)[:24_000]
    resp = await get_router().complete(
        task="intent_classification",
        tenant_id=tenant_id,
        system=(
            "Summarise this customer-agent conversation in <= 250 words. Preserve: "
            "specific items asked about, prices quoted, decisions made, any IDs "
            "or order numbers, current open question. Drop pleasantries."
        ),
        messages=[{"role": "user", "content": raw}],
        max_tokens=400,
        temperature=0,
    )
    summary = resp.text.strip()
    state.append_site(
        SiteName.COMPACTION,
        outcome="ok",
        payload={"compacted_messages": len(head), "est_tokens_before": est},
    )
    return [
        {"role": "user", "content": f"<conversation_summary>\n{summary}\n</conversation_summary>"},
        *tail,
    ]
