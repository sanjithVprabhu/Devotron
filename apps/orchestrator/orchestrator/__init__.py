"""VEDA agent orchestrator.

Two top-level agents share this process:
- Veda (the meta-agent) — global, identified by ``tenant_id is None``
- Business Agent — per-tenant; runs a Yggdrasil-style 7-site harness loop
  parameterised by its blueprint.

Capabilities are loaded into the global registry by calling
``register_capabilities()`` once at process start. Tests skip this so they don't
need the capability packages installed.
"""


def register_capabilities() -> None:
    """Side-effect import: each capability module registers itself with
    ``veda_shared.capability.registry`` on import. Call once from main.py."""
    import veda_cap_a2a  # noqa: F401  (Phase 3 primitives — gated by HIGH risk)
    import veda_cap_broadcast  # noqa: F401
    import veda_cap_catalog  # noqa: F401
    import veda_cap_integration  # noqa: F401
    import veda_cap_media  # noqa: F401
    import veda_cap_payment  # noqa: F401
    import veda_cap_recommendations  # noqa: F401
    import veda_cap_scheduling  # noqa: F401
    import veda_cap_support  # noqa: F401


__all__ = ["register_capabilities"]
