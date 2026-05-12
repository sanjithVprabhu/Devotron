# 08 — Channel Layer

> All channel-specific code lives here and nowhere else. Everything above this layer speaks in canonical messages.

---

## The Canonical Message Format

All channels translate to and from this format:

```typescript
interface CanonicalMessage {
  message_id: string;          // channel-native ID (deduplicate on this)
  direction: "inbound" | "outbound";
  channel: "whatsapp" | "twitter";
  tenant_id?: string;          // null for messages to Veda itself
  thread_id?: string;          // resolved after Principal lookup
  sender_identifier: string;   // channel-specific: phone (WA), handle (Twitter)
  recipient_identifier: string;
  timestamp: string;           // ISO8601

  content: CanonicalContent;

  // Populated on outbound
  delivery?: {
    status: "sent" | "delivered" | "read" | "failed";
    error?: string;
    sent_at?: string;
    delivered_at?: string;
    read_at?: string;
  };

  // Raw payload preserved for debugging
  raw_payload: object;
}

type CanonicalContent =
  | TextContent
  | VoiceContent
  | ImageContent
  | DocumentContent
  | LocationContent
  | InteractiveContent
  | TemplateContent;

interface TextContent {
  type: "text";
  text: string;
}

interface VoiceContent {
  type: "voice";
  media_url: string;           // Azure Blob URL after download
  duration_seconds?: number;
  transcription?: string;      // populated by media.transcribe capability
  transcription_language?: string;
}

interface ImageContent {
  type: "image";
  media_url: string;
  caption?: string;
  analysis?: string;           // populated by media.image_analyze capability
}

interface DocumentContent {
  type: "document";
  media_url: string;
  filename?: string;
  mime_type?: string;
}

interface LocationContent {
  type: "location";
  lat: number;
  lng: number;
  name?: string;
  address?: string;
}

interface InteractiveContent {
  type: "button_reply" | "list_reply";
  selected_id: string;
  selected_title: string;
  context_message_id?: string; // which message this is replying to
}

// For outbound: a pre-composed interactive message
interface OutboundInteractiveContent {
  type: "buttons" | "list";
  body_text: string;
  header_text?: string;
  footer_text?: string;
  buttons?: Array<{ id: string; title: string }>;  // max 3 for buttons
  list_sections?: Array<{                           // for list type
    title: string;
    items: Array<{ id: string; title: string; description?: string }>;
  }>;
  button_text?: string;  // list CTA button text
}

interface TemplateContent {
  type: "template";
  template_name: string;
  language: string;
  components: Array<{
    type: "header" | "body" | "button";
    parameters: Array<{ type: "text" | "image" | "document"; value: string }>;
  }>;
}
```

---

## WhatsApp Channel Adapter

### Inbound (Meta → VEDA)

Meta delivers webhooks to `POST /webhooks/whatsapp`. The adapter:

