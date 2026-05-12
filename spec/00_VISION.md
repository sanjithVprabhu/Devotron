# 00 — Vision

> "Bring any business to life on WhatsApp through conversation, not configuration."

---

## The Thesis

Conversational interfaces are the next operating system for small and medium businesses. WhatsApp in India already has 535+ million monthly active users; 78% of Indian SMBs use it for business; 95–98% of business messages are opened. The channel has won. What hasn't been built yet is the **business operating system that runs on it**.

Today's tools (AiSensy, Wati, Interakt, Gallabox) are flow-builders. They sell automation infrastructure to businesses that already know what they want and have someone technical enough to configure it. The result: only ~5 million of the 200 million businesses on WhatsApp use the API for serious automation. The rest do it manually, badly, at small scale.

VEDA's wedge: **the business owner doesn't configure anything.** They have a conversation with a meta-agent named **Dev**. Dev interviews them, understands their business, generates a structured **Business Blueprint**, and stands up a per-tenant agent that operates the business end-to-end — from discovery through sale through retention.

This collapses the time-to-live for a business from weeks (current state) to under an hour, and removes the technical-skill barrier that has kept conversational commerce a top-of-market product.

---

## Target Users

### Primary — Indian SMB owner with established operations
- Owns a business with existing customers, inventory, or services
- Already uses WhatsApp informally (manual replies on a personal or business number)
- Frustrated by either (a) not being able to scale beyond personal capacity or (b) paying for tools (Wati/AiSensy) that require a technical setup
- Examples: auto parts dealer, salon owner, B2B distributor, regional restaurant chain, coaching institute owner
- Willingness to pay: ₹2,500–₹20,000/month depending on tier
- Decision-maker: the owner themselves; sale cycle is days, not months

### Primary — Mid-to-large aggregator/platform (enterprise pilot tier)
- Already has tech infrastructure, API, and a customer base
- Wants WhatsApp as an additional surface to engage existing users (not a replacement for their app)
- Examples: jobs platforms (Naukri, Apna, Hirect), edtech (Unacademy), rental marketplaces, ticketing platforms
- Willingness to pay: ₹5–50 lakh/year as enterprise contract
- Decision-maker: VP Product or CTO; sale cycle is 3–9 months

### Secondary — Aspiring founder (consumer-flow side, V2-leaning)
- Wants to start a business but doesn't know exactly what or how
- Uses Dev to ideate, validate, and stand up
- Willingness to pay: low initially; converts via subscription if business takes off
- Important strategically (drives free-tier funnel and Twitter virality), but not the primary monetization target in v1

### Secondary — End consumer (the demand side of Dev's discovery flow)
- Sends Dev a message looking for something specific (a service, a product, a job)
- Doesn't have to register; Dev recommends businesses from its directory
- Not directly monetized; their value is to make Dev useful to businesses

---

## What VEDA Is

- A **conversational meta-agent (Dev)** accessible on WhatsApp and Twitter that onboards business owners and routes consumers to relevant businesses.
- A **multi-tenant runtime** that operates a per-business agent capable of customer interaction, transactions, broadcasts, support, and proactive engagement.
- A **Business Blueprint format** — the central versioned artifact that captures everything about a business and from which all runtime behavior is derived.
- A **dashboard and analytics layer** for business owners to monitor, override, and grow their operation.
- A **proactive intelligence layer (the daemon)** that thinks during downtime — proposing re-engagement, flagging conversation issues, identifying catalog gaps.
- A **future B2B agent-to-agent network** (V2) where one business's agent can transact with another's via a structured protocol.

---

## What VEDA Is *Not* (Non-Goals)

Being explicit about non-goals saves us from scope creep.

- **Not a generic chatbot framework.** We don't compete with Voiceflow, Botpress, or Rasa. We are vertical-aware and opinionated.
- **Not a Customer Data Platform.** We capture the data we need for our agents to be effective, but we are not Segment.
- **Not a CRM.** We integrate with CRMs (Zoho, HubSpot, Salesforce) where they exist, but we are not building one.
- **Not a payment gateway.** We integrate Razorpay; we don't build payment processing.
- **Not a marketing automation platform.** Some overlap exists, but we're not Mailchimp/Klaviyo. Marketing emerges as a side-effect of conversation.
- **Not a website builder.** If a business needs a website, we generate a minimal product catalog page; we don't compete with Wix.
- **Not a generic LLM playground.** Owners don't write prompts. Dev does the configuration through conversation.
- **Not on-premise.** Cloud-only in v1. Enterprise on-prem is a V2+ conversation if a deal demands it.

