"""Identity & tenant primitives. Pydantic mirrors of TS identity.ts."""

from __future__ import annotations

import re
from datetime import datetime
from enum import Enum
from typing import Any

import phonenumbers
from pydantic import BaseModel, ConfigDict, Field


class Channel(str, Enum):
    WHATSAPP = "whatsapp"
    TWITTER = "twitter"
    TELEGRAM = "telegram"
    INSTAGRAM = "instagram"
    EMAIL = "email"
    INTERNAL = "internal"


class PrincipalRole(str, Enum):
    END_USER = "end_user"
    BUSINESS_OWNER = "business_owner"
    BUSINESS_TEAM_MEMBER = "business_team_member"
    BUSINESS_AGENT = "business_agent"


class TenantRole(str, Enum):
    OWNER = "owner"
    ADMIN = "admin"
    OPERATOR = "operator"
    VIEWER = "viewer"


class TenantStatus(str, Enum):
    PENDING = "pending"
    ACTIVE = "active"
    SUSPENDED = "suspended"
    CHURNED = "churned"


class TenantTier(str, Enum):
    FREE = "free"
    STARTER = "starter"
    GROWTH = "growth"
    PRO = "pro"
    ENTERPRISE = "enterprise"


class Principal(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str
    display_name: str | None = None
    created_at: datetime
    updated_at: datetime
    metadata: dict[str, Any] = Field(default_factory=dict)


class Identifier(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str
    principal_id: str
    channel: Channel
    identifier: str
    verified: bool
    created_at: datetime


class TenantMembership(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str
    tenant_id: str
    principal_id: str
    role: TenantRole
    permissions: list[str] = Field(default_factory=list)
    invited_by: str | None = None
    joined_at: datetime | None = None
    created_at: datetime


class LinkingCode(BaseModel):
    model_config = ConfigDict(extra="ignore")

    code: str
    principal_id: str
    source_channel: Channel
    expires_at: datetime
    used_at: datetime | None = None
    created_at: datetime


_TWITTER_HANDLE = re.compile(r"^[A-Za-z0-9_]{1,15}$")


def normalize_identifier(channel: Channel | str, raw: str) -> str:
    """Match TS shared-types/src/identity.ts:normalizeIdentifier semantics."""
    ch = channel.value if isinstance(channel, Channel) else channel
    if ch == Channel.WHATSAPP.value:
        # Try to parse as phone number — accept any country, output E.164.
        try:
            parsed = phonenumbers.parse(raw, "IN")
        except phonenumbers.NumberParseException as e:
            raise ValueError(f"invalid phone number: {raw}") from e
        if not phonenumbers.is_valid_number(parsed):
            raise ValueError(f"invalid phone number: {raw}")
        return phonenumbers.format_number(parsed, phonenumbers.PhoneNumberFormat.E164)
    if ch == Channel.TWITTER.value:
        candidate = raw.lstrip("@").lower()
        if not _TWITTER_HANDLE.match(candidate):
            raise ValueError(f"invalid twitter handle: {raw}")
        return candidate
    if ch == Channel.EMAIL.value:
        return raw.strip().lower()
    return raw
