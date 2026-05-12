"""Parser must be lenient: malformed XML is dropped, valid tags survive, order preserved."""

from __future__ import annotations

from orchestrator.harness.parser import parse
from orchestrator.harness.tags import (
    AskEvent,
    CallEvent,
    EscalateEvent,
    FinalEvent,
    PlanEvent,
    RecallEvent,
    RememberEvent,
    RequestApprovalEvent,
    SayEvent,
    SwarmEvent,
    ThinkingEvent,
)


def test_basic_text_response():
    raw = "<thinking>let me check stock</thinking><say>Hi! What can I help with?</say><final/>"
    events = parse(raw)
    assert len(events) == 3
    assert isinstance(events[0], ThinkingEvent)
    assert isinstance(events[1], SayEvent)
    assert events[1].text == "Hi! What can I help with?"
    assert isinstance(events[2], FinalEvent)


def test_call_with_json_args():
    raw = '<call name="catalog.search" id="s1">{"query": "brake pads", "limit": 5}</call>'
    events = parse(raw)
    assert len(events) == 1
    e = events[0]
    assert isinstance(e, CallEvent)
    assert e.name == "catalog.search"
    assert e.correlation_id == "s1"
    assert e.args == {"query": "brake pads", "limit": 5}
    assert e.memory_claim is False
    assert e.side_effect is False


def test_call_flags_memory_claim_and_side_effect():
    raw = '<call name="payment.razorpay.create_link" memory_claim="true" side_effect="true">{"order_id": "o1", "amount_paise": 100}</call>'
    events = parse(raw)
    assert isinstance(events[0], CallEvent)
    assert events[0].memory_claim is True
    assert events[0].side_effect is True


def test_call_with_bad_json_returns_empty_args():
    raw = '<call name="catalog.search">not json at all</call>'
    events = parse(raw)
    assert len(events) == 1
    assert isinstance(events[0], CallEvent)
    assert events[0].args == {}


def test_ask_with_buttons():
    raw = (
        '<ask body_text="Pickup or delivery?">'
        '<button id="pickup">Pickup</button>'
        '<button id="delivery">Delivery</button>'
        "</ask>"
    )
    events = parse(raw)
    assert len(events) == 1
    e = events[0]
    assert isinstance(e, AskEvent)
    assert e.body_text == "Pickup or delivery?"
    assert len(e.buttons) == 2
    assert e.buttons[0].id == "pickup"
    assert e.buttons[1].title == "Delivery"


def test_ask_with_list_items():
    raw = (
        '<ask body_text="Pick a brand">'
        '<item id="bosch" desc="In stock">Bosch</item>'
        '<item id="brembo">Brembo</item>'
        "</ask>"
    )
    events = parse(raw)
    e = events[0]
    assert isinstance(e, AskEvent)
    assert len(e.list_items) == 2
    assert e.list_items[0].description == "In stock"


def test_remember_and_recall():
    raw = (
        '<remember key="preferred_brand" scope="principal">Bosch</remember>'
        '<recall key="last_vehicle" scope="principal"/>'
    )
    events = parse(raw)
    assert len(events) == 2
    assert isinstance(events[0], RememberEvent)
    assert events[0].key == "preferred_brand"
    assert events[0].value == "Bosch"
    assert events[0].scope == "principal"
    assert isinstance(events[1], RecallEvent)
    assert events[1].key == "last_vehicle"


def test_escalate_self_closing_with_attrs():
    raw = '<escalate to="owner" reason="refund_request"/>'
    events = parse(raw)
    e = events[0]
    assert isinstance(e, EscalateEvent)
    assert e.escalate_to == "owner"
    assert e.reason == "refund_request"


def test_request_approval_with_payload():
    raw = (
        '<request_approval capability="payment.razorpay.refund" label="Refund order ACM-12">'
        '{"order_id": "o1", "amount_paise": 250000}'
        "</request_approval>"
    )
    events = parse(raw)
    e = events[0]
    assert isinstance(e, RequestApprovalEvent)
    assert e.capability == "payment.razorpay.refund"
    assert e.action_label == "Refund order ACM-12"
    assert e.payload == {"order_id": "o1", "amount_paise": 250000}


