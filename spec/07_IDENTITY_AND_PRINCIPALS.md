# 07 — Identity and Principals

> How VEDA knows who it's talking to across channels, sessions, and businesses.

---

## The Principal Model

Every entity that can initiate or receive an action in VEDA is a **Principal**. Principals are abstract identities — not tied to any one channel.

```
Principal (abstract identity)
  └── has many Identifiers (how channels find it)
        ├── WhatsApp: +91-9876543210
        ├── Twitter: @anu_founder
        └── Email: anu@example.com
  └── has many Memberships (role within a Business)
        ├── BusinessOwner of Acme Auto Parts
        └── BusinessTeamMember of Acme Auto Parts (operator role)
```

A Principal can be:
- An **EndUser** (customer/lead interacting with a Business Agent or Veda)
- A **BusinessOwner** (created and owns a Business)
- A **BusinessTeamMember** (part of a business's team)
- A **BusinessAgent** (the AI agent itself — needed for A2A protocol in V2)

One human can hold multiple roles across multiple businesses (e.g., own one business and be an operator in another).

---

## Identifier Resolution

When a message arrives on any channel, the edge layer resolves the sender's channel-specific identifier to a Principal:

```
WhatsApp message from +91-9876543210
  → cache check: global:principal:whatsapp:+91-9876543210
  → cache hit → return principal_id
  → cache miss → query core.identifiers WHERE channel='whatsapp' AND identifier='+91-9876543210'
    → found → cache + return principal_id
    → not found → create new Principal + Identifier → cache + return
```

New principals are always created as `EndUser` role until they claim a business or are invited to one.

### Identifier Normalization

| Channel | Format | Example |
|---|---|---|
| WhatsApp | E.164 | `+919876543210` |
| Twitter | lowercase handle (no @) | `anu_founder` |
| Email | lowercase | `anu@example.com` |
| Internal | UUID (for agents/services) | `agent_acme_f47ac10b` |

---

## Cross-Channel Identity (CCI)

A user might first interact on Twitter, then continue on WhatsApp. Without linking, they appear as two different Principals. The CCI mechanism stitches them together.

### Linking Flow

```
1. Anu tweets at @veda_bot: "I want to start a bakery business"

2. Veda's Twitter bot creates a Principal for @anu_founder (if not existing)
   Generates a one-time linking code: "VEDA-7X4K"
   Stores in Redis: global:linking:VEDA-7X4K → { principal_id, expires_at: +15min }

3. Veda (on Twitter) says:
   "DM me your phone, or send 'VEDA-7X4K' from your WhatsApp to +91-XXXXXXXXXX
    to continue with the full experience."

4. Anu sends "VEDA-7X4K" on WhatsApp from +91-9876543210

5. Edge layer sees the linking code pattern:
   → Fetches Redis key global:linking:VEDA-7X4K → { principal_id: twitter_principal }
   → Resolves WhatsApp +91-9876543210 → finds/creates a WA principal
   → Merges: copies WhatsApp identifier to the Twitter principal record
   → Deletes the WA-only principal if it was just created and has no history
   → Marks linking code as used
   → All future messages from +91-9876543210 now resolve to the same principal as @anu_founder

6. Anu's full Twitter conversation context is available to Veda in the WhatsApp session
```

### CCI Security Considerations

- Linking codes expire in 15 minutes (Redis TTL)
- One-time use only (deleted after successful link)
- Linking code is random 8-char alphanumeric — brute force infeasible in 15 minutes
- After linking, Veda sends a confirmation to both channels: "Your Twitter and WhatsApp are now connected"
- Users can unlink via dashboard or by messaging Veda

---

## Owner Recognition

When a Business Owner messages their own Business Agent (not Veda), the agent recognizes them by phone number and enters admin mode automatically.

```python
async def resolve_conversation_context(
    tenant_id: str,
    sender_principal_id: str
) -> ConversationContext:
    # Check if sender is the owner or a team member of this tenant
    membership = await get_membership(tenant_id, sender_principal_id)
    
    if membership and membership.role == "owner":
        return ConversationContext(mode="admin", role="owner", permissions=ALL_PERMISSIONS)
    elif membership:
        return ConversationContext(
            mode="admin",
            role=membership.role,
            permissions=membership.permissions
        )
    else:
        return ConversationContext(mode="customer", role="end_user", permissions=[])
```

When `mode="admin"`:
- The agent greets differently: "Hi [name], you're in as the owner. What do you need?"
- The agent can accept blueprint mutation commands: "Add a new product: Bosch alternator, ₹3,500"
- The agent surfaces business stats if asked: "How many orders today?"
- Normal customer flows are disabled

---

## Team Roles and Permissions

### Role Hierarchy

```
owner
  └── Can do everything
  └── Can grant any role
  └── Cannot be removed by anyone else

admin
  └── All operator permissions
  └── Can manage team (except owner)
  └── Can edit blueprint
  └── Cannot access billing

operator
  └── View + manage conversations (take over from agent)
  └── View orders
  └── Update catalog items (not add/delete)
  └── Cannot change team or blueprint

viewer
  └── View conversations (read-only)
  └── View orders (read-only)
  └── View analytics
  └── Cannot do anything mutative
```

### Permission Strings

```typescript
type Permission =
  // Blueprint
  | "blueprint.read"
  | "blueprint.mutate"
  // Conversations
  | "conversation.read"
  | "conversation.takeover"
  | "conversation.assign"
  // Orders
  | "order.read"
  | "order.update"
  | "order.refund"
  // Catalog
  | "catalog.read"
  | "catalog.add"
  | "catalog.update"
  | "catalog.delete"
  // Team
  | "team.invite"
  | "team.remove"
  | "team.role_change"
  // Billing
  | "billing.read"
  | "billing.manage"
  // Daemon
  | "daemon.proposals.read"
  | "daemon.proposals.approve"
  // Analytics
  | "analytics.read";

const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  owner: ["*"],  // all
  admin: [
    "blueprint.read", "blueprint.mutate",
    "conversation.read", "conversation.takeover", "conversation.assign",
    "order.read", "order.update", "order.refund",
    "catalog.read", "catalog.add", "catalog.update", "catalog.delete",
    "team.invite", "team.remove", "team.role_change",
    "daemon.proposals.read", "daemon.proposals.approve",
    "analytics.read"
  ],
  operator: [
    "blueprint.read",
    "conversation.read", "conversation.takeover",
    "order.read", "order.update",
    "catalog.read", "catalog.update",
    "daemon.proposals.read",
    "analytics.read"
  ],
  viewer: [
    "blueprint.read",
    "conversation.read",
    "order.read",
    "catalog.read",
    "analytics.read"
  ]
};
```

### Permission Request Flow

An operator who needs additional access can request it from the owner via WhatsApp:

```
Operator: "Veda, I need to be able to approve discounts"

Veda (to operator): "I'll ask [Owner Name] to grant you this access."

Veda (to owner via WhatsApp): "[Operator Name] is requesting 'order.refund' permission.
Approve? [Yes / No / Ask me later]"

Owner: [taps Yes]

Veda: "Done. [Operator Name] can now approve refunds. I'll keep an eye on usage."
```

The agent monitors operator actions within their permission scope and flags anomalies to the owner:

```
Veda (to owner): "FYI — [Name] has been issuing refunds at a higher rate than usual 
(12 this week vs typical 2-3). Nothing alarming, but wanted you to know. 
Review refunds? [Yes / Ignore]"
```

---

## Team Onboarding Flow

```
1. Owner says to their Business Agent or to Dashboard:
   "Add my son Karthik to the team as an operator — his number is +91-9988776655"

2. team-service creates a TeamInvite record
   Sends WhatsApp message to +91-9988776655 via Veda:
   "Hi! [Owner Name] has invited you to join the Acme Auto Parts team on VEDA
    as an Operator. Tap below to accept."
   [Accept / Decline]

3. Karthik taps Accept

4. Identity resolution: +91-9988776655 → Principal
   Creates TenantMembership with role=operator

5. Confirmation sent to both owner and Karthik:
   "Karthik has joined Acme Auto Parts as an Operator.
    He can view and take over conversations, update orders, and edit catalog items."

6. Karthik can now message the business agent and enter admin mode
```

---

## Veda's Own Identity

Veda (the meta-agent) has a Principal of its own in the system:

```json
{
  "id": "00000000-0000-0000-0000-000000000001",
  "display_name": "Veda",
  "identifiers": [
    { "channel": "whatsapp", "identifier": "+91-XXXXXXXXXX", "verified": true },
    { "channel": "twitter", "identifier": "veda_bot", "verified": true },
    { "channel": "internal", "identifier": "veda_system", "verified": true }
  ]
}
```

This is the `tenant_id = NULL` / `agent_type = 'veda'` case in the conversation schema. Veda is not a tenant — it's the platform itself.

---

## Privacy and Data Minimization

Per DPDP Act requirements:

- **Purpose limitation:** we collect identifiers only for the purpose of routing messages and remembering context
- **Minimization:** we store phone numbers, not names, unless explicitly provided or needed
- **Right to access:** principals can request all their data via Veda: "What do you know about me?"
- **Right to erasure:** principals can delete their data via Veda: "Delete my account and all data." This triggers:
  1. Anonymize `core.identifiers` rows (replace identifier with hashed value)
  2. Anonymize MongoDB message docs (replace PII with `[DELETED]`)
  3. Remove Qdrant vectors for this principal
  4. Retain anonymized order records for GST/financial compliance
  5. Emit `PrincipalDeleted` audit event

- **Consent for marketing:** `marketing_opt_in` captured per tenant per principal. Broadcast capability checks this before sending.
