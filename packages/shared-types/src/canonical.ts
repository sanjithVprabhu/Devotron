import { z } from 'zod';
import { ChannelSchema } from './identity.js';

// ── Canonical content variants ───────────────────────────────────────────

export const TextContentSchema = z.object({
  type: z.literal('text'),
  text: z.string().min(1).max(4096),
});

export const VoiceContentSchema = z.object({
  type: z.literal('voice'),
  media_url: z.string().url(),
  duration_seconds: z.number().int().nonnegative().optional(),
  transcription: z.string().nullable().optional(),
  transcription_language: z.string().optional(),
});

export const ImageContentSchema = z.object({
  type: z.literal('image'),
  media_url: z.string().url(),
  caption: z.string().optional(),
  analysis: z.string().nullable().optional(),
});

export const DocumentContentSchema = z.object({
  type: z.literal('document'),
  media_url: z.string().url(),
  filename: z.string().optional(),
  mime_type: z.string().optional(),
});

export const LocationContentSchema = z.object({
  type: z.literal('location'),
  lat: z.number(),
  lng: z.number(),
  name: z.string().optional(),
  address: z.string().optional(),
});

export const InteractiveReplyContentSchema = z.object({
  type: z.enum(['button_reply', 'list_reply']),
  selected_id: z.string(),
  selected_title: z.string(),
  context_message_id: z.string().optional(),
});

export const TemplateContentSchema = z.object({
  type: z.literal('template'),
  template_name: z.string(),
  language: z.string(),
  components: z.array(
    z.object({
      type: z.enum(['header', 'body', 'button']),
      parameters: z.array(
        z.object({
          type: z.enum(['text', 'image', 'document', 'currency', 'date_time']),
          value: z.string(),
        }),
      ),
    }),
  ),
});

export const OutboundButtonsContentSchema = z.object({
  type: z.literal('buttons'),
  body_text: z.string().min(1),
  header_text: z.string().optional(),
  footer_text: z.string().optional(),
  buttons: z.array(z.object({ id: z.string(), title: z.string().max(20) })).min(1).max(3),
});

export const OutboundListContentSchema = z.object({
  type: z.literal('list'),
  body_text: z.string().min(1),
  header_text: z.string().optional(),
  footer_text: z.string().optional(),
  button_text: z.string().max(20).default('Choose'),
  list_sections: z.array(
    z.object({
      title: z.string(),
      items: z
        .array(
          z.object({
            id: z.string(),
            title: z.string().max(24),
            description: z.string().max(72).optional(),
          }),
        )
        .min(1)
        .max(10),
    }),
  ),
});

export const CanonicalContentSchema = z.discriminatedUnion('type', [
  TextContentSchema,
  VoiceContentSchema,
  ImageContentSchema,
  DocumentContentSchema,
  LocationContentSchema,
  InteractiveReplyContentSchema,
  TemplateContentSchema,
  OutboundButtonsContentSchema,
  OutboundListContentSchema,
]);
export type CanonicalContent = z.infer<typeof CanonicalContentSchema>;

// ── Canonical message ────────────────────────────────────────────────────

export const DeliveryStatusSchema = z.enum(['queued', 'sent', 'delivered', 'read', 'failed']);
export type DeliveryStatus = z.infer<typeof DeliveryStatusSchema>;

export const CanonicalMessageSchema = z.object({
  message_id: z.string().min(1),
  direction: z.enum(['inbound', 'outbound']),
  channel: ChannelSchema,
  tenant_id: z.string().uuid().nullable(),
  thread_id: z.string().uuid().nullable(),
  sender_principal_id: z.string().uuid().nullable(),
  sender_identifier: z.string(),
  recipient_identifier: z.string(),
  timestamp: z.string().datetime(),
  content: CanonicalContentSchema,
  delivery: z
    .object({
      status: DeliveryStatusSchema,
      error: z.string().optional(),
      sent_at: z.string().datetime().optional(),
      delivered_at: z.string().datetime().optional(),
      read_at: z.string().datetime().optional(),
    })
    .optional(),
  raw_payload: z.unknown().optional(),
});
export type CanonicalMessage = z.infer<typeof CanonicalMessageSchema>;

// ── Outbound message envelope (what the orchestrator publishes) ─────────

export const OutboundMessageSchema = z.object({
  event_id: z.string().uuid(),
  occurred_at: z.string().datetime(),
  tenant_id: z.string().uuid().nullable(),
  thread_id: z.string().uuid().nullable(),
  target_channel: ChannelSchema,
  target_identifier: z.string(),
  source_phone_number_id: z.string().optional(),
  content: CanonicalContentSchema,
  template_name: z.string().optional(),
  template_variables: z.record(z.string()).optional(),
  requires_window_check: z.boolean().default(true),
  priority: z.enum(['low', 'normal', 'high']).default('normal'),
  trace_context: z.record(z.string()).optional(),
});
export type OutboundMessage = z.infer<typeof OutboundMessageSchema>;
