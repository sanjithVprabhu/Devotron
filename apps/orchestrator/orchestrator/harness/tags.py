"""XML tag taxonomy + parsed-event types.

The model emits an XML-shaped response each turn. The parser produces these event
objects, which the dispatcher routes through the 7 continue-sites.

To add a pathway:
  1. Add a TagName entry below.
  2. Add a parser case in parser.py.
  3. Add a dispatch case (usually inside Site 2 / tools or Site 7 / output).
  4. Document the tag in prompt.py so the model knows to emit it.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Literal


class TagName(str, Enum):
    THINKING = "thinking"                    # internal reasoning, never shown to user
    PLAN = "plan"                            # multi-step plan, logged for legibility
    CALL = "call"                            # invoke a capability
    SAY = "say"                              # text content for the customer
    ASK = "ask"                              # body + interactive choices
    BUTTON = "button"                        # nested in <ask>
    LIST_ITEM = "item"                       # nested in <ask>
    REMEMBER = "remember"                    # write a long-term fact
    RECALL = "recall"                        # read long-term memory (verified by Site 3)
    ESCALATE = "escalate"                    # human handoff
    REQUEST_APPROVAL = "request_approval"    # pause for owner approval
    SWARM = "swarm"                          # spawn an isolated sub-agent
    FINAL = "final"                          # signal end-of-turn


# ── Parsed event types ──────────────────────────────────────────────────


@dataclass
class ThinkingEvent:
    text: str


@dataclass
class PlanEvent:
    text: str


@dataclass
class CallEvent:
    name: str                         # capability id, e.g. "catalog.search"
    correlation_id: str | None        # optional; lets the model refer back
    args: dict[str, Any]
    memory_claim: bool = False        # if True, Site 3 verifies inputs against live state
    side_effect: bool = False         # if True, Site 2 journals before+after for durability


@dataclass
class SayEvent:
    text: str


@dataclass
class ButtonSpec:
    id: str
    title: str


@dataclass
class ListItemSpec:
    id: str
    title: str
    description: str | None = None


@dataclass
class AskEvent:
    body_text: str
    buttons: list[ButtonSpec] = field(default_factory=list)
    list_items: list[ListItemSpec] = field(default_factory=list)
    button_text: str = "Choose"
    list_section_title: str = "Options"


@dataclass
class RememberEvent:
    key: str
    value: str
    scope: Literal["thread", "principal", "tenant"] = "principal"


@dataclass
class RecallEvent:
    key: str
    scope: Literal["thread", "principal", "tenant"] = "principal"


@dataclass
class EscalateEvent:
    reason: str
    escalate_to: Literal["owner", "admin", "operator"] = "operator"


@dataclass
class RequestApprovalEvent:
    action_label: str
    capability: str                   # the capability that was about to be called
    payload: dict[str, Any]


@dataclass
class SwarmEvent:
    sub_agent_name: str               # e.g. "research:vertical_intel"
    objective: str
    context: dict[str, Any] = field(default_factory=dict)


@dataclass
class FinalEvent:
    pass


HarnessEvent = (
    ThinkingEvent
    | PlanEvent
    | CallEvent
    | SayEvent
    | AskEvent
    | RememberEvent
    | RecallEvent
    | EscalateEvent
    | RequestApprovalEvent
    | SwarmEvent
    | FinalEvent
)
