"""LLM router — central dispatcher across Anthropic (primary), Azure OpenAI
(fallback), and Sarvam (Indic optional). Each call is metered and budget-checked."""

from llm_router.router import LLMResponse, LLMRouter, get_router

__all__ = ["LLMResponse", "LLMRouter", "get_router"]
