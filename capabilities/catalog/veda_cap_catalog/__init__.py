"""Catalog capability workers — registered with the orchestrator's capability registry.

Importing this package side-effects: it registers ``catalog.search``,
``catalog.add``, ``catalog.update``, ``catalog.bulk_import``, and
``catalog.vehicle_compat_lookup`` handlers.
"""

from veda_cap_catalog import bulk_import, mutations, search, vehicle  # noqa: F401
