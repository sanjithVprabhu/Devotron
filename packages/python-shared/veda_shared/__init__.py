"""Shared infrastructure and schemas for VEDA Python services.

Conventions:
- Every Pydantic model uses ``model_config = ConfigDict(extra="forbid")`` at the boundary
  (events, capability inputs/outputs) so unknown fields are rejected loudly.
- All ``infra`` clients are async and return idempotent context managers.
- Settings come from environment via ``veda_shared.settings.Settings``.
"""

from veda_shared.settings import Settings, get_settings

__all__ = ["Settings", "get_settings"]
