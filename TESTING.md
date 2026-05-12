# VEDA — Self-Test Runbook

**Goal:** Verify the agent works end-to-end *without paying any BSP*. WhatsApp/AiSensy is just an HTTP transport — we can simulate everything from Postman/curl and watch the entire pipeline execute.

There are **two test paths**:

- **Path A — `/test/agent` sync endpoint** (recommended). Bypasses Kafka. POST a message, get the agent's reply in the same response. Use this 95% of the time.
- **Path B — `/webhooks/aisensy` async path**. Identical to what AiSensy will send when you go live. Returns 200 immediately; agent reply lands in MongoDB. Use this when you want to validate the webhook signature path.

---

## Pre-flight (services that must be up)

| Service | Required? | How to start |
|---|---|---|
| Neon Postgres | Yes — already up (cloud) | nothing |
| MongoDB Atlas | Yes — already up (cloud) | nothing |
| Qdrant Cloud | Yes — already up (cloud) | nothing |
| Redis (local) | Yes | `docker compose up -d redis` |
| Redpanda (local Kafka) | Path B only | `docker compose up -d redpanda` |
| Orchestrator (FastAPI) | Yes — `:8181` | see below |
| Edge (Fastify) | Path B only — `:8080` | `pnpm --filter @veda/edge start` |

### Start the orchestrator with the test API enabled

```bash
cd /home/sanjith/SanjithTS/DevAgent/apps/orchestrator
set -a && source ../../.env && set +a
export ENABLE_TEST_API=true
export PYTHONPATH=/home/sanjith/SanjithTS/DevAgent/packages/python-shared:/home/sanjith/SanjithTS/DevAgent/packages/llm-router:/home/sanjith/SanjithTS/DevAgent/capabilities/broadcast:/home/sanjith/SanjithTS/DevAgent/capabilities/catalog:/home/sanjith/SanjithTS/DevAgent/capabilities/integration:/home/sanjith/SanjithTS/DevAgent/capabilities/media:/home/sanjith/SanjithTS/DevAgent/capabilities/payment:/home/sanjith/SanjithTS/DevAgent/capabilities/recommendations:/home/sanjith/SanjithTS/DevAgent/capabilities/scheduling:/home/sanjith/SanjithTS/DevAgent/capabilities/support:/home/sanjith/SanjithTS/DevAgent/apps/orchestrator
python3 -m uvicorn orchestrator.main:app --host 127.0.0.1 --port 8181
```

Smoke test:
```bash
curl http://127.0.0.1:8181/healthz
# Expected: {"status":"ok"}
```

---

## Path A — `/test/agent` (sync, recommended)

### Endpoint

```
POST http://127.0.0.1:8181/test/agent
Content-Type: application/json
```

### Request body

```json
{
  "tenant_id": "11111111-1111-1111-1111-111111111111",
  "text": "<the customer's message>",
  "sender_identifier": "+919999911111",
  "channel": "whatsapp",
  "thread_id": null,
  "principal_id": null
}
```

| Field | Required | Notes |
|---|---|---|
| `tenant_id` | yes | Acme pilot tenant: `11111111-1111-1111-1111-111111111111` |
| `text` | yes | What the customer would type |
| `sender_identifier` | no (default `+919999999999`) | Phone in E.164. New phones auto-create a principal. Same phone = same principal across calls = continuous conversation memory. |
| `channel` | no (default `whatsapp`) | `whatsapp` / `telegram` / `internal` |
| `thread_id` | no | Omit to create a new thread; pass to continue an existing one |
| `principal_id` | no | Omit unless you want to override phone-based lookup |

### Response

```json
{
  "outbound_content": {
    "type": "text",
    "text": "We have the Bosch Front Brake Pad Set for the Maruti Swift Dzire in stock. The price is ₹1,200..."
  },
  "reply_text": "We have the Bosch Front Brake Pad Set for the Maruti Swift Dzire in stock...",
  "principal_id": "e2ae8a5d-cb51-47fd-a5d5-67cc9b7d591f",
  "note": "Agent reply is in outbound_content. Full harness journal in MongoDB harness_journal collection."
}
```

`outbound_content.type` may also be `"buttons"`, `"list"`, etc. — depending on what the agent decided. `reply_text` flattens text/body for quick reading.

---

## Test scenarios — what to expect

Run these against `/test/agent`. Reuse the **same `sender_identifier`** across a scenario to keep the conversation threaded.

### Scenario 1 — Catalog hit (real Qdrant + Mongo lookup)

```bash
curl -sS -X POST http://127.0.0.1:8181/test/agent \
  -H 'Content-Type: application/json' \
  -d '{
    "tenant_id": "11111111-1111-1111-1111-111111111111",
    "text": "Do you have Bosch brake pads in stock? What is the price?",
    "sender_identifier": "+919999911111"
  }'
```

