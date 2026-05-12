"""The 7 continue-sites the harness loop walks each iteration.

Order is fixed:
  1. permission.gate         — risk-classify each <call>; suspend if approval needed
  2. tools.execute           — run the cleared <call>s (parallel-safe), journal results
  3. memory_verify.skeptical — re-read live state for any memory_claim args
  4. critic.review           — optional safety/quality review of tool outputs
  5. compaction.maybe        — summarize old turns if context is getting fat
  6. swarm.maybe             — spawn isolated sub-agent if <swarm> emitted
  7. output.decide           — finalize / iterate / fail / cancel / expire / suspend

Each site reads & mutates the HarnessState in place and appends its own SiteEntry.
A site can short-circuit the rest of the loop iteration by returning a non-None
TurnOutcome.
"""

from orchestrator.harness.sites import compaction, critic, memory_verify, output, permission, swarm, tools

__all__ = ["permission", "tools", "memory_verify", "critic", "compaction", "swarm", "output"]
