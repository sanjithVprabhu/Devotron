"""Dynamic tool registry — tenant-registered HTTP tools (UI-driven).

Distinct from the built-in capability registry (`veda_shared.capability`),
which holds Python-coded primitives (catalog.search, payment.razorpay, etc.).

This module loads tool definitions from business.api_tools and executes them
against the tenant's chosen API endpoints. Used as a fallback dispatcher when
the harness emits a `<call>` for a name that's NOT in the built-in registry.
"""

from orchestrator.tools.loader import (
    load_active_tools,
    load_api_config,
    load_tool_by_name,
    invalidate_cache,
)
from orchestrator.tools.dispatcher import invoke_dynamic_tool, classify_risk

__all__ = [
    "load_active_tools",
    "load_api_config",
    "load_tool_by_name",
    "invalidate_cache",
    "invoke_dynamic_tool",
    "classify_risk",
]