---

## Why This Wins

### Wedges
1. **Conversational onboarding** — under one hour from "hi" to live business. No competitor does this.
2. **Vertical depth from day one** — we ship with deep auto parts and jobs templates, not generic chatbots.
3. **Voice-note native** — 30–50% of Indian SMB customer messages are voice notes; competitors mostly transcribe-and-pray. We design for voice from message zero.
4. **Owner can manage business via WhatsApp itself** — no need to log into a dashboard for routine ops. The owner texts their own agent to update price or stock.
5. **Pass-through Meta pricing** — no markup on WhatsApp messaging fees (competitors take 15–25%). Trust moat.

### Defensible Moats (built over time)
1. **Two-sided network effect** — Dev becomes more valuable to consumers as businesses join, more valuable to businesses as consumers find them through it.
2. **Vertical-specific intake intelligence** — every onboarding teaches our intake agent more about each vertical. Eventually, our auto parts intake is so good that no competitor can match it without years of data.
3. **Agent-to-agent B2B network (V2)** — once businesses can transact with each other through agents, the platform becomes infrastructure, not a tool.
4. **Daemon-driven proactive intelligence** — the longer a business runs on Dev, the smarter the daemon becomes about that specific business. Switching cost compounds.

---

## Success Criteria

### v1 Launch (Month 4)
- Father's auto parts business live on Dev with end-to-end customer flow (catalog inquiry → quote → order → fulfillment confirmation)
- One jobs-vertical pilot signed (Naukri, Apna, Hirect, or regional consultancy) with at least one production use case
- Dev can onboard a new auto parts business in under 60 minutes via WhatsApp conversation
- Dashboard shows live conversations, blueprint, basic analytics
- Cost per conversation under ₹1.50 average

### v1 Maturity (Month 8)
- 25+ paying SMB customers across auto parts and one adjacent vertical (services or B2B distribution)
- One enterprise contract live (jobs vertical)
- Daemon proposing actions (re-engagement, FAQ updates) with >40% owner acceptance rate
- Dev's onboarding completion rate above 60% (i.e., of users who say "yes I want to set up", 60% reach blueprint v1)
- ₹15–25 lakh ARR

### V2 Direction (Month 12+)
- Agent-to-agent transactions for B2B verticals
- Telegram + Instagram channels live
- Marketing-only Twitter teaser bot in production
- ₹3–5 Cr ARR
- Series A ready

---

## What We're Optimizing For

In order:
1. **Trust** — once trust is broken (a wrong order, a lost customer), it doesn't come back. Bias all decisions toward correctness over speed.
2. **Time-to-live** — for every onboarding flow, the metric is "how fast does the business go from sign-up to first customer conversation." Compress this aggressively.
3. **Cost per conversation** — without cost discipline, the unit economics fail. Every architectural decision considers LLM cost.
4. **Iteration speed** — we will tune prompts daily for the first six months. The stack must support hot prompt updates.
5. **Operational simplicity** — small team, small surface area. No premature scaling, no premature optimization.

---

## What We're Explicitly *Not* Optimizing For

- Maximum theoretical throughput (Meta caps us at ~80 msg/sec/number anyway)
- Number of integrations (depth in 5 integrations beats breadth in 50)
- Feature parity with AiSensy/Wati (they have years of feature creep we don't need)
- International expansion in v1 (India-first, then horizontalize)

---

## Brand Voice (For Dev's Personality)

Dev itself should feel:
- **Capable, not chatty.** Friendly tone, no fake enthusiasm. Brief. Action-oriented.
- **Confident enough to push back.** If a business owner is doing something unwise, Dev says so politely.
- **Adaptive but not chameleon.** Adjusts tone to match user, but never loses its identity.
- **Builder energy.** Talks about businesses being "alive" and "growing", not "automated" and "deployed."

Dev's North Star sentence (could be a tagline): **"Talk to me. Your business goes live by the end of this conversation."**
