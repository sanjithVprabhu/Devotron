from __future__ import annotations

from typing import Final, Literal

from veda_shared.schemas.identity import TenantRole

Permission = Literal[
    "blueprint.read",
    "blueprint.mutate",
    "conversation.read",
    "conversation.takeover",
    "conversation.assign",
    "order.read",
    "order.update",
    "order.refund",
    "catalog.read",
    "catalog.add",
    "catalog.update",
    "catalog.delete",
    "team.invite",
    "team.remove",
    "team.role_change",
    "billing.read",
    "billing.manage",
    "daemon.proposals.read",
    "daemon.proposals.approve",
    "analytics.read",
    "broadcast.send",
    "integrations.manage",
]

ROLE_PERMISSIONS: Final[dict[TenantRole, list[Permission] | Literal["*"]]] = {
    TenantRole.OWNER: "*",
    TenantRole.ADMIN: [
        "blueprint.read",
        "blueprint.mutate",
        "conversation.read",
        "conversation.takeover",
        "conversation.assign",
        "order.read",
        "order.update",
        "order.refund",
        "catalog.read",
        "catalog.add",
        "catalog.update",
        "catalog.delete",
        "team.invite",
        "team.remove",
        "team.role_change",
        "daemon.proposals.read",
        "daemon.proposals.approve",
        "analytics.read",
        "broadcast.send",
        "integrations.manage",
    ],
    TenantRole.OPERATOR: [
        "blueprint.read",
        "conversation.read",
        "conversation.takeover",
        "order.read",
        "order.update",
        "catalog.read",
        "catalog.update",
        "daemon.proposals.read",
        "analytics.read",
    ],
    TenantRole.VIEWER: [
        "blueprint.read",
        "conversation.read",
        "order.read",
        "catalog.read",
        "analytics.read",
    ],
}


def has_permission(role: TenantRole, granted: list[str] | None, required: Permission) -> bool:
    base = ROLE_PERMISSIONS[role]
    if base == "*":
        return True
    if required in base:
        return True
    return bool(granted and required in granted)
