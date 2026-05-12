from __future__ import annotations

from enum import Enum
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class CapabilityId(str, Enum):
    # catalog
    CATALOG_SEARCH = "catalog.search"
    CATALOG_ADD = "catalog.add"
    CATALOG_UPDATE = "catalog.update"
    CATALOG_DELETE = "catalog.delete"
    CATALOG_BULK_IMPORT = "catalog.bulk_import"
    CATALOG_VEHICLE_COMPAT_LOOKUP = "catalog.vehicle_compat_lookup"
    # payment
    PAYMENT_RAZORPAY_CREATE_LINK = "payment.razorpay.create_link"
    PAYMENT_RAZORPAY_VERIFY = "payment.razorpay.verify"
    PAYMENT_RAZORPAY_REFUND = "payment.razorpay.refund"
    PAYMENT_UPI_MANUAL_GET_DETAILS = "payment.upi_manual.get_details"
    PAYMENT_COD_CONFIRM = "payment.cod.confirm"
    # broadcast
    BROADCAST_SEND = "broadcast.send"
    BROADCAST_SCHEDULE = "broadcast.schedule"
    BROADCAST_PREVIEW = "broadcast.preview"
    # scheduling
    SCHEDULING_CALENDAR_CHECK_AVAILABILITY = "scheduling.calendar.check_availability"
    SCHEDULING_CALENDAR_BOOK = "scheduling.calendar.book"
    SCHEDULING_CALENDAR_CANCEL = "scheduling.calendar.cancel"
    # support
    SUPPORT_FAQ_SEARCH = "support.faq.search"
    SUPPORT_FAQ_ADD = "support.faq.add"
    SUPPORT_ESCALATION_CREATE = "support.escalation.create"
    # recommendations
    RECOMMENDATIONS_SIMILAR_ITEMS = "recommendations.similar_items"
    RECOMMENDATIONS_PERSONALIZED = "recommendations.personalized"
    # media
    MEDIA_TRANSCRIBE = "media.transcribe"
    MEDIA_IMAGE_ANALYZE = "media.image_analyze"
    # negotiation
    NEGOTIATION_BOUNDED = "negotiation.bounded"
    # template
    TEMPLATE_LOOKUP = "template.lookup"
    TEMPLATE_SUBMIT = "template.submit"
    # integration
    INTEGRATION_SHOPIFY_SYNC_CATALOG = "integration.shopify.sync_catalog"
    INTEGRATION_ATS_SEARCH_JOBS = "integration.ats.search_jobs"
    INTEGRATION_ATS_GET_CANDIDATE_PROFILE = "integration.ats.get_candidate_profile"
    INTEGRATION_ATS_SUBMIT_APPLICATION = "integration.ats.submit_application"
    INTEGRATION_ATS_GET_APPLICATION_STATUS = "integration.ats.get_application_status"
    INTEGRATION_CRAWL_EXTRACT_CATALOG = "integration.crawl.extract_catalog"
    INTEGRATION_API_SANDBOX_CALL = "integration.api_sandbox.call"
    # a2a
    A2A_TRANSACT = "a2a.transact"


class CapabilityCall(BaseModel):
    model_config = ConfigDict(extra="ignore")

    capability: CapabilityId
    tenant_id: str
    thread_id: str | None = None
    invoked_by_principal_id: str | None = None
    input: dict[str, Any]
    trace_context: dict[str, str] | None = None


class CapabilityErrorPayload(BaseModel):
    code: str
    message: str
    details: Any | None = None


class CapabilityResult(BaseModel):
    model_config = ConfigDict(extra="ignore")

    capability: CapabilityId
    ok: bool
    output: Any = None
    error: CapabilityErrorPayload | None = None
    duration_ms: int = 0
    cost_paise: int = Field(default=0, ge=0)
