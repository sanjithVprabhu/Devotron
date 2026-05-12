# 02 — Personas and Journeys

> Concrete personas with named representatives, and end-to-end journeys for each. Use these as reference whenever you're designing a flow, writing a prompt, or making a UX decision.

---

## Personas

### Persona 1 — Rajesh, the SMB Owner (Auto Parts)
**Age:** 47. **Location:** Bengaluru. **Business:** Sells automotive spare parts (OEM and aftermarket), 20 years in the trade. **Tech comfort:** Uses WhatsApp daily, occasionally sends Excel files via email, can use Google Maps. Doesn't know what an "API" is.

**Current state:**
- Family-run shop, 4 employees including 2 sons
- 3,000+ SKUs tracked partly in Tally, partly in a paper register
- 60% B2C walk-ins, 40% B2B (small garages and resellers)
- Already gets 30–50 WhatsApp inquiries per day on his personal number, manually replies between customers
- Has lost orders because he was busy with a walk-in when a WhatsApp message came in
- Recently a friend mentioned "WhatsApp business automation" — he's curious but suspicious of "tech"

**What he wants:**
- "Don't lose customers"
- Quick replies to common questions (price, availability, shop hours)
- Order taking when he's not at the counter
- Notifying regular customers when new stock arrives

**What he doesn't want:**
- Anything that requires logging into a website
- Anything that "sounds like a robot" — his customers are loyal because of the personal touch
- A tool that costs more than his monthly Tally subscription

**How he discovers VEDA:**
A WhatsApp forward from his son (Prajwal): *"Dad, message this number, it'll set up your shop on WhatsApp properly."*

---

### Persona 2 — Priya, the Aggregator Product Lead (Jobs)
**Age:** 34. **Location:** Gurgaon. **Role:** Senior Product Manager at a jobs aggregator (Naukri-class). **Tech comfort:** High. Knows APIs, has run product integrations with vendors before.

**Current state:**
- Platform has 8M registered candidates, 200K active employers
- 40% of candidates open the mobile app weekly; engagement drops significantly outside that
- Email open rates have collapsed to 12%
- Leadership wants WhatsApp as a "second surface" — but the in-house team can't prioritize it for 12 months
- Has heard of Wati/AiSensy but they don't handle the aggregator use case (they're built for SMBs sending broadcasts)

**What she wants:**
- A WhatsApp surface where candidates can search jobs, apply, get interview alerts, update profile
- White-labeled (uses their brand and number)
- Tight integration with their existing ATS and recommendation engine
- Per-conversation cost predictability for procurement
- Compliance docs (DPDP, audit log, data residency)

**What she doesn't want:**
- A vendor that's going to cannibalize their app engagement
- Black-box AI that produces unpredictable responses to candidates
- A long onboarding that needs her engineering team for 6 months

**How she discovers VEDA:**
Warm intro from Prajwal (founder) via mutual contact. First meeting is a demo of a working candidate-search flow built on test data.

---

### Persona 3 — Anu, the Aspiring Founder (V2-leaning, but interacts with Dev in v1)
**Age:** 28. **Location:** Hyderabad. **Background:** Software engineer who wants to start a side business. Saw a Twitter thread about Dev.

**What she wants:**
- Help thinking through "should I start an X business"
- Guidance on what's needed
- Maybe a chance to "see" what her business would look like running

**What she doesn't want:**
- A salesy upsell into a paid tier before she's even decided on her idea
- A toy demo that doesn't reflect what the real product can do

**How she discovers VEDA:**
Tags `@projectdev_bot` on Twitter after seeing someone else's thread.

