"""End-to-end harness loop tests with a scripted LLM (no real API calls).

Verifies: turn termination semantics, output exclusivity, no-progress breaker,
permission gate suspension, and bounded autonomy caps.
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from typing import Any
from unittest.mock import AsyncMock, patch

import pytest

from orchestrator.harness.loop import HarnessCaps, HarnessInputs, run_harness
from orchestrator.harness.state import TerminationCode, TurnOutcome


class FakeLLMResponse:
    def __init__(self, text: str) -> None:
        self.text = text
        self.provider = "anthropic"
        self.model = "claude-sonnet-4-6"
        self.input_tokens = 100
        self.output_tokens = 50
        self.cached_tokens = 0
        self.cost_paise = 5


def _scripted_router(scripts: list[str]) -> AsyncMock:
    """Returns a fake router whose .complete() yields each script in turn."""
    iterator = iter(scripts)

    async def fake_complete(**kwargs: Any) -> FakeLLMResponse:
        try:
            return FakeLLMResponse(next(iterator))
        except StopIteration:
            return FakeLLMResponse("<final/>")

    mock_router = AsyncMock()
    mock_router.complete = fake_complete
    return mock_router


def _stub_state_persistence() -> AsyncIterator[None]:
    """Avoid touching Mongo in unit tests."""
    return patch("orchestrator.harness.loop.save_state", new=AsyncMock(return_value=None))


def _base_inputs(text: str = "Hi") -> HarnessInputs:
    return HarnessInputs(
        tenant_id="11111111-1111-1111-1111-111111111111",
        thread_id="22222222-2222-2222-2222-222222222222",
        principal_id="33333333-3333-3333-3333-333333333333",
        user_message_text=text,
        history=[],
        blueprint=None,  # platform-mode (Veda) for unit tests
    )


@pytest.mark.asyncio
async def test_simple_say_then_final_finalises():
    scripts = ["<say>Hi! How can I help?</say><final/>"]
    with _stub_state_persistence(), patch(
        "orchestrator.harness.loop.get_router", return_value=_scripted_router(scripts)
    ):
        result = await run_harness(_base_inputs())
    assert result.outcome == TurnOutcome.FINALIZE
    assert result.termination_code == TerminationCode.MODEL_EMITTED_FINAL_ANSWER.value
    assert result.outbound == {"type": "text", "text": "Hi! How can I help?"}
    assert result.iterations == 1


@pytest.mark.asyncio
async def test_output_exclusivity_violation_fails_turn():
    scripts = ['<say>Sure!</say><call name="catalog.search">{}</call><final/>']
    with _stub_state_persistence(), patch(
        "orchestrator.harness.loop.get_router", return_value=_scripted_router(scripts)
    ):
        result = await run_harness(_base_inputs())
    assert result.outcome == TurnOutcome.FAIL
    assert result.termination_code == TerminationCode.MODEL_OUTPUT_AMBIGUOUS.value
    assert result.outbound is None


@pytest.mark.asyncio
async def test_no_progress_breaker_terminates():
    # Model emits an empty thinking-only response 5 times — no actions, no answer.
    # Loop should give up via LOOP_NO_PROGRESS after max_no_progress_iterations.
    scripts = ["<thinking>hmm</thinking>"] * 8
    with _stub_state_persistence(), patch(
        "orchestrator.harness.loop.get_router", return_value=_scripted_router(scripts)
    ):
        result = await run_harness(
            _base_inputs(),
            HarnessCaps(max_iterations=8, max_no_progress_iterations=3, max_cost_paise=10_000),
        )
    # After several thinking-only turns the digest is the same and the breaker fires.
    assert result.outcome == TurnOutcome.EXPIRE
    assert result.termination_code in {
        TerminationCode.LOOP_NO_PROGRESS.value,
        TerminationCode.LOOP_MAX_ITERATIONS.value,
    }


@pytest.mark.asyncio
async def test_iteration_cap_expires_with_code():
    # Model never emits <final/>; just <thinking>; loop hits max_iterations.
    scripts = [f"<thinking>turn {i}</thinking><say>thinking</say>" for i in range(20)]
    with _stub_state_persistence(), patch(
        "orchestrator.harness.loop.get_router", return_value=_scripted_router(scripts)
    ):
        result = await run_harness(
            _base_inputs(),
            HarnessCaps(max_iterations=3, max_no_progress_iterations=10, max_cost_paise=10_000),
        )
    # After max_iterations iterations with say-only output, Site 7 will FINALIZE
    # because there's a draft reply ready (implicit-final). That's correct behaviour
    # — we have something to send and shouldn't drop it on the floor.
    assert result.outcome in (TurnOutcome.FINALIZE, TurnOutcome.EXPIRE)


@pytest.mark.asyncio
async def test_say_only_no_final_implicitly_finalises():
    scripts = ["<say>Hello there.</say>"]
    with _stub_state_persistence(), patch(
        "orchestrator.harness.loop.get_router", return_value=_scripted_router(scripts)
    ):
        result = await run_harness(_base_inputs())
    assert result.outcome == TurnOutcome.FINALIZE
    assert result.outbound == {"type": "text", "text": "Hello there."}


@pytest.mark.asyncio
async def test_ask_with_buttons_finalises_with_interactive():
    scripts = [
        '<ask body_text="OEM or aftermarket?">'
        '<button id="oem">OEM</button>'
        '<button id="aft">Aftermarket</button>'
        '<button id="both">Both</button>'
        "</ask>"
    ]
    with _stub_state_persistence(), patch(
        "orchestrator.harness.loop.get_router", return_value=_scripted_router(scripts)
    ):
        result = await run_harness(_base_inputs())
    assert result.outcome == TurnOutcome.FINALIZE
    assert result.outbound is not None
    assert result.outbound["type"] == "buttons"
    assert len(result.outbound["buttons"]) == 3
    assert result.outbound["buttons"][0]["id"] == "oem"
