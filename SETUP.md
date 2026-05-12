# VEDA — Local Setup & Test Guide

How to start everything from cold and test the agent through a real chat UI in the dashboard.

## TL;DR — happy path

```bash
# 1. Start orchestrator (Python — runs the agent)
cd /home/sanjith/SanjithTS/DevAgent/apps/orchestrator
set -a && source ../../.env && set +a
export ENABLE_TEST_API=true
export PYTHONPATH=/home/sanjith/SanjithTS/DevAgent/packages/python-shared:/home/sanjith/SanjithTS/DevAgent/packages/llm-router:/home/sanjith/SanjithTS/DevAgent/capabilities/broadcast:/home/sanjith/SanjithTS/DevAgent/capabilities/catalog:/home/sanjith/SanjithTS/DevAgent/capabilities/integration:/home/sanjith/SanjithTS/DevAgent/capabilities/media:/home/sanjith/SanjithTS/DevAgent/capabilities/payment:/home/sanjith/SanjithTS/DevAgent/capabilities/recommendations:/home/sanjith/SanjithTS/DevAgent/capabilities/scheduling:/home/sanjith/SanjithTS/DevAgent/capabilities/support:/home/sanjith/SanjithTS/DevAgent/apps/orchestrator
python3 -m uvicorn orchestrator.main:app --host 127.0.0.1 --port 8181

# 2. In a new terminal: start dashboard (Next.js)
cd /home/sanjith/SanjithTS/DevAgent
pnpm --filter dashboard dev

# 3. Open http://localhost:3001 → enter rajesh@acme.local → grab OTP from
#    the dashboard terminal log → paste → land in dashboard

# 4. Click "Test chat" in the sidebar → talk to the agent
```

## Pre-requisites (one-time)

- **Node** 20+, **pnpm** installed (`corepack enable` if not)
- **Python** 3.11+ (`python3 --version` must be ≥ 3.11)
- **`.env`** file at repo root with `POSTGRES_URL`, `MONGO_URL`, `QDRANT_URL`, `QDRANT_API_KEY`, `OPENAI_API_KEY`, `TENANT_SECRET_KEY_B64`. The repo's `.env` already has these from earlier setup.

## Required services & their state

| What | Where | Status |
|---|---|---|
| Postgres | Neon (cloud) | ✅ already provisioned, pooled |
| MongoDB | Atlas DevelUp cluster (cloud) | ✅ already provisioned |
| Qdrant | Cloud eu-central (cloud) | ✅ already provisioned |
| Orchestrator | local :8181 | start in step 1 above |
| Dashboard | local :3001 | start in step 2 above |
| Edge | local :8080 | only needed for **real** WhatsApp / AiSensy webhook testing |
| Redis | local Docker | only needed for the edge / Kafka path (not for /test/agent) |

For the **dashboard test-chat path**, you don't need Redis, Kafka, or the edge service. Orchestrator + dashboard + cloud DBs is enough.

## Step-by-step start

### 1. Start the orchestrator

The orchestrator runs the agent harness (Python + FastAPI on port 8181). Open a terminal:

```bash
cd /home/sanjith/SanjithTS/DevAgent/apps/orchestrator
set -a && source ../../.env && set +a
export ENABLE_TEST_API=true
export PYTHONPATH=/home/sanjith/SanjithTS/DevAgent/packages/python-shared:/home/sanjith/SanjithTS/DevAgent/packages/llm-router:/home/sanjith/SanjithTS/DevAgent/capabilities/broadcast:/home/sanjith/SanjithTS/DevAgent/capabilities/catalog:/home/sanjith/SanjithTS/DevAgent/capabilities/integration:/home/sanjith/SanjithTS/DevAgent/capabilities/media:/home/sanjith/SanjithTS/DevAgent/capabilities/payment:/home/sanjith/SanjithTS/DevAgent/capabilities/recommendations:/home/sanjith/SanjithTS/DevAgent/capabilities/scheduling:/home/sanjith/SanjithTS/DevAgent/capabilities/support:/home/sanjith/SanjithTS/DevAgent/apps/orchestrator
python3 -m uvicorn orchestrator.main:app --host 127.0.0.1 --port 8181
```

**Healthcheck (separate terminal):**
```bash
curl http://127.0.0.1:8181/healthz   # → {"status":"ok"}
```