1. **Verifies webhook signature** (X-Hub-Signature-256 using app secret)
2. **Responds 200 immediately** (Meta will retry if we don't respond in 20s)
3. **Deduplicates** by message ID (Redis idempotency key, 24h TTL)
4. **Downloads media** if present (Meta URLs expire in 24h) → uploads to Azure Blob → replaces URL
5. **Resolves tenant** by recipient phone number ID
6. **Resolves/creates Principal** for sender phone number
7. **Translates to CanonicalMessage**
8. **Publishes to `veda.messages.inbound`**

```typescript
// Simplified adapter logic
async function handleWhatsAppWebhook(payload: MetaWebhookPayload): Promise<void> {
  for (const entry of payload.entry) {
    for (const change of entry.changes) {
      if (change.field !== "messages") continue;

      const value = change.value;
      for (const message of value.messages ?? []) {
        // Idempotency
        const key = `global:idempotency:whatsapp:${message.id}`;
        if (await redis.exists(key)) continue;
        await redis.setex(key, 86400, "processed");

        // Resolve tenant from phone_number_id
        const tenant = await resolveTenantByPhoneNumberId(value.metadata.phone_number_id);

        // Download + re-upload media
        const content = await translateContent(message);

        // Resolve or create Principal
        const principal = await resolveOrCreatePrincipal("whatsapp", message.from);

        // Publish
        await kafka.publish("veda.messages.inbound", {
          tenant_id: tenant?.id ?? null,
          channel: "whatsapp",
          sender_identifier: message.from,
          recipient_identifier: value.metadata.display_phone_number,
          content,
          raw_payload: message,
          // ...
        });
      }

      // Handle status updates (delivered, read)
      for (const status of value.statuses ?? []) {
        await handleDeliveryStatus(status);
      }
    }
  }
}
```

### Outbound (VEDA → Meta)

The `edge-sender` consumes `veda.messages.outbound` and:

1. **Checks 24-hour window** (Redis key for this contact pair)
   - Window open: can send any message type
   - Window closed: must use approved template
2. **If template required:** looks up template name from `veda.messages.outbound.template_name`
3. **Calls Meta Cloud API** (`POST /v18.0/{phone-number-id}/messages`)
4. **Updates delivery status** in Redis + emits status event

```typescript
async function sendWhatsAppMessage(msg: OutboundMessage): Promise<void> {
  const windowKey = `tenant:${msg.tenant_id}:window:${msg.phone_number_id}:${msg.recipient}`;
  const windowOpen = await redis.exists(windowKey);

  if (!windowOpen && msg.content.type !== "template") {
    // Must use template — pick best fit or reject
    throw new WindowExpiredError("24h window expired, use template");
  }

  const apiPayload = translateOutboundToMeta(msg, windowOpen);
  const response = await metaApi.sendMessage(msg.phone_number_id, apiPayload);

  // Update window (reset on successful send; technically window is set by inbound)
  // Track message ID for delivery status correlation
  await trackSentMessage(response.messages[0].id, msg);
}
```

### Message Type Support Matrix

| Type | Inbound | Outbound | Notes |
|---|---|---|---|
| Text | ✅ | ✅ | Core |
| Voice note | ✅ | ✅ (rare) | Inbound transcribed by capability |
| Image | ✅ | ✅ | Product photos, ID uploads |
| Document | ✅ | ✅ | Excel uploads, invoices |
| Location | ✅ | ✅ | Delivery address, store location |
| Buttons (interactive) | ✅ | ✅ | Deterministic choices — max 3 |
| List (interactive) | ✅ | ✅ | Product options, job listings |
| Template | N/A | ✅ | Outbound outside 24h window |
| Sticker | ✅ (ignore) | ❌ | Received but not acted on |
| Reaction | ✅ (log) | ❌ | Logged to analytics |
| Contact | ✅ (log) | ❌ | Logged, not acted on |
| Catalog (native) | ✅ | ✅ | V2 — WhatsApp native product catalog |

### When to Use Which Message Type

This is a core UX principle that the agent layer must follow:

```
DETERMINISTIC ANSWER NEEDED → Buttons (≤3 options) or List (4-10 options)
  Examples: "OEM or aftermarket?", "Pay by UPI or COD?", "Apply / Save / Skip"

FREE TEXT INTERPRETATION NEEDED → Plain text message
  Examples: "Describe what you're looking for", "What car model do you drive?"

MULTIPLE SELECT → List with multi-select (where supported)
  Examples: "Which languages should your agent speak?"

RICH DISPLAY → Template with header image + body text
  Examples: "New stock arrived — here's what's in"

URGENT / OUT-OF-WINDOW OUTBOUND → Template only (required by Meta)
  Examples: Order confirmation, appointment reminder, interview scheduled
```

---

## Twitter Channel Adapter

### Scope in v1

Twitter is Dev-only in v1 — no Business Agent runtime on Twitter. The adapter handles:
- Incoming @mentions to `@veda_bot`
- Incoming DMs to `@veda_bot`
- Outbound replies and DMs from `@veda_bot`

### Rate Limits (Twitter API v2 — critical to understand)

| API | Free Tier | Basic ($200/mo) | Note |
|---|---|---|---|
| Post tweet | 1,500/mo | 100/day | |
| Mention lookup | None | 500k/mo | |
| DMs write | 500/day | 500/day | Per user |
| DMs read | Very limited | 15k/mo | |

**Implication:** Twitter v1 is limited to ~20-50 meaningful interactions/day at Basic tier. This is a constraint on the Twitter demo volume. Plan accordingly.

### Inbound (Twitter → VEDA)

Twitter delivers webhooks (Account Activity API) or we poll mention timeline:

```typescript
async function handleTwitterMention(tweet: Tweet): Promise<void> {
  // Idempotency
  const key = `global:idempotency:twitter:${tweet.id}`;
  if (await redis.exists(key)) return;
  await redis.setex(key, 86400, "processed");

  // Twitter mentions of @veda_bot are always routed to Veda (no business agents on Twitter)
  const principal = await resolveOrCreatePrincipal("twitter", tweet.author_id);

  // Translate to canonical
  const content: TextContent = {
    type: "text",
    text: stripMentions(tweet.text) // remove @veda_bot from text
  };

  await kafka.publish("veda.messages.inbound", {
    tenant_id: null,  // Veda, not a business
    channel: "twitter",
    sender_identifier: tweet.author_id,
    recipient_identifier: "veda_bot",
    content,
    raw_payload: tweet,
    // thread context from conversation_id
  });
}
```

### Outbound (VEDA → Twitter)

```typescript
async function sendTwitterReply(msg: OutboundMessage): Promise<void> {
  if (msg.target_type === "mention_reply") {
    await twitterApi.v2.reply(msg.text, msg.context_tweet_id);
  } else if (msg.target_type === "dm") {
    await twitterApi.v2.sendDmToParticipant(msg.dm_conversation_id, { text: msg.text });
  }
}
```

### Twitter-Specific Constraints

- **Character limit:** 280 chars per tweet. Agent must be briefer on Twitter than WhatsApp.
- **Public replies:** Are visible to everyone. Avoid sharing personal details.
- **DM preference:** Sensitive conversations (phone number, business details) always pushed to DM or to WhatsApp.
- **Conversation threading:** Track `conversation_id` to maintain context across a thread.
- **Rate limit backpressure:** If approaching rate limits, queue outbound and space across time.

---

## Channel Adapter Interface (TypeScript)

All channel adapters implement this interface:

```typescript
interface ChannelAdapter {
  // Translate incoming channel payload to CanonicalMessage
  inbound(payload: unknown): Promise<CanonicalMessage | null>;

  // Send a canonical outbound message
  outbound(msg: OutboundMessage): Promise<{ channel_message_id: string }>;

  // Check if we can send a free-form message (vs template-only)
  canSendFreeform(
    tenant_id: string,
    recipient: string,
    phone_number_id?: string
  ): Promise<boolean>;

  // Verify webhook signature
  verifySignature(payload: Buffer, signature: string): boolean;
}
```

Concrete implementations:
- `src/channels/whatsapp/WhatsAppAdapter.ts`
- `src/channels/twitter/TwitterAdapter.ts`
- `src/channels/telegram/TelegramAdapter.ts` (V2 stub)
- `src/channels/instagram/InstagramAdapter.ts` (V2 stub)

---

## Media Handling Pipeline

Voice notes and images require processing before the agent can act on them.

### Voice Note Pipeline (mandatory in v1)

```
1. Inbound voice note arrives
2. WhatsApp adapter downloads from Meta CDN (URL expires in 24h)
3. Uploads to Azure Blob Storage (tenant/{tenant_id}/media/{message_id}.ogg)
4. Publishes CanonicalMessage with type="voice", media_url=blob_url, transcription=null
5. Agent orchestrator invokes media.transcribe capability
6. media.transcribe calls Azure Cognitive Services Speech-to-Text
   (Hindi + Kannada + Telugu + Tamil + English support)
7. Transcription stored in message.content.transcription
8. Agent proceeds with transcription as text input
```

Cost: Azure STT is ~₹0.80 per minute of audio. Most voice notes are 10-30 seconds → ~₹0.13-0.40 per note. Include in per-conversation cost model.

### Image Pipeline

```
1. Inbound image arrives (product photo, ID proof, catalog image)
2. WhatsApp adapter downloads + uploads to Blob
3. Publishes with type="image", media_url=blob_url, analysis=null
4. Agent invokes media.image_analyze if needed
5. Claude Vision analyzes image and returns structured analysis
   (product identification, text extraction from ID, price tag reading)
6. Analysis stored in message.content.analysis
```

---

## Adding a New Channel (V2 Process)

When adding Telegram, Instagram, etc.:

1. Create `src/channels/{channel}/{Channel}Adapter.ts` implementing `ChannelAdapter`
2. Register in `src/channels/registry.ts`
3. Add identifier type to `core.identifiers.channel` check constraint
4. Add webhook endpoint in `src/routes/webhooks.ts`
5. Add channel to `CanonicalMessage.channel` union type
6. Test with unit tests against channel-specific payload fixtures
7. No other service changes required — everything above reads canonical messages

This is the payoff of the channel adapter pattern: adding Telegram is a one-file addition, not a system change.
