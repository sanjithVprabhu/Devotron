# 12 — Vertical: Auto Parts

> Full spec for the auto parts vertical — the first pilot, based on the founder's father's business.

---

## Business Context

**Reference customer:** An established auto parts shop in Bengaluru. 20+ years in business. Stocks OEM and aftermarket parts for Indian passenger cars. Mix of B2C walk-ins and B2B garages/dealers. Currently uses WhatsApp manually for inquiries.

**Key characteristics of this vertical:**
- **SKU density:** 1,000–10,000 items per dealer
- **Vehicle compatibility:** the defining search dimension (make/model/year/variant)
- **Price negotiation:** common, especially for B2B customers
- **Repeat customers:** high — garages order parts regularly
- **Seasonality:** minimal, but festive season drives spares for pre-trip servicing
- **Delivery:** short radius (10km), same-day for in-stock items
- **B2B credit:** garages often operate on 30-day credit terms

---

## Sample Conversations

### Happy Path: B2C Single Purchase

```
Customer: "Brake pads chahiye Swift Dzire 2018 petrol"

Agent: "Got it! Swift Dzire 2018 petrol ke liye 3 options hain:

1. Bosch — ₹1,200 (front) / ₹850 (rear). In stock.
2. Brembo — ₹1,900 (front) / ₹1,400 (rear). In stock.  
3. Roulunds — ₹980 (front) / ₹720 (rear). 1 day delivery.

Konsa chahiye?"
[List message with 3 items]

Customer: [selects Bosch]

Agent: "Bosch — front, rear, ya dono set?"
[Buttons: Front only | Rear only | Full set]

Customer: [selects Full set]

Agent: "Bosch full set (front ₹1,200 + rear ₹850) = ₹2,050
+ GST 18% = ₹369
= Total ₹2,419

Pickup karoge ya delivery? Delivery ₹80 extra, 2-4 hours."
[Buttons: Pickup | Delivery]

Customer: Delivery

Agent: "Address share karo — location pin ya type karke."

Customer: [shares location pin]

Agent: "Address confirmed — within 5km, ₹80 delivery.
Grand total: ₹2,499

Payment method?"
[Buttons: UPI/Online | Cash on Delivery]

Customer: UPI/Online

Agent: "Pay here 👇
[Razorpay link]

Payment aane ke baad order confirm ho jayega."

[Razorpay webhook fires]

Agent: "Payment confirmed ✓
Order #ACM-2847. 2-4 hours mein delivery hogi.
Driver ka number jab dispatch ho tab bhejna.

Kuch aur chahiye?"
```

### B2B Inquiry with Haggling

```
Garage owner: "Ye wale alternate kit lena chahta hoon bulk mein, 10 sets. Price?"

Agent: "10 sets Bosch brake pad sets — Swift Dzire petrol:
₹2,050 × 10 = ₹20,500 + GST

B2B order hai — kya aap registered garage hain with us?"
[Buttons: Yes, registered | New customer]

Garage: Yes

Agent: "Got it. Bulk discount ke baare mein check karta hoon. 
Thoda wait karo — 2 minutes."

[Agent sends approval request to owner via WhatsApp:
"[Name] ने 10 sets Bosch Swift Dzire brake pads के लिए enquiry की है — ₹20,500.
B2B customer है। Discount approve करें?
[5% approve | 10% approve | No discount | Call karo]"]

[Owner approves 5%]

Agent: "Sorted! B2B bulk rate mein 5% off — ₹19,475 + GST.
Credit 30 din chahiye ya advance payment?"
```

---

## Intake Question Tree (Full)

The complete set of questions Veda asks to set up an auto parts business:

1. **Business name** — free text
2. **Address** — free text + optional location pin
3. **Operating hours** — free text (parsed to structured)
4. **OEM / Aftermarket / Both** — buttons
5. **Vehicle brands supported** — list multi-select
6. **B2C / B2B / Both** — buttons
7. **Inventory source** — buttons (Tally / Excel / Manual)
8. **Catalog upload** — document request (optional)
9. **GST registered?** — buttons (Yes / No)
10. **GSTIN** — free text (if yes)
11. **Delivery offered?** — buttons
12. **Delivery radius and fee** — free text (if yes)
13. **Payment methods** — list multi-select
14. **Haggling policy** — buttons (Off / Within limits / Escalate)
15. **Haggling limit %** — number (if bounded)
16. **Languages** — list multi-select
17. **Agent tone** — buttons

Total questions: ~17, typically completed in 20-30 minutes across a WhatsApp conversation.

---

## Catalog Schema (MongoDB)

