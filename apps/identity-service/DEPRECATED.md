# DEPRECATED — `apps/identity-service/`

This microservice scaffolded a `POST /principals/resolve` HTTP endpoint for
mapping (channel, identifier) → principal_id. **It was never wired into the
runtime.** Identity resolution now lives:

- In the dashboard's [`apps/dashboard/app/api/auth/verify/route.ts`](../dashboard/app/api/auth/verify/route.ts) (inline Postgres lookup)
- In the edge layer's [`apps/edge/src/identity/resolver.ts`](../edge/src/identity/resolver.ts) (with Redis cache)
- In the orchestrator's `_resolve_or_create_principal` in [`apps/orchestrator/orchestrator/main.py`](../orchestrator/orchestrator/main.py) (test-only)

**Status:** unreferenced. Not loaded by any deployment. The same logic is
embedded in three places — could be extracted into this service if growth
demands.

**Recovery path:** revive when one of: (a) the three implementations drift,
(b) identity becomes a cross-cutting concern needing its own SLA / cache
strategy, or (c) the platform needs a non-Postgres identity store.

**Removal date:** if the directory hasn't been used by 2027-01-01, delete it.