**Expect:** reply quotes a real price (₹1,200), real MRP (₹1,450), real stock (14 sets), real product name ("Bosch Front Brake Pad Set"), real vehicle compatibility ("Maruti Swift Dzire"). All from your Mongo catalog.

If it makes up a number → bug. If it says "we don't carry that" → catalog seed missing.

### Scenario 2 — Multi-turn memory

```bash
curl -sS -X POST http://127.0.0.1:8181/test/agent \
  -H 'Content-Type: application/json' \
  -d '{
    "tenant_id": "11111111-1111-1111-1111-111111111111",
    "text": "How much for two sets?",
    "sender_identifier": "+919999911111"
  }'
```

**Expect:** reply remembers it's about Bosch brake pads, does the math (₹2,400), and references "Maruti Swift Dzire" without you saying it again.

If it asks "Two sets of what?" → memory broken. Check `conversations.threads` table.

### Scenario 3 — Off-catalog query

```bash
curl -sS -X POST http://127.0.0.1:8181/test/agent \
  -H 'Content-Type: application/json' \
  -d '{
    "tenant_id": "11111111-1111-1111-1111-111111111111",
    "text": "Do you sell Yamaha R15 chain sprocket?",
    "sender_identifier": "+919999922222"
  }'
```

**Expect:** polite "we don't have that listed" without inventing a price.

If it makes up a price → bug (LLM hallucinating, catalog grounding broken).

### Scenario 4 — Out-of-domain (escalation)

```bash
curl -sS -X POST http://127.0.0.1:8181/test/agent \
  -H 'Content-Type: application/json' \
  -d '{
    "tenant_id": "11111111-1111-1111-1111-111111111111",
    "text": "I want a refund for an order I placed last month, the part was wrong",
    "sender_identifier": "+919999933333"
  }'
```

**Expect:** either (a) reply acknowledges and says a human will follow up, or (b) `outbound_content` is `null` and `note` mentions escalation. Refund is an explicit approval-gated capability per blueprint.

### Scenario 5 — Hindi / Hinglish

```bash
curl -sS -X POST http://127.0.0.1:8181/test/agent \
  -H 'Content-Type: application/json' \
  -d '{
    "tenant_id": "11111111-1111-1111-1111-111111111111",
    "text": "swift ke liye brake pad chahiye, kitne ka hai?",
    "sender_identifier": "+919999944444"
  }'
```

**Expect:** reply in matching register (Hinglish back, or English with Indian English idioms). Real prices.

### Scenario 6 — Latency / cost sanity

Time any of the above:
```bash
time curl -sS -X POST http://127.0.0.1:8181/test/agent \
  -H 'Content-Type: application/json' \
  -d '{
    "tenant_id": "11111111-1111-1111-1111-111111111111",
    "text": "Hi",
    "sender_identifier": "+919999955555"
  }'
```

**Expect:** 2–8 seconds total. If it's hanging > 30s, the harness is stuck — check `/tmp/orch.log` for the iteration count and cost trace.

---

## Verifying deeper (Postgres, MongoDB)

### Postgres — confirm thread + principal landed

```sql
-- Recent conversations (run against Neon)
SELECT id, tenant_id, principal_id, channel, status, message_count, last_message_at
FROM conversations.threads
ORDER BY last_message_at DESC LIMIT 5;

-- Auto-created principals from your tests
SELECT p.id, p.created_at, i.channel, i.identifier
FROM core.principals p
JOIN core.identifiers i ON i.principal_id = p.id
WHERE i.identifier LIKE '+9199999%'
ORDER BY p.created_at DESC;
```

### MongoDB — full agent reasoning trace

Connect to Atlas (use the `MONGO_URL` from `.env`). The DB name is `veda_tenant_<tenant_id with dashes>` for now (per `MONGO_DB_PREFIX=veda_tenant_`).

```js
// Per-turn detailed harness execution
db.harness_journal.find({}).sort({ created_at: -1 }).limit(3).pretty()

// What you see: every site outcome, iteration count, cost in paise,
// LLM tokens, capability calls + their args + results, the final outbound.
// Field of interest: site_outcomes (the 7-site loop), iterations, cost_paise, outcome.

// All inbound + outbound messages
db.messages.find({}).sort({ created_at: -1 }).limit(10).pretty()
// Filter by direction: { direction: "outbound" } or "inbound"
```

A healthy `harness_journal` doc has `iterations: 1-3`, `cost_paise: < 5000`, `outcome: "finalize"`, `termination_code: "model_emitted_final_answer"`.

If `outcome: "fail"` or `termination_code: "max_iterations"` — agent got confused, probably needs blueprint or capability registration tweaks.