```javascript
// auto_parts catalog item
{
  _id: ObjectId,
  tenant_id: "uuid",
  item_id: "SKU-4821",
  vertical: "auto_parts",
  status: "active",
  data: {
    name: "Bosch Front Brake Pad Set",
    brand: "Bosch",
    part_type: "brake_pad",
    sub_type: "front",
    oem_numbers: ["55810-84E01", "GDB3397"],
    compatible_vehicles: [
      { make: "Maruti", model: "Swift Dzire", year_from: 2012, year_to: 2017, variant: "all", fuel: "petrol" },
      { make: "Maruti", model: "Swift Dzire", year_from: 2017, year_to: 2023, variant: "all", fuel: "petrol" }
    ],
    price_inr: 1200,
    mrp_inr: 1450,
    gst_rate: 18,
    stock_qty: 14,
    location: "Shelf B-12",
    weight_kg: 0.8,
    warranty_months: 6,
    images: ["blob://tenant_uuid/catalog/sku4821_1.jpg"]
  },
  search_text: "Bosch brake pad Swift Dzire 2012 2013 2014 2015 2016 2017 2018 2019 2020 2021 2022 petrol front brakes",
  embedding_id: "qdrant-point-uuid",
  created_at: ISODate("2025-01-10"),
  updated_at: ISODate("2025-01-15")
}
```

---

## Tally Export Import Process

Most auto parts dealers use Tally. The import process:

1. Owner exports from Tally: `Stock Summary` report → Excel
2. Owner sends the Excel file to Veda via WhatsApp
3. `catalog.bulk_import` capability:
   - Detects Tally export format (column pattern recognition)
   - Maps columns: Item Name → name, Rate → price_inr, Closing Stock → stock_qty
   - Generates search_text from name + infers compatible vehicles using LLM lookup
   - Shows owner a preview: "Found 2,847 items. Top 5 below — do these look right?"
   - Owner confirms → full import
   - Qdrant embedding batch job queued

---

## Specific Integration: Razorpay

```python
# payment.razorpay.create_link capability implementation

import razorpay

async def create_razorpay_link(
    tenant_id: str,
    order_id: str,
    amount_paise: int,
    customer_name: str,
    customer_phone: str,
    description: str
) -> dict:
    client = razorpay.Client(auth=(KEY_ID, KEY_SECRET))
    
    payment_link = client.payment_link.create({
        "amount": amount_paise,
        "currency": "INR",
        "description": description,
        "customer": {
            "name": customer_name,
            "contact": customer_phone
        },
        "notify": { "sms": False, "email": False },  # We handle notification
        "reminder_enable": False,
        "notes": { "order_id": order_id, "tenant_id": tenant_id },
        "callback_url": f"https://api.veda.in/webhooks/razorpay/payment",
        "callback_method": "get"
    })
    
    return { "url": payment_link["short_url"], "razorpay_order_id": payment_link["id"] }
```

---

# 13 — Vertical: Jobs

> Full spec for the jobs aggregator vertical — the enterprise pilot targeting platforms like Naukri, Apna, Hirect.

---

## Business Context

**Reference customer:** A jobs aggregator platform with an existing ATS (Applicant Tracking System), candidate database, and employer accounts. They want to add WhatsApp as a conversational interface for candidates.

**Key characteristics of this vertical:**
- **Two-sided marketplace:** candidates (job seekers) AND employers (recruiters)
- **Existing database:** millions of candidates and job listings — not starting from zero
- **Integration-first:** the catalog IS the ATS. No separate catalog upload.
- **Match quality is king:** a bad job recommendation destroys trust instantly
- **Privacy sensitivity:** salary data, career history — handle carefully
- **Compliance:** POSH, data protection, candidate consent
- **White-labeled:** the business agent speaks as the platform brand, not as "VEDA"

---

## The Two Sides

This vertical has two distinct user types interacting with the same business agent:

### Candidate Flow
Candidates use the agent to:
- Search for jobs matching their profile
- Apply to jobs
- Check application status
- Get interview alerts and scheduling
- Update their profile
- Ask general platform questions

### Recruiter/Employer Flow
Employers use the agent to:
- Review incoming applications
- Schedule interviews
- Send updates to candidates
- Query candidate pipeline status

In v1, **candidate flow is the priority.** Recruiter flow is V2.

---

## Sample Candidate Conversation