def test_swarm_with_objective():
    raw = '<swarm name="research:vertical_intel" objective="brake pad market in Bengaluru"/>'
    events = parse(raw)
    e = events[0]
    assert isinstance(e, SwarmEvent)
    assert e.sub_agent_name == "research:vertical_intel"


def test_plan_and_thinking_preserved_in_order():
    raw = (
        "<thinking>step 1 think</thinking>"
        "<plan>search; quote; confirm</plan>"
        '<call name="catalog.search">{}</call>'
        "<final/>"
    )
    events = parse(raw)
    assert [type(e).__name__ for e in events] == [
        "ThinkingEvent",
        "PlanEvent",
        "CallEvent",
        "FinalEvent",
    ]


def test_malformed_tag_is_dropped_quietly():
    raw = "<say>hello</say><call name=>broken</call><say>still here</say>"
    events = parse(raw)
    # The two <say>s survive; the malformed <call> is dropped.
    say_events = [e for e in events if isinstance(e, SayEvent)]
    assert len(say_events) == 2


def test_unknown_tag_is_ignored():
    raw = "<say>real</say><unknown_tag>ignored</unknown_tag>"
    events = parse(raw)
    assert all(not isinstance(e, PlanEvent) for e in events)
    assert any(isinstance(e, SayEvent) for e in events)


def test_empty_input_returns_empty():
    assert parse("") == []
    assert parse("a") == []  # too short to recover as implicit say
    assert parse("\n\n   \n") == []


def test_plain_text_recovered_as_implicit_say_and_final():
    """Real LLMs sometimes drop the <say> wrapper after a tool call. Treat
    substantive free text as an implicit <say> + <final/> so the loop terminates."""
    events = parse("Sure, we have Bosch front pads at ₹1,200 and Brembo at ₹1,900.")
    assert len(events) == 2
    assert isinstance(events[0], SayEvent)
    assert "Bosch" in events[0].text
    assert isinstance(events[1], FinalEvent)


def test_thinking_only_response_does_not_trigger_implicit_say():
    """If the model only emits <thinking> (no actionable + no say), the parser
    should NOT synthesize a say from the thinking body — the loop should iterate."""
    events = parse("<thinking>let me look this up</thinking>")
    assert len(events) == 1
    assert events[0].__class__.__name__ == "ThinkingEvent"


def test_capability_shorthand_promoted_to_call():
    """LLMs (notably GPT-4o) frequently regress from `<call name="catalog.search">`
    to writing the capability name as the tag itself. Accept the shorthand if
    the dotted name matches a registered CapabilityId."""
    raw = '<catalog.search>{"query": "engine oil", "limit": 5}</catalog.search>'
    events = parse(raw)
    calls = [e for e in events if isinstance(e, CallEvent)]
    assert len(calls) == 1
    assert calls[0].name == "catalog.search"
    assert calls[0].args == {"query": "engine oil", "limit": 5}


def test_capability_shorthand_preserves_inline_attrs():
    raw = '<payment.razorpay.create_link side_effect="true" memory_claim="true">{"amount_paise": 120000}</payment.razorpay.create_link>'
    events = parse(raw)
    e = events[0]
    assert isinstance(e, CallEvent)
    assert e.name == "payment.razorpay.create_link"
    assert e.side_effect is True
    assert e.memory_claim is True


def test_unknown_dotted_tag_is_not_promoted():
    """Tags shaped like `<foo.bar.baz>...</foo.bar.baz>` that don't match a
    registered capability id must NOT be turned into CallEvents — they're
    almost certainly content the model is quoting back."""
    raw = '<say>Code: <foo.bar.baz>{"x": 1}</foo.bar.baz></say><final/>'
    events = parse(raw)
    calls = [e for e in events if isinstance(e, CallEvent)]
    assert len(calls) == 0


def test_capability_shorthand_bad_json_yields_empty_args():
    raw = "<catalog.search>not json</catalog.search>"
    events = parse(raw)
    calls = [e for e in events if isinstance(e, CallEvent)]
    assert len(calls) == 1
    assert calls[0].args == {}