---

## Path B — full webhook path (when you want to test signature verification)

This is what AiSensy will hit when you go live. It exercises `apps/edge` → Kafka → orchestrator → MongoDB. **Async** — the HTTP response returns 200 immediately; the agent's reply lands in MongoDB.

### Bring up the full stack

```bash
# Terminal 1 — local infra
cd /home/sanjith/SanjithTS/DevAgent
docker compose up -d redis redpanda

# Terminal 2 — orchestrator (already running from Path A)

# Terminal 3 — edge service
pnpm --filter @veda/edge start
```

### Fire a test message

There's a sign-and-post script ready:

```bash
cd /home/sanjith/SanjithTS/DevAgent
EDGE_URL=http://localhost:8080 \
AISENSY_PROJECT_ID=69d79490b13f900deb907d8e \
AISENSY_WEBHOOK_SECRET=dev-webhook-secret \
FROM=+919999988888 \
pnpm tsx scripts/simulate-aisensy.ts "Do you have Brembo brake pads?"
```

The script computes the HMAC-SHA256 signature in the same way AiSensy does, posts to `/webhooks/aisensy`, and gets a 200. Then watch:

```js
// MongoDB — wait 5-10 seconds, then:
db.harness_journal.find({}).sort({ created_at: -1 }).limit(1).pretty()
db.messages.find({ direction: "outbound" }).sort({ created_at: -1 }).limit(1).pretty()
```

### Postman version of the same request

If you want raw Postman:

- **URL:** `POST http://localhost:8080/webhooks/aisensy`
- **Headers:**
  - `Content-Type: application/json`
  - `X-AiSensy-Signature: <hex hmac of body>` *(skip in dev — adapter bypasses signature check when `NODE_ENV=development` and no header)*
- **Body:** AiSensy's notification shape. Easiest is to copy from `apps/edge/src/channels/aisensy/parser.ts` test fixtures, or just run the simulate script once and grab the body it sends.

In dev, with `NODE_ENV=development`, the AiSensy adapter skips signature verification if no `X-AiSensy-Signature` header is provided — so Postman without a signature works locally.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `404 test API disabled` | `ENABLE_TEST_API` not set | `export ENABLE_TEST_API=true` and restart orchestrator |
| `Internal Server Error` + asyncpg `password authentication failed for user "veda"` | `.env` not sourced | `set -a; source .env; set +a` before launching orch |
| `ForeignKeyViolationError` on `principals` | Manually-passed `principal_id` doesn't exist | Omit `principal_id` from request body — endpoint auto-creates from phone |
| Reply makes up prices | Catalog grounding failed (Qdrant or Mongo unreachable) | Check `QDRANT_URL` + `MONGO_URL` in `.env`; check `harness_journal` for capability call traces |
| Reply hangs > 30s | Harness loop stuck | `tail -f /tmp/orch.log` — look for repeated iterations on same turn |
| `outbound_content: null` and not an escalation | Agent emitted no reply | Check `harness_journal.outcome` and `termination_code` — likely a parser bug or model emitted only `<thinking>` |
| `principal_id` differs across calls with same phone | Redis cache issue | Should still work via Postgres lookup; flush Redis if persistent: `redis-cli FLUSHALL` |

---

## What this proves before you pay AiSensy

- ✅ Agent reasoning works on real LLM (GPT-4o)
- ✅ Catalog grounding works (Qdrant vector search + Mongo product fetch)
- ✅ Multi-turn memory works (conversation threads + recent message context)
- ✅ Multi-language (Hinglish, Hindi)
- ✅ Escalation logic for refund / out-of-domain
- ✅ Cost stays under per-turn budget (₹50 cap, real cost ~₹1-7/turn)
- ✅ Channel-agnostic core (orchestrator never references AiSensy)

What is **NOT** proven by this:
- ❌ Real WhatsApp delivery (needs paid AiSensy or Meta direct)
- ❌ AiSensy webhook payload parsing (Path B with simulate script covers this against synthetic AiSensy shape, but only the real BSP confirms parser handles every variant)
- ❌ Outbound rate limits / 24h-window template gating (these are BSP-side)

When you're satisfied with what Path A shows, the upgrade path is:

1. Pay AiSensy (₹999/mo cheapest tier) → Project API access
2. Open dashboard → Integrations → switch tier to "Project API" → paste project API password
3. ngrok the edge: `ngrok http 8080`
4. Paste ngrok HTTPS URL into AiSensy dashboard → Webhooks → add `/webhooks/aisensy`
5. Subscribe to topics: `message.sender.user`, `message.created`, `message.status.updated`
6. Send a real WhatsApp message to `+919513373327` from your personal number
7. Watch `messages` collection in Mongo for the inbound + outbound pair
