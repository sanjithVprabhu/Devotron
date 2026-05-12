from __future__ import annotations

from enum import Enum
from typing import Final


class Vertical(str, Enum):
    AUTO_PARTS = "auto_parts"
    JOBS = "jobs"
    SERVICES = "services"
    RETAIL = "retail"
    EDUCATION = "education"
    HEALTHCARE = "healthcare"
    FOOD = "food"
    REAL_ESTATE = "real_estate"
    EVENTS = "events"
    CONTENT = "content"
    B2B_DISTRIBUTION = "b2b_distribution"
    GENERIC = "generic"


# Mirrors packages/shared-types/src/verticals.ts
VERTICAL_CAPABILITY_BUNDLES: Final[dict[str, dict[str, list[str]]]] = {
    "auto_parts": {
        "enabled": [
            "catalog.search",
            "catalog.update",
            "catalog.vehicle_compat_lookup",
            "payment.razorpay.create_link",
            "payment.razorpay.verify",
            "payment.upi_manual.get_details",
            "payment.cod.confirm",
            "broadcast.send",
            "support.faq.search",
            "support.faq.add",
            "support.escalation.create",
            "recommendations.similar_items",
            "media.transcribe",
            "media.image_analyze",
            "template.lookup",
        ],
        "opt_in_available": [
            "negotiation.bounded",
            "scheduling.calendar.check_availability",
            "scheduling.calendar.book",
            "recommendations.personalized",
            "integration.shopify.sync_catalog",
        ],
    },
    "jobs": {
        "enabled": [
            "integration.ats.search_jobs",
            "integration.ats.get_candidate_profile",
            "integration.ats.submit_application",
            "integration.ats.get_application_status",
            "support.faq.search",
            "support.escalation.create",
            "scheduling.calendar.check_availability",
            "scheduling.calendar.book",
            "media.transcribe",
            "broadcast.send",
            "template.lookup",
        ],
        "opt_in_available": ["recommendations.personalized"],
    },
    "services": {
        "enabled": [
            "catalog.search",
            "scheduling.calendar.check_availability",
            "scheduling.calendar.book",
            "scheduling.calendar.cancel",
            "payment.razorpay.create_link",
            "payment.upi_manual.get_details",
            "support.faq.search",
            "support.escalation.create",
            "broadcast.send",
            "media.transcribe",
            "template.lookup",
        ],
        "opt_in_available": ["recommendations.personalized", "negotiation.bounded"],
    },
    "generic": {
        "enabled": ["support.faq.search", "support.escalation.create", "media.transcribe", "template.lookup"],
        "opt_in_available": [],
    },
}