**Note:** Anu is *important strategically* (she's the funnel for organic growth and the validator that the abstract framing works) but she's not the v1 monetization target. Treat her well, give her a great experience, but don't build the product around her.

---

### Persona 4 — Ramesh, the End Customer (Auto Parts)
**Age:** 38. **Location:** Bengaluru. **Profile:** Owns a Maruti Swift Dzire 2018. Brake pads need replacing.

**Current behavior:**
- Searches Google → finds OEM part numbers
- WhatsApps 3 different shops in his area for prices
- Picks based on price + delivery time + how quickly they reply
- Doesn't want to repeat his car details over and over

**Journey through VEDA** is in the next section.

---

### Persona 5 — Kavya, the Job Candidate
**Age:** 24. **Location:** Pune. **Profile:** Mid-level marketing exec, looking to switch jobs.

**Current behavior:**
- Updated profile on the jobs platform 3 months ago
- Opens the app once a week; ignores email alerts
- Replies fast on WhatsApp because it's already open all day
- Wants to know about *relevant* jobs without browsing

---

## End-to-End Journeys

### Journey A — Rajesh Onboards His Auto Parts Shop

**Channel:** WhatsApp. **Time investment:** ~45 minutes spread over a day.

```
T+0min   Rajesh opens WhatsApp, taps the link in his son's forward
         Lands in chat with Dev's number. Sends "Hi"

T+0:30   Dev: "Hi! I'm Dev. I help business owners run their entire
         business on WhatsApp. Are you looking to set up a business,
         or are you trying to find one?"

T+1min   Rajesh: "set up"

T+1:30   Dev: "Great. Quick question first — would you prefer Hindi
         or English? I can do both."

T+2min   Rajesh: "Hindi mein theek hai"  [Hindi is fine]

         [Dev switches to Hindi for all subsequent messages]

T+2:30   Dev: "Theek hai. Let me ask a few quick questions to set
         this up. First — naya business hai ya already chal raha hai?"
         [New business or already running?]

T+3min   Rajesh: "20 saal se chala raha hoon"  [Running for 20 years]

T+4min   Dev: "Achha! 20 years is a lot. Kya aap automotive parts,
         clothing, food, electronics, ya kuch aur bechte hain?"
         [What do you sell?]

T+4:30   Rajesh: "auto parts"

T+5min   Dev: "Got it. Auto parts ke liye main aapse kuch aur
         questions poochunga — fir aapka WhatsApp business setup
         ho jayega. Theek hai?"
         [I'll ask a few more questions for auto parts then set up
         your WhatsApp business]

         [Branches into the auto parts intake question tree —
          covered in detail in 12_VERTICAL_AUTO_PARTS.md.
          High-level questions Dev asks:]

         - Aapki shop ka naam? [Shop name]
         - Address aur shop hours?
         - OEM, aftermarket, ya dono? [OEM, aftermarket, or both]
         - Konsi car brands cover karte ho? [Which car brands]
         - B2C only ya B2B bhi? [Retail only or wholesale too]
         - Inventory kahan track karte hain — Tally, Excel,
           ya kahin nahi? [Where is inventory tracked]
         - Payment options — UPI, cash, card, credit?
         - Delivery karte hain ya pickup only?
         - Customer ko price quote dene se pehle approval chahiye
           ya agent khud quote kar sakta hai? [Need approval before
           quoting price or can agent quote directly?]
         - Discount/haggling — agent ko permission deni hai
           kya? [Should agent negotiate?]

T+15min  Dev: "Aapka Tally export kar sakte hain? Excel file send
         kar do — main saare products import kar dunga."

T+20min  Rajesh sends an Excel export of his Tally inventory

         [Dev parses the Excel, identifies it as a Tally export,
          extracts SKU/description/price/stock columns,
          shows a preview]

T+22min  Dev: "Maine 2,847 products dekh liye. Yeh top 5 hain —
         confirm karo ki yeh sahi hain?"
         [Shows 5 sample products with details]

T+23min  Rajesh: "haan sahi hai"  [Yes correct]

T+24min  Dev: "Perfect. Ab ek aur cheez. Aapka apna WhatsApp
         business number hai already? Ya naya banayein?"
         [Do you have a WhatsApp Business number? Or shall we
          create new?]

T+25min  Rajesh: "abhi personal number use karta hoon"
         [I use personal number now]

T+26min  Dev: "Achha. Phir do options hain — woh same number ko
         business mein convert karein, ya naya number lein. Naya
         number lene se aapka personal alag rahega."
         [Two options — convert same number or get new. New keeps
          personal separate]

T+27min  Rajesh: "naya number lo"  [Get new]

T+28min  Dev guides Rajesh through:
         - Choosing a phone number (he can use a SIM he already has)
         - Setting up Meta Business Manager (Dev pre-fills what it can,
           asks Rajesh for proofs: GST, business address, ID)
         - Submitting WhatsApp Business API application

         [This is a multi-step async process. Dev tells Rajesh:
          "Verification mein 1–3 din lagenge. Main aapko update
          dunga. Tab tak aap try kar sakte ho — yeh number par
          message bhejke dekho ki agent kaisa kaam karta hai."]

T+45min  Rajesh receives a sandbox/test number where he can
         experience his agent talking to him as if he were a customer.

T+1day   Dev sends Rajesh: "Verification ho gaya! Aapka
         WhatsApp business number active hai: +91-XXXXXXXXXX.
         Customers ab is number par message kar sakte hain. Pehla
         broadcast bhejna chahte ho? Main draft kar deta hoon."
         [Verification done! Want to send first broadcast?]
```

**Key moments:**
- The persona inference happens in turns 1–4 (Hindi preference, conversational tone)
- The vertical detection happens at turn ~5 (auto parts) and triggers loading the auto parts intake tree
- Catalog ingestion happens via Excel — Dev does NOT make Rajesh enter products one by one
- Meta verification is conversational but honest about the async nature
- Rajesh is given a sandbox to test before going live — trust-building moment

---

### Journey B — Ramesh Buys Brake Pads (Auto Parts End Customer)

**Channel:** WhatsApp. Ramesh is messaging the live business agent for Rajesh's shop.

```
T+0      Ramesh: "Brake pads chahiye Swift Dzire 2018 ke liye"
         [Need brake pads for Swift Dzire 2018]

T+5sec   Acme Auto Parts (Rajesh's agent): "Namaste! Swift Dzire
         2018 — petrol ya diesel?"
         [Petrol or diesel?]

T+30sec  Ramesh: "petrol"

T+35sec  Agent: "OK. Aapko OEM (original Maruti) chahiye ya
         aftermarket bhi chalega? OEM thoda mehnga hota hai,
         aftermarket sasta but quality vary karti hai."
         [OEM or aftermarket — OEM costlier, aftermarket cheaper
          but quality varies]

T+1min   Ramesh: "aftermarket bhej"  [Send aftermarket options]

T+1:05   Agent searches catalog, returns:
         "3 options hain Swift Dzire 2018 petrol ke liye:

         1. Bosch — Rs 850 (Rear), Rs 1,200 (Front). Stock mein hai.
         2. Brembo — Rs 1,400 (Rear), Rs 1,900 (Front). Stock mein hai.
         3. Roulunds — Rs 720 (Rear), Rs 980 (Front). 1 din mein aayega.

         Konsa?"

T+2min   Ramesh: "Bosch front + rear set"

T+2:05   Agent: "Bosch front (Rs 1,200) + rear (Rs 850) = Rs 2,050.
         GST extra 18% = Rs 369. Total Rs 2,419.

         Pickup karoge ya delivery? Delivery Rs 80 extra hai
         within 5km."

T+3min   Ramesh: "delivery. address: [shares address via WhatsApp
         location pin + text]"

T+3:30   Agent: "Got it — aapke address tak delivery 5km within
         hai, Rs 80. Total Rs 2,499.

         Payment kaise karoge — UPI ya COD?"

T+4min   Ramesh: "UPI"

T+4:05   Agent: "Yeh UPI link hai — pay karke confirm kar do.
         [Razorpay link]
         Payment ke baad order confirm ho jayega aur 2 ghante
         mein delivery."

T+5min   Ramesh pays. Agent receives webhook from Razorpay.

T+5:10   Agent: "Payment confirmed ✓ Order #ACM-2019. Delivery
         2 ghante mein. Driver ka number SMS karunga jab
         dispatch hoga.

         Aap Rajesh ji ko personally jaante ho ya pehli baar
         order kar rahe ho?"
         [Do you know Rajesh personally or first order?]

T+5:30   Ramesh: "pehli baar"  [First time]

T+5:35   Agent: "Welcome to Acme Auto Parts! Aapka phone number
         save kar liya. Next time Swift Dzire ya kuch aur car ke
         liye parts chahiye, just ping karo. Aapko regular
         customer banane ke liye 5% discount next order pe."
         [Welcomes him as new customer, mentions 5% next order
          discount]

T+6min   Ramesh: "thanks"

         [Conversation ends. Order moves into fulfillment.
          Rajesh sees the order in his dashboard and on his
          team's shared inbox — one of his sons handles
          dispatch.]
```

**Key moments:**
- Ramesh did NOT have to repeat his car details — agent extracted "Swift Dzire 2018" from first message
- Agent followed up to disambiguate (petrol/diesel) only where needed
- Agent quoted prices directly because Rajesh's blueprint allows it (no approval needed under ₹5,000)
- Agent handled commerce end-to-end — catalog → quote → order → payment → confirmation
- Agent captured Ramesh as a new customer for retention follow-ups (Daemon will use this later)
- Conversation log surfaces in Rajesh's dashboard

---

### Journey C — Priya Onboards Her Jobs Aggregator (Enterprise)

**Channel:** Mostly off-WhatsApp (sales meetings, technical workshops), but the actual onboarding has WhatsApp components.

```
Day 0    Initial sales call. Demo of a working pilot built on test data.
         Decision-makers: Priya (Product), her CTO, head of legal.

Days 1-30   Procurement + DPA + DPDP compliance review.
            VEDA provides:
            - DPA template
            - Data flow diagram
            - Audit log specification
            - On-prem option discussion (deferred to V2)
            - SOC 2 path (in progress)

Day 30   Contract signed. ₹X lakh annual + per-conversation pricing.

Days 30-45  Technical workshop: integrate with their ATS API.
            VEDA's integration team works with their backend
            team to:
            - Set up dedicated WhatsApp number under their brand
            - Build read/write capabilities for: candidate profile,
              job search, application status, interview scheduling
            - Define escalation rules (e.g., complex employer
              negotiations → human recruiter)
            - Configure their brand voice for the agent persona
            - White-label dashboard for their recruiter team

Day 45   Internal pilot — 100 candidates whitelisted, opt-in flow
         via existing app.

Days 45-60  Iterate based on feedback. Retune agent prompts.
            Tune escalation thresholds.

Day 60   Soft launch to 10,000 candidates.

Day 90   Public launch. Conversational job search live for all
         candidates who opt in.
```

**Key contrast with SMB journey:** Enterprise onboarding is human-heavy, multi-month, involves their tech team. The Blueprint is still the artifact at the heart of it — but it's filled out collaboratively in Excel/JSON form, not via WhatsApp conversation. (Dev *can* be used by Priya for some setup, but she'd typically prefer the dashboard.)

