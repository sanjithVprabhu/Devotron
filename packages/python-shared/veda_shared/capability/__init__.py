"""Capability worker framework.

Each capability is a coroutine function decorated with ``@capability(<id>)``. The
agent orchestrator calls them via the registry. This module is small on purpose —
worker logic lives in capabilities/<domain>/<id>.py.
"""

from veda_shared.capability.base import (
    CapabilityError,
    CapabilityHandler,
    CapabilityRegistry,
    capability,
    registry,
)

__all__ = ["CapabilityError", "CapabilityHandler", "CapabilityRegistry", "capability", "registry"]
