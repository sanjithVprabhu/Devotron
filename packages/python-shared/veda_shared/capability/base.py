from __future__ import annotations

import time
from collections.abc import Awaitable, Callable
from typing import Any

from veda_shared.logging import get_logger
from veda_shared.schemas.capabilities import (
    CapabilityCall,
    CapabilityErrorPayload,
    CapabilityId,
    CapabilityResult,
)
from veda_shared.schemas.errors import ERROR_CODES, VedaError

log = get_logger(__name__)

CapabilityHandler = Callable[[CapabilityCall], Awaitable[Any]]


class CapabilityError(VedaError):
    pass


class CapabilityRegistry:
    """In-process registry. Each Python service that exposes capabilities (the
    agent-orchestrator, capability-workers as a service) imports their handler
    modules at startup; the ``@capability`` decorator registers them here."""

    def __init__(self) -> None:
        self._handlers: dict[CapabilityId, CapabilityHandler] = {}

    def register(self, capability_id: CapabilityId, handler: CapabilityHandler) -> None:
        if capability_id in self._handlers:
            raise RuntimeError(f"capability {capability_id} registered twice")
        self._handlers[capability_id] = handler

    def has(self, capability_id: CapabilityId) -> bool:
        return capability_id in self._handlers

    def list(self) -> list[CapabilityId]:
        return list(self._handlers.keys())

    async def invoke(self, call: CapabilityCall) -> CapabilityResult:
        handler = self._handlers.get(call.capability)
        if handler is None:
            return CapabilityResult(
                capability=call.capability,
                ok=False,
                error=CapabilityErrorPayload(
                    code=ERROR_CODES.NOT_IMPLEMENTED,
                    message=f"capability {call.capability.value} not registered",
                ),
                duration_ms=0,
            )

        start = time.perf_counter()
        try:
            output = await handler(call)
            return CapabilityResult(
                capability=call.capability,
                ok=True,
                output=output,
                duration_ms=int((time.perf_counter() - start) * 1000),
            )
        except VedaError as e:
            log.warning(
                "capability.failed",
                capability=call.capability.value,
                tenant_id=call.tenant_id,
                code=e.code,
                error=e.message,
            )
            return CapabilityResult(
                capability=call.capability,
                ok=False,
                error=CapabilityErrorPayload(code=e.code, message=e.message, details=e.details),
                duration_ms=int((time.perf_counter() - start) * 1000),
            )
        except Exception as e:  # noqa: BLE001
            log.exception(
                "capability.crashed",
                capability=call.capability.value,
                tenant_id=call.tenant_id,
            )
            return CapabilityResult(
                capability=call.capability,
                ok=False,
                error=CapabilityErrorPayload(
                    code=ERROR_CODES.INTERNAL,
                    message=str(e),
                ),
                duration_ms=int((time.perf_counter() - start) * 1000),
            )


registry = CapabilityRegistry()


def capability(capability_id: CapabilityId) -> Callable[[CapabilityHandler], CapabilityHandler]:
    """Decorator that registers a coroutine as the handler for the given capability."""

    def wrapper(fn: CapabilityHandler) -> CapabilityHandler:
        registry.register(capability_id, fn)
        return fn

    return wrapper