---

### Journey D — Kavya Searches for Jobs (End Candidate, Enterprise Customer)

**Channel:** WhatsApp. Kavya's first WhatsApp interaction with the aggregator.

```
T+0      Kavya gets push notification in the aggregator app:
         "We've moved to WhatsApp! Get jobs delivered to chat.
          Tap to opt in."

         [Tap → opens WhatsApp pre-filled with "Hi" to the
          aggregator's number]

T+0:30   Kavya: "Hi"

T+5sec   Aggregator agent: "Hi Kavya! Welcome to [Brand] on
         WhatsApp. I have your profile — marketing exec in Pune,
         ₹14L CTC, looking for senior roles. Want me to show
         current openings, or update preferences first?"

T+1min   Kavya: "show jobs"

T+1:05   Agent: "Top 5 marketing roles for you:

         1. Senior Marketing Manager — Razorpay, Bangalore
            ₹22L–₹28L • Hybrid • Posted 2 days ago
         2. Marketing Lead — Cred, Bangalore
            ₹25L–₹32L • On-site • Posted 1 week ago
         3. ...

         Tap a number to see details, or tell me to refine."

T+2min   Kavya: "1"

T+2:05   Agent: "Senior Marketing Manager, Razorpay:

         [Job description summary]

         Match score: 87% based on your profile.
         To apply: tap below."

         [List message: Apply | Save for later | Show similar |
          Skip]

T+3min   Kavya: Apply

T+3:05   Agent: "Done! Application submitted. Razorpay's recruiter
         usually responds in 3-5 days. I'll ping you when they do.

         Want to see roles 2-5 too, or come back later?"

T+5min   [Kavya browses 2-3 more, applies to 1]

         [Two days later, Razorpay views her profile —
          Agent proactively sends:
          "Razorpay viewed your profile! Strong signal. Want me
           to tell their recruiter you're available this week
           for a call?"]
```

