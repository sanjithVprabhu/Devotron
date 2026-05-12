# DEPRECATED — `apps/catalog-service/`

This microservice was scaffolded as a per-tenant catalog CRUD HTTP service but
was **never wired into the runtime**. The orchestrator calls the `catalog.*`
capabilities directly (Mongo + Qdrant), and the dashboard calls the same
capabilities via inline DB access from its BFF routes.

**Status:** unreferenced. Safe to ignore. Not loaded by any deployment.

**Reason kept on disk:** in case a future scale point requires extracting
catalog CRUD into its own service (e.g. when catalog mutations become a
write-bottleneck or need separate horizontal scaling). The scaffold + Dockerfile
+ tests are a starting point.

**Recovery path:** delete this file, wire `apps/catalog-service/main.py:upsert_item`
back into the dashboard's `/api/catalog/route.ts` via `callService('catalog', ...)`,
add CATALOG_SERVICE_URL to env, run `pnpm install` in the service dir.

**Removal date:** if the directory hasn't been used by 2027-01-01, delete it.