If you see `password authentication failed for user "veda"` → `.env` didn't get sourced. Re-run `set -a && source ../../.env && set +a` and retry.

### 2. Start the dashboard

In a new terminal:

```bash
cd /home/sanjith/SanjithTS/DevAgent
pnpm --filter dashboard dev
```

Wait for `✓ Ready in 2-3s`. The dashboard runs on **http://localhost:3001**.

### 3. Log in

1. Open **http://localhost:3001** in a browser
2. Enter email: **`rajesh@acme.local`** (the seeded owner)
3. Click "Send code"
4. **Watch the dashboard's terminal output** — the OTP code prints to the console:
   ```
   ┌──────────────────────────────────────────────────────┐
   │ VEDA login OTP                                        │
   │ email: rajesh@acme.local                              │
   │ code:  123456                                         │
   │ valid for 10 minutes                                  │
   └──────────────────────────────────────────────────────┘
   ```
5. Paste the 6-digit code → land in the dashboard

### 4. Test chat — talk to the agent

In the sidebar, click **Test chat** (top of nav under Overview).

**What you'll see:**
- A chat UI like WhatsApp web
- A "Customer phone" input at the top — defaults to a random `+91...` number
- An empty conversation area

**Try:**
- "Do you have Bosch brake pads?"
- "How much for two sets?" (same conversation — memory carries)
- "Do you have something for Maruti Swift Dzire?"
- "I'd like to order one Brembo set"
- "Hi" (just a greeting)
- "swift ke liye brake pad" (Hinglish)

Each customer phone = one persistent conversation. Click "New conversation" (top right) to start fresh with a new phone.

**Customer messages → right side, dark.** **Agent replies → left side, gray.**

### 5. Verify deeper (optional)

Open another terminal:

```bash
# Catalog page
http://localhost:3001/catalog

# Conversations log (lists threads)
http://localhost:3001/conversations

# Blueprint editor (raw JSON of the Acme blueprint)
http://localhost:3001/blueprint
```

For the harness reasoning trace:

```bash
# Watch orchestrator logs in real-time
tail -f /tmp/orch.log
```

Look for `harness.turn_complete` lines — they show iterations, cost in paise, elapsed_ms per turn.

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `/api/test-chat 502` | Orchestrator not running on :8181 | Start it (step 1) |
| `/api/test-chat 401` | Not logged in / cookie expired | Re-login |
| `404 test API disabled` | Orch started without `ENABLE_TEST_API=true` | Re-export and restart |
| Dashboard says "no business yet" | Email isn't tied to a tenant membership | Use `rajesh@acme.local` (seeded). To add a new email to the tenant, run a SQL insert on `core.tenant_memberships`. Self-serve onboarding is the next deliverable. |
| OTP says "invalid_or_expired_code" | Code already used or expired | Request a new one |
| Login 500 with `ECONNREFUSED 127.0.0.1:8083` | Old code calling identity-service | Already fixed — `git pull` and reload |
| Reply hangs > 30s | Harness loop stuck | `tail -f /tmp/orch.log` — look for repeated iterations on same `turn_id` |

## What works through the test-chat UI

- ✅ Real catalog grounding (Qdrant + MongoDB)
- ✅ Multi-turn memory (same phone = same conversation)
- ✅ Multi-language (English / Hinglish / Hindi)
- ✅ Real GPT-4o reasoning + the 7-site harness loop
- ✅ Catalog formatter renders products / services / bookings / digital / jobs / generic per-vertical (the agent might choose freeform text instead of structured buttons depending on the question — that's fine)
- ✅ Persists messages to MongoDB `messages` + harness traces to `harness_journal`

## What is **not** wired to test-chat (yet)

- ❌ Talking to **Veda** (the meta-agent that interviews business owners) — currently auto-parts-only, being replaced with an LLM-driven generic interview next
- ❌ Self-serve "Create Business" — only the seeded Acme tenant exists; new business creation = run `seed.ts` or wait for the next deliverable
- ❌ Real WhatsApp delivery — needs paid AiSensy + ngrok + dashboard integrations setup

## When you're ready to go live on real WhatsApp

See [TESTING.md](TESTING.md) → "Path B — full webhook path." Requires:
- Upgrading AiSensy to a paid plan (Project API access for free-form messages)
- Running the edge service (`pnpm --filter @veda/edge start`)
- Running ngrok (`ngrok http 8080`)
- Pasting webhook URL into AiSensy dashboard