**Key moments:**
- Kavya didn't have to introduce herself — agent loaded her profile from the aggregator's database
- All actions (apply, save, skip) used WhatsApp's interactive list/button messages — deterministic where it matters
- Free-text was used for search refinement, where inference adds value
- Agent proactively notified her of profile views — this is a *capability* of the aggregator agent, configured in their Blueprint

---

### Journey E — Anu Tries the Twitter Bot (Aspiring Founder)

**Channel:** Twitter (public). Then graduates to WhatsApp.

```
T+0      Anu tweets:
         "@projectdev_bot I'm thinking of starting a baking
          business in Hyderabad. Help?"

T+30sec  Dev (in thread, public):
         "Love it. Few quick Qs to make this useful:
          — Home kitchen or commercial space?
          — Cakes, cookies, breads, or all?
          — Direct-to-consumer or also B2B (cafes, hotels)?

          Reply here or DM me. I'll spin up a 24-hour demo of
          your business so you can see it live."

T+5min   Anu replies in thread:
         "Home kitchen for now. Custom cakes and cookies.
          D2C only."

T+5:30   Dev: "Got it. Spinning up a demo. DM me your phone
         number to get the full WhatsApp experience, or I can
         show you a sample order conversation here in this
         thread."

T+6min   Anu DMs her phone number.

T+8min   Dev (via WhatsApp to Anu's number):
         "Hi! Your demo bakery is live. I'm playing the role of
          a customer. Try it — I'll order a cake and you can see
          how your business would handle it.

          [Dev sends a 3-message demo simulating a customer
           ordering a cake, going through the full flow]

          What you just saw was a demo. You have 24 hours of
          free access to play with this. Want to make it real?
          Tap here to subscribe and we'll convert this demo into
          your actual business."

T+24hr   Anu's demo expires. If she signs up, the demo blueprint
         is upgraded to a real Business; if not, the data is
         deleted.
```

**Key moments:**
- Twitter is intentionally low-friction — public conversation, low commitment
- The bait is "see your business live in 24 hours"
- Conversion path is clear — DM → WhatsApp → subscribe
- 24-hour demo expiry creates urgency without being pushy
- The demo is **a real working agent on a real Blueprint**, not a fake — anyone trying it gets the actual product experience, just sandboxed

---

## Cross-Persona Patterns

A few patterns emerge across all journeys:

1. **First message is always low-friction.** No forms, no logins. "Hi" is enough.
2. **Inference + verification.** Agents infer where they can (language, intent, context) and verify when stakes are high (price, transaction, identity).
3. **Honest async.** When something takes time (Meta verification, recruiter response), say so explicitly. Don't pretend it's instant.
4. **Owner is always recognizable.** When Rajesh messages his own agent, it knows him by phone number and gives him admin context, not customer flow.
5. **Critical decisions surface to humans.** Bounded haggling, high-value transactions, ambiguous cases. The agent doesn't make irreversible decisions alone.
6. **Cross-channel continuity.** Dev's memory follows users across channels (Twitter → WhatsApp).
