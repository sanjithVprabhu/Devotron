"""LLMRouter: central dispatcher across providers.

Default v1 provider is **OpenAI direct** (gpt-4o for reasoning, gpt-4o-mini for
cheap classification). Anthropic and Azure OpenAI are available as fallbacks.
A ``mock`` provider returns canned harness XML — used for keyless end-to-end demos
and the harness test suite.

Override the default via ``LLM_DEFAULT_PROVIDER``. Per-task overrides live in
``TASK_ROUTES`` below.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timezone
from typing import Any, Literal
from uuid import uuid4

from anthropic import AsyncAnthropic
from openai import AsyncAzureOpenAI, AsyncOpenAI
from tenacity import AsyncRetrying, retry_if_exception_type, stop_after_attempt, wait_exponential

from llm_router.mock import mock_complete, mock_embed
from llm_router.pricing import cost_paise
from veda_shared.infra.kafka import get_producer
from veda_shared.infra.redis import get_redis, tenant_key
from veda_shared.logging import get_logger
from veda_shared.schemas.constants import DEFAULTS, KAFKA_TOPICS
from veda_shared.schemas.errors import ERROR_CODES, VedaError
from veda_shared.schemas.events import BillingUsageEvent
from veda_shared.settings import get_settings

log = get_logger(__name__)

Provider = Literal["openai", "anthropic", "azure_openai", "sarvam", "mock"]


@dataclass
class TaskRoute:
    """Maps a logical task to a provider+model. Provider can be ``None`` to mean
    'use the platform default' (``settings.llm_default_provider``)."""

    task: str
    tier: Literal["reasoning", "cheap", "embedding"]
    fallback_chain: list[Provider] | None = None


# All tasks declare a tier ("reasoning" or "cheap"); the actual model is resolved
# at call time based on the active provider. This keeps the route table compact
# and makes provider-switching a single env var.
TASK_ROUTES: dict[str, TaskRoute] = {
    "language_detection":            TaskRoute("language_detection", "cheap"),
    "tone_inference":                TaskRoute("tone_inference", "cheap"),
    "intent_classification":         TaskRoute("intent_classification", "cheap"),
    "catalog_search_extraction":     TaskRoute("catalog_search_extraction", "cheap"),
    "faq_response_formatter":        TaskRoute("faq_response_formatter", "cheap"),
    "support_response":              TaskRoute("support_response", "reasoning"),
    "transaction_handling":          TaskRoute("transaction_handling", "reasoning"),
    "admin_commands":                TaskRoute("admin_commands", "reasoning"),
    "intake_question_generation":   TaskRoute("intake_question_generation", "reasoning"),
    "market_analysis":               TaskRoute("market_analysis", "reasoning"),
    "hindi_generation":              TaskRoute("hindi_generation", "reasoning"),
    "indic_deep_generation":         TaskRoute("indic_deep_generation", "reasoning",
                                               fallback_chain=["anthropic", "azure_openai"]),
    "image_analysis":                TaskRoute("image_analysis", "reasoning"),
    "fallback_complex":              TaskRoute("fallback_complex", "reasoning"),
    "fallback_simple":               TaskRoute("fallback_simple", "cheap"),
    "embedding":                     TaskRoute("embedding", "embedding"),
}


@dataclass
class LLMResponse:
    text: str
    provider: Provider
    model: str
    input_tokens: int
    output_tokens: int
    cached_tokens: int
    cost_paise: int
    raw: Any | None = None


def _model_for(provider: Provider, tier: Literal["reasoning", "cheap", "embedding"]) -> str:
    s = get_settings()
    if provider == "openai":
        if tier == "reasoning":
            return s.openai_reasoning_model
        if tier == "cheap":
            return s.openai_cheap_model
        return s.openai_embedding_model
    if provider == "anthropic":
        return s.anthropic_reasoning_model if tier == "reasoning" else s.anthropic_cheap_model
    if provider == "azure_openai":
        if tier == "reasoning":
            return s.azure_openai_deployment_gpt4o
        if tier == "cheap":
            return s.azure_openai_deployment_gpt4o_mini
        return s.azure_openai_deployment_embed
    if provider == "mock":
        return f"mock-{tier}"
    return "unknown"


class LLMRouter:
    def __init__(self) -> None:
        s = get_settings()
        self._openai: AsyncOpenAI | None = None
        self._azure_openai: AsyncAzureOpenAI | None = None
        self._anthropic: AsyncAnthropic | None = None

        if s.openai_api_key:
            kwargs: dict[str, Any] = {"api_key": s.openai_api_key}
            if s.openai_base_url:
                kwargs["base_url"] = s.openai_base_url
            self._openai = AsyncOpenAI(**kwargs)
        if s.azure_openai_api_key and s.azure_openai_endpoint:
            self._azure_openai = AsyncAzureOpenAI(
                api_key=s.azure_openai_api_key,
                azure_endpoint=s.azure_openai_endpoint,
                api_version=s.azure_openai_api_version,
            )
        if s.anthropic_api_key:
            self._anthropic = AsyncAnthropic(api_key=s.anthropic_api_key)

    # ── public API ────────────────────────────────────────────────────────
    async def complete(
        self,
        task: str,
        *,
        system: str,
        messages: list[dict[str, Any]],
        tenant_id: str | None = None,
        max_tokens: int = 500,
        temperature: float = 0.4,
        cache_system_prompt: bool = True,
    ) -> LLMResponse:
        route = TASK_ROUTES.get(task)
        if route is None:
            raise VedaError(ERROR_CODES.INVALID_INPUT, f"unknown task {task}")

        # Build the provider attempt order: default → fallback chain → mock as last resort
        s = get_settings()
        attempt_order = self._provider_chain(route, s.llm_default_provider)

        # Pre-check budget conservatively against the first provider's pricing.
        first_model = _model_for(attempt_order[0], route.tier)
        approx_cost = cost_paise(
            first_model,
            sum(len(m.get("content", "")) // 4 if isinstance(m.get("content"), str) else 0 for m in messages),
            max_tokens,
        )
        if not await self.check_budget(tenant_id, approx_cost):
            raise VedaError(ERROR_CODES.BUDGET_EXCEEDED, "tenant budget exhausted", retryable=False)

        last_err: Exception | None = None
        for provider in attempt_order:
            if not self._provider_available(provider):
                continue
            try:
                async for attempt in AsyncRetrying(
                    stop=stop_after_attempt(2),
                    wait=wait_exponential(multiplier=0.5, max=4),
                    retry=retry_if_exception_type((TimeoutError, ConnectionError)),
                    reraise=True,
                ):
                    with attempt:
                        return await self._dispatch(
                            provider, route, system, messages, max_tokens, temperature,
                            cache_system_prompt, tenant_id, task,
                        )
            except Exception as e:  # noqa: BLE001
                last_err = e
                log.warning("llm.provider_failed", provider=provider, task=task, error=str(e))
                continue
        raise VedaError(
            ERROR_CODES.LLM_PROVIDER_UNAVAILABLE,
            f"all providers failed: {last_err}",
            details={"attempted": attempt_order},
        )

    async def classify(
        self,
        *,
        text: str,
        options: list[str],
        tenant_id: str | None = None,
        instruction: str = "Classify the text. Respond with one of the option strings exactly.",
    ) -> str:
        opts = "\n".join(f"- {o}" for o in options)
        resp = await self.complete(
            task="intent_classification",
            tenant_id=tenant_id,
            system=instruction,
            messages=[
                {"role": "user", "content": f"Text: {text}\n\nOptions:\n{opts}\n\nAnswer with exactly one option."}
            ],
            max_tokens=20,
            temperature=0,
        )
        cleaned = resp.text.strip().splitlines()[0].strip() if resp.text.strip() else ""
        if cleaned in options:
            return cleaned
        for opt in options:
            if opt.lower() in cleaned.lower():
                return opt
        return options[-1]

    async def embed(self, texts: list[str], tenant_id: str | None = None) -> list[list[float]]:
        s = get_settings()
        provider = s.llm_default_provider
        if provider == "mock":
            return [await mock_embed(t) for t in texts]
        if provider == "openai" and self._openai:
            resp = await self._openai.embeddings.create(input=texts, model=s.openai_embedding_model)
            await self.record_usage(
                tenant_id, "openai", s.openai_embedding_model, "embedding",
                sum(len(t) // 4 for t in texts), 0, 0,
                cost_paise(s.openai_embedding_model, sum(len(t) // 4 for t in texts), 0),
            )
            return [d.embedding for d in resp.data]
        if self._azure_openai:
            resp = await self._azure_openai.embeddings.create(
                input=texts, model=s.azure_openai_deployment_embed,
            )
            return [d.embedding for d in resp.data]
        raise VedaError(ERROR_CODES.LLM_PROVIDER_UNAVAILABLE, "no embedding provider configured")

    # ── budget gate ──────────────────────────────────────────────────────
    async def check_budget(self, tenant_id: str | None, est_cost_paise: int) -> bool:
        if tenant_id is None:
            return True
        r = get_redis()
        today = date.today().isoformat()
        key = tenant_key(tenant_id, "cost", "daily", today)
        current = await r.get(key)
        used = int(current or 0)
        budget = DEFAULTS["DAILY_BUDGET_PAISE"]
        if used + est_cost_paise > budget:
            log.warning("budget.exceeded", tenant_id=tenant_id, used=used, budget=budget)
            return False
        return True

    async def record_usage(
        self,
        tenant_id: str | None,
        provider: Provider,
        model: str,
        task: str,
        input_tokens: int,
        output_tokens: int,
        cached_tokens: int,
        cost: int,
    ) -> None:
        if tenant_id is not None:
            r = get_redis()
            today = date.today().isoformat()
            key = tenant_key(tenant_id, "cost", "daily", today)
            await r.incrby(key, cost)
            await r.expire(key, 86_400 * 2)
        try:
            mapped: Literal["anthropic", "azure_openai", "sarvam", "azure_speech"]
            mapped = "azure_openai" if provider == "openai" else provider  # type: ignore[assignment]
            await get_producer().publish(
                KAFKA_TOPICS.BILLING_USAGE,
                BillingUsageEvent(
                    event_id=str(uuid4()),
                    occurred_at=datetime.now(timezone.utc),
                    tenant_id=tenant_id,
                    provider=mapped,
                    model=model,
                    task_type=task,
                    input_tokens=input_tokens,
                    output_tokens=output_tokens,
                    cached_tokens=cached_tokens,
                    cost_paise=cost,
                ),
            )
        except Exception:  # noqa: BLE001
            log.exception("billing.publish_failed", tenant_id=tenant_id)

    # ── internals ─────────────────────────────────────────────────────────
    def _provider_chain(self, route: TaskRoute, default: Provider) -> list[Provider]:
        chain: list[Provider] = [default]
        for p in route.fallback_chain or []:
            if p not in chain:
                chain.append(p)
        # Sensible global fallbacks last
        for p in ("openai", "anthropic", "azure_openai", "mock"):
            if p not in chain:
                chain.append(p)  # type: ignore[arg-type]
        return chain

    def _provider_available(self, provider: Provider) -> bool:
        if provider == "openai":
            return self._openai is not None
        if provider == "anthropic":
            return self._anthropic is not None
        if provider == "azure_openai":
            return self._azure_openai is not None
        if provider == "mock":
            return True
        return False

    async def _dispatch(
        self,
        provider: Provider,
        route: TaskRoute,
        system: str,
        messages: list[dict[str, Any]],
        max_tokens: int,
        temperature: float,
        cache_system_prompt: bool,
        tenant_id: str | None,
        task: str,
    ) -> LLMResponse:
        model = _model_for(provider, route.tier)
        if provider == "mock":
            return await self._call_mock(task, system, messages, max_tokens)
        if provider == "openai":
            return await self._call_openai_direct(model, system, messages, max_tokens, temperature, tenant_id, task)
        if provider == "anthropic":
            return await self._call_anthropic(model, system, messages, max_tokens, temperature, cache_system_prompt, tenant_id, task)
        if provider == "azure_openai":
            return await self._call_azure_openai(model, system, messages, max_tokens, temperature, tenant_id, task)
        raise VedaError(ERROR_CODES.LLM_PROVIDER_UNAVAILABLE, f"unknown provider {provider}")

    async def _call_mock(
        self, task: str, system: str, messages: list[dict[str, Any]], max_tokens: int
    ) -> LLMResponse:
        resp = await mock_complete(task=task, system=system, messages=messages, max_tokens=max_tokens)
        return LLMResponse(
            text=resp.text,
            provider="mock",
            model=resp.model,
            input_tokens=resp.input_tokens,
            output_tokens=resp.output_tokens,
            cached_tokens=0,
            cost_paise=0,
            raw=None,
        )

    async def _call_openai_direct(
        self, model: str, system: str, messages: list[dict[str, Any]],
        max_tokens: int, temperature: float, tenant_id: str | None, task: str,
    ) -> LLMResponse:
        assert self._openai is not None
        resp = await self._openai.chat.completions.create(
            model=model,
            max_tokens=max_tokens,
            temperature=temperature,
            messages=[{"role": "system", "content": system}, *messages],
        )
        choice = resp.choices[0]
        text = choice.message.content or ""
        in_tok = resp.usage.prompt_tokens if resp.usage else 0
        out_tok = resp.usage.completion_tokens if resp.usage else 0
        cost = cost_paise(model, in_tok, out_tok)
        await self.record_usage(tenant_id, "openai", model, task, in_tok, out_tok, 0, cost)
        return LLMResponse(
            text=text, provider="openai", model=model,
            input_tokens=in_tok, output_tokens=out_tok, cached_tokens=0,
            cost_paise=cost, raw=resp,
        )

    async def _call_azure_openai(
        self, model: str, system: str, messages: list[dict[str, Any]],
        max_tokens: int, temperature: float, tenant_id: str | None, task: str,
    ) -> LLMResponse:
        assert self._azure_openai is not None
        resp = await self._azure_openai.chat.completions.create(
            model=model,
            max_tokens=max_tokens,
            temperature=temperature,
            messages=[{"role": "system", "content": system}, *messages],
        )
        choice = resp.choices[0]
        text = choice.message.content or ""
        in_tok = resp.usage.prompt_tokens if resp.usage else 0
        out_tok = resp.usage.completion_tokens if resp.usage else 0
        cost = cost_paise(model, in_tok, out_tok)
        await self.record_usage(tenant_id, "azure_openai", model, task, in_tok, out_tok, 0, cost)
        return LLMResponse(
            text=text, provider="azure_openai", model=model,
            input_tokens=in_tok, output_tokens=out_tok, cached_tokens=0,
            cost_paise=cost, raw=resp,
        )

    async def _call_anthropic(
        self, model: str, system: str, messages: list[dict[str, Any]],
        max_tokens: int, temperature: float, cache_system_prompt: bool,
        tenant_id: str | None, task: str,
    ) -> LLMResponse:
        assert self._anthropic is not None
        sys_block: Any = (
            [{"type": "text", "text": system, "cache_control": {"type": "ephemeral"}}]
            if cache_system_prompt
            else system
        )
        resp = await self._anthropic.messages.create(
            model=model,
            max_tokens=max_tokens,
            temperature=temperature,
            system=sys_block,
            messages=[{"role": m["role"], "content": m["content"]} for m in messages],
        )
        text = "".join(getattr(b, "text", "") for b in resp.content if getattr(b, "type", None) == "text")
        usage = resp.usage
        in_tok = getattr(usage, "input_tokens", 0)
        out_tok = getattr(usage, "output_tokens", 0)
        cached_tok = getattr(usage, "cache_read_input_tokens", 0) or 0
        cost = cost_paise(model, in_tok, out_tok, cached_tok)
        await self.record_usage(tenant_id, "anthropic", model, task, in_tok, out_tok, cached_tok, cost)
        return LLMResponse(
            text=text, provider="anthropic", model=model,
            input_tokens=in_tok, output_tokens=out_tok, cached_tokens=cached_tok,
            cost_paise=cost, raw=resp,
        )


_router: LLMRouter | None = None


def get_router() -> LLMRouter:
    global _router
    if _router is None:
        _router = LLMRouter()
    return _router


def reset_router() -> None:
    """Drop the cached router (test seam)."""
    global _router
    _router = None
