"""Live pricing tables (paise per 1M tokens). Conservative; update as Anthropic/Azure
adjust list prices. Numbers below are placeholders matching the spec's spirit, not
contract-grade pricing — the cost-tracker authoritatively uses these figures, so any
operational person changing them must update this file."""

from __future__ import annotations

from typing import Final

# Paise per 1M tokens. Approximates published list prices at ~₹85/USD.
# Update when providers change pricing or the rupee shifts materially.
#
#  $1.00  per 1M tokens  ≈  ₹85   ≈  8500 paise
#  $2.50  ≈  21250 paise
#  $3.00  ≈  25500 paise
#  $0.15  ≈  1275 paise

INPUT_PRICE_PAISE_PER_M: Final[dict[str, int]] = {
    # Anthropic ($3/$0.80/$15 input)
    "claude-sonnet-4-6": 25_500,
    "claude-haiku-4-5-20251001": 6_800,
    "claude-opus-4-7": 127_500,
    # OpenAI ($2.50/$0.15 input)
    "gpt-4o": 21_250,
    "gpt-4o-mini": 1_275,
    "text-embedding-3-small": 17,
    # Sarvam (best-effort)
    "sarvam-v1": 17_000,
}

OUTPUT_PRICE_PAISE_PER_M: Final[dict[str, int]] = {
    # $15/$4/$75 output for Anthropic
    "claude-sonnet-4-6": 127_500,
    "claude-haiku-4-5-20251001": 34_000,
    "claude-opus-4-7": 637_500,
    # $10/$0.60 output for OpenAI
    "gpt-4o": 85_000,
    "gpt-4o-mini": 5_100,
    "text-embedding-3-small": 0,
    "sarvam-v1": 68_000,
}

# Cached input tokens are billed at 10% on Anthropic.
CACHED_INPUT_DISCOUNT_PCT: Final[int] = 90


def cost_paise(model: str, input_tokens: int, output_tokens: int, cached_tokens: int = 0) -> int:
    in_rate = INPUT_PRICE_PAISE_PER_M.get(model, 0)
    out_rate = OUTPUT_PRICE_PAISE_PER_M.get(model, 0)
    fresh_in = max(input_tokens - cached_tokens, 0)
    cached_cost = (cached_tokens * in_rate * (100 - CACHED_INPUT_DISCOUNT_PCT)) // (100 * 1_000_000)
    fresh_cost = (fresh_in * in_rate) // 1_000_000
    out_cost = (output_tokens * out_rate) // 1_000_000
    return cached_cost + fresh_cost + out_cost
