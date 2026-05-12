"""Capability risk classification.

Used by Site 1 (permission gate) to decide whether a tool call can run freely,
needs owner approval, or is outright denied for the current blueprint.

Tunable per-tenant via ``blueprint.policies.<capability>.risk_override``.
"""

from __future__ import annotations

from enum import Enum
from typing import Any

from veda_shared.schemas.capabilities import CapabilityId


class RiskLevel(str, Enum):
    LOW = "low"        # read-only / safe; runs freely
    MEDIUM = "medium"  # mutates tenant data but reversible; owner approval based on policy
    HIGH = "high"      # external side effects (money out, mass outbound); always pauses for approval
    DENY = "deny"      # never runs in v1


# Source of truth. Update when a new capability is added.
DEFAULT_RISK: dict[str, RiskLevel] = {
    # catalog
    "catalog.search":                       RiskLevel.LOW,
    "catalog.vehicle_compat_lookup":        RiskLevel.LOW,
    "catalog.add":                          RiskLevel.MEDIUM,
    "catalog.update":                       RiskLevel.MEDIUM,
    "catalog.delete":                       RiskLevel.MEDIUM,
    "catalog.bulk_import":                  RiskLevel.MEDIUM,
    # payment
    "payment.razorpay.create_link":         RiskLevel.LOW,    # link creation is safe; pay still requires customer
    "payment.razorpay.verify":              RiskLevel.LOW,
    "payment.razorpay.refund":              RiskLevel.HIGH,   # money out
    "payment.upi_manual.get_details":       RiskLevel.LOW,
    "payment.cod.confirm":                  RiskLevel.LOW,
    # broadcast
    "broadcast.send":                       RiskLevel.HIGH,   # mass outbound; quality-rating risk
    "broadcast.schedule":                   RiskLevel.HIGH,
    "broadcast.preview":                    RiskLevel.LOW,
    # scheduling
    "scheduling.calendar.check_availability": RiskLevel.LOW,
    "scheduling.calendar.book":             RiskLevel.MEDIUM,
    "scheduling.calendar.cancel":           RiskLevel.MEDIUM,
    # support
    "support.faq.search":                   RiskLevel.LOW,
    "support.faq.add":                      RiskLevel.MEDIUM,
    "support.escalation.create":            RiskLevel.LOW,
    # recommendations
    "recommendations.similar_items":        RiskLevel.LOW,
    "recommendations.personalized":         RiskLevel.LOW,
    # media
    "media.transcribe":                     RiskLevel.LOW,
    "media.image_analyze":                  RiskLevel.LOW,
    # negotiation
    "negotiation.bounded":                  RiskLevel.MEDIUM,
    # template
    "template.lookup":                      RiskLevel.LOW,
    "template.submit":                      RiskLevel.MEDIUM,
    # integrations
    "integration.shopify.sync_catalog":     RiskLevel.MEDIUM,
    "integration.ats.search_jobs":          RiskLevel.LOW,
    "integration.ats.get_candidate_profile": RiskLevel.LOW,
    "integration.ats.submit_application":   RiskLevel.HIGH,   # real application submission
    "integration.ats.get_application_status": RiskLevel.LOW,
    "integration.crawl.extract_catalog":    RiskLevel.LOW,
    "integration.api_sandbox.call":         RiskLevel.MEDIUM,
    # a2a (Phase 3 primitives — capability slot exists, real wire format TBD)
    # Always requires owner approval: cross-agent calls touch external orgs and
    # may move money or share customer data. Will stay HIGH until trust /
    # settlement / loop guards are designed and shipped.
    "a2a.transact":                         RiskLevel.HIGH,
}


def classify(capability: str, blueprint: dict[str, Any] | None = None) -> RiskLevel:
    """Resolve risk level for a capability, honoring blueprint overrides."""
    base = DEFAULT_RISK.get(capability, RiskLevel.MEDIUM)
    if blueprint is None:
        return base
    overrides = (
        blueprint.get("capabilities", {}).get("config", {}).get(capability, {}).get("risk_override")
    )
    if isinstance(overrides, str):
        try:
            return RiskLevel(overrides)
        except ValueError:
            pass
    return base


def known_capability(capability: str) -> bool:
    """True if the capability id is recognised. Unknown ids are denied at Site 1."""
    if capability in DEFAULT_RISK:
        return True
    try:
        CapabilityId(capability)
        return True
    except ValueError:
        return False
