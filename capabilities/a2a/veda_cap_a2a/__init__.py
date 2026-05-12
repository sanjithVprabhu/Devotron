"""Phase 3 A2A primitives — capability slot only.

`a2a.transact` records intent into the existing `a2a.threads` / `a2a.messages`
tables and returns ``{"status": "queued_for_approval"}``. Real wire format
(JSON-RPC over HTTPS, signing, etc.) is intentionally not yet implemented —
that's the next deliverable when there's actual cross-agent demand from
real businesses on the platform.

Side effects today:
- Creates an a2a.threads row if missing
- Inserts an a2a.messages row with requires_human_approval=true

Risk classification (in harness/risk.py): HIGH — always pauses for owner
approval. The harness's permission gate handles the suspend.
"""

from veda_cap_a2a import transact  # noqa: F401
