"""Agent harness — multi-step XML-tag-dispatch loop for the Business Agent.

The model emits an XML-tagged response each turn. The harness parses it, dispatches
each tag to a pathway (capability call, customer reply, escalation, memory write,
approval pause, end-of-turn), feeds tool results back into the next prompt, and
repeats until either ``<final/>`` is emitted or a guardrail trips.

Bounded by:
- max model calls per turn (default 8)
- max wallclock (default 30s)
- max cost per turn (default ₹2 = 200 paise)
- per-tool approval gates from the blueprint's policies
"""

from orchestrator.harness.loop import HarnessResult, run_harness

__all__ = ["HarnessResult", "run_harness"]