```
[Candidate receives WhatsApp notification from platform:]
"Hi Kavya! Get jobs on WhatsApp — tap to opt in."
[Opt In]

Kavya: [taps, opens WhatsApp to platform's number]
"Hi"

Agent: "Hi Kavya! Welcome to [Platform] on WhatsApp.
I have your profile — marketing exec in Pune, ₹14L CTC, 
3 years experience. Looking for senior roles?

What would you like?
[Find jobs | Check applications | Update profile | Help]"

Kavya: Find jobs

Agent: "Your top matches today:

1. Senior Marketing Manager — Razorpay, Bangalore
   ₹22-28L · Hybrid · 87% match
   
2. Marketing Lead — Cred, Mumbai  
   ₹25-32L · On-site · 84% match
   
3. Growth Marketing Head — Groww, Bangalore
   ₹28-35L · Hybrid · 79% match

Tap to see details or apply."
[List: 1 | 2 | 3 | See more | Refine search]

Kavya: [selects 1]

Agent: "Razorpay — Senior Marketing Manager

📍 Bangalore (Hybrid, 3 days/week)
💰 ₹22-28L CTC
⏰ 5+ years experience needed
🎯 Your match: 87%

Role: Lead brand and growth marketing across Razorpay's SMB segment...
[summary, not full JD]

[Apply now | Save for later | See similar | Skip]"

Kavya: Apply now

Agent: "Applying to Razorpay with your current profile.
Any note to add for the recruiter? (optional)"

Kavya: "Looking for hybrid roles only in Bangalore"

Agent: "Application submitted ✓
Reference: APP-2024-8847

Razorpay's team typically responds in 3-5 days.
I'll ping you when they do.

Want to apply to more jobs or come back later?"
```

---

## Integration Architecture (Jobs ATS)

The jobs vertical is **integration-first** — the catalog IS the ATS.

### Integration Types

**Type A: Direct API (for large aggregators like Naukri)**
```python
# integration.ats.search_jobs implementation for Naukri-style API

async def search_jobs_naukri(
    tenant_id: str,
    candidate_profile: CandidateProfile,
    filters: JobSearchFilters
) -> List[Job]:
    naukri_api = get_ats_client(tenant_id, "naukri_api")
    
    response = await naukri_api.post("/jobs/recommend", {
        "candidate_id": candidate_profile.external_id,
        "location": filters.location,
        "salary_min": filters.salary_min,
        "salary_max": filters.salary_max,
        "experience": filters.experience,
        "skills": filters.skills,
        "limit": 10
    })
    
    return [map_naukri_job_to_canonical(j) for j in response.jobs]
```

**Type B: API Sandbox (for smaller platforms)**
The platform pastes their API endpoint → system auto-detects it returns job listings → maps to canonical Job schema → business agent can search.

### Candidate Profile Loading

When a candidate messages the business agent, their profile is loaded from the ATS:

```python
async def load_candidate_context(
    tenant_id: str,
    principal_id: str
) -> CandidateProfile | None:
    # Check if this principal has a linked ATS candidate ID
    link = await get_ats_principal_link(tenant_id, principal_id)
    if not link:
        return None  # new candidate, not in system
    
    # Fetch fresh profile from ATS
    return await integration_hub.call(
        tenant_id=tenant_id,
        integration="ats",
        action="get_candidate_profile",
        params={"candidate_id": link.ats_candidate_id}
    )
```

### Canonical Job Schema

```typescript
interface Job {
  job_id: string;           // ATS-native ID
  title: string;
  company: string;
  company_logo_url?: string;
  location: string;
  is_remote: boolean;
  work_mode: "remote" | "hybrid" | "on-site";
  ctc_min: number;          // in lakhs/annum
  ctc_max: number;
  experience_min: number;   // years
  experience_max: number;
  skills_required: string[];
  jd_summary: string;       // LLM-generated 3-sentence summary of full JD
  posted_at: string;
  expires_at?: string;
  apply_url?: string;
  match_score?: number;     // 0-1, provided by ATS recommendation engine
}
```

---

## Opt-In Flow

Candidates must opt in to WhatsApp. The platform manages this:

1. Platform sends opt-in CTA in their app/email: "Get jobs on WhatsApp?"
2. Candidate taps → pre-filled WhatsApp message to platform's number
3. Agent creates `ats_principal_link`: `{ principal_id, ats_candidate_id }`
4. Candidate is now "WhatsApp-enabled" in the platform's system

---

## Compliance Notes

- **DPDP consent:** collected at opt-in, stored per-candidate
- **Salary data:** never shared with other candidates, never logged in plain text
- **Aadhaar/PAN:** if needed for background checks, collected via secure document upload, not stored on VEDA — passed through to ATS
- **Right to withdraw:** candidate can message "stop" to unsubscribe from WhatsApp
- **Audit log:** every application submission, profile access, and interview scheduling is logged for the platform's compliance team

---

## Onboarding Flow (Enterprise-Level)

Unlike SMB onboarding (30 minutes via WhatsApp), jobs aggregator onboarding is a multi-week technical project:

**Week 1:** Contract, DPA signing, compliance review
**Week 2:** Technical workshop — API integration, Blueprint co-creation in dashboard
**Week 3:** Internal pilot — 100 candidates whitelisted, opt-in flow built
**Week 4:** Iterate, tune, fix edge cases
**Week 5+:** Phased rollout — 1K, 10K, all candidates
