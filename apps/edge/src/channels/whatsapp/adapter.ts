// WhatsApp Cloud API adapter. Source of truth for webhook → canonical translation
// and canonical → outbound API call. No code outside this directory talks to Meta.

import { createHmac, timingSafeEqual } from 'node:crypto';
import { request } from 'undici';
import {
  type CanonicalContent,
  type CanonicalMessage,
  type OutboundMessage,
} from '@veda/shared-types/canonical';
import { config } from '../../config.js';
import { logger } from '../../logger.js';
import { isIdempotentlyNew, tenantKey } from '../../redis.js';
import { resolvePrincipal, resolveTenantByPhoneNumberId } from '../../identity/resolver.js';
import type { ChannelAdapter } from '../types.js';
import { downloadAndStoreMedia } from './media.js';

interface MetaIncomingMessage {
  id: string;
  from: string;
  timestamp: string;
  type:
    | 'text'
    | 'image'
    | 'audio'
    | 'voice'
    | 'video'
    | 'document'
    | 'location'
    | 'interactive'
    | 'button'
    | 'reaction'
    | 'sticker'
    | 'contacts';
  text?: { body: string };
  image?: { id: string; mime_type: string; caption?: string };
  audio?: { id: string; mime_type: string; voice?: boolean };
  voice?: { id: string; mime_type: string };
  document?: { id: string; mime_type: string; filename?: string };
  location?: { latitude: number; longitude: number; name?: string; address?: string };
  interactive?: {
    type: 'button_reply' | 'list_reply';
    button_reply?: { id: string; title: string };
    list_reply?: { id: string; title: string; description?: string };
  };
  context?: { id: string };
}

interface MetaWebhookPayload {
  object: string;
  entry: Array<{
    id: string;
    changes: Array<{
      field: 'messages' | string;
      value: {
        messaging_product: 'whatsapp';
        metadata: { display_phone_number: string; phone_number_id: string };
        messages?: MetaIncomingMessage[];
        statuses?: Array<{
          id: string;
          status: 'sent' | 'delivered' | 'read' | 'failed';
          timestamp: string;
          recipient_id: string;
        }>;
      };
    }>;
  }>;
}

export class WhatsAppAdapter implements ChannelAdapter {
  readonly channel = 'whatsapp' as const;

  verifySignature(rawBody: Buffer, signature: string | undefined): boolean {
    if (!config.META_APP_SECRET) {
      logger.warn('META_APP_SECRET not set; signature check skipped (DEV ONLY)');
      return config.NODE_ENV === 'development';
    }
    if (!signature || !signature.startsWith('sha256=')) return false;
    const expected = createHmac('sha256', config.META_APP_SECRET).update(rawBody).digest('hex');
    const got = signature.slice('sha256='.length);
    if (got.length !== expected.length) return false;
    try {
      return timingSafeEqual(Buffer.from(got), Buffer.from(expected));
    } catch {
      return false;
    }
  }

  async inbound(payload: unknown): Promise<CanonicalMessage[]> {
    const body = payload as MetaWebhookPayload;
    if (!body || body.object !== 'whatsapp_business_account') return [];

    const out: CanonicalMessage[] = [];

    for (const entry of body.entry ?? []) {
      for (const change of entry.changes ?? []) {
        if (change.field !== 'messages') continue;
        const phoneNumberId = change.value.metadata.phone_number_id;
        const recipient = change.value.metadata.display_phone_number;
        const tenant = await resolveTenantByPhoneNumberId(phoneNumberId);

        for (const m of change.value.messages ?? []) {
          // Idempotency
          const idemKey = `global:idempotency:whatsapp:${m.id}`;
          const fresh = await isIdempotentlyNew(idemKey);
          if (!fresh) continue;

          const principal = await resolvePrincipal('whatsapp', m.from);
          const content = await this.translateInboundContent(m, tenant?.tenant_id);
          if (!content) continue;

          out.push({
            message_id: m.id,
            direction: 'inbound',
            channel: 'whatsapp',
            tenant_id: tenant?.tenant_id ?? null,
            thread_id: null, // resolved by orchestrator
            sender_principal_id: principal.principal_id,
            sender_identifier: m.from,
            recipient_identifier: recipient,
            timestamp: new Date(Number(m.timestamp) * 1000).toISOString(),
            content,
            raw_payload: m,
          });
        }

        // Persist 24-hour window opened/refreshed when an inbound arrives.
        for (const m of change.value.messages ?? []) {
          if (!tenant) continue;
          const key = tenantKey(tenant.tenant_id, 'window', phoneNumberId, m.from);
          // 24h sliding window — store TTL = 86400s, reset on each inbound.
          await import('../../redis.js').then(({ getRedis }) =>
            getRedis().set(key, '1', 'EX', 86_400),
          );
        }

        // Status updates → emit delivery transitions (placeholder; consumers TBD)
        for (const s of change.value.statuses ?? []) {
          logger.debug({ message_id: s.id, status: s.status }, 'whatsapp.status');
        }
      }
    }
    return out;
  }

  async canSendFreeform(msg: OutboundMessage): Promise<boolean> {
    if (!msg.requires_window_check) return true;
    if (!msg.tenant_id || !msg.source_phone_number_id) return false;
    const { getRedis } = await import('../../redis.js');
    const key = tenantKey(msg.tenant_id, 'window', msg.source_phone_number_id, msg.target_identifier);
    const exists = await getRedis().exists(key);
    return exists === 1;
  }

  async outbound(msg: OutboundMessage): Promise<{ channel_message_id: string }> {
    if (!msg.source_phone_number_id) {
      throw new Error('source_phone_number_id required for WhatsApp outbound');
    }
    const token = config.META_SYSTEM_USER_TOKEN;
    if (!token) throw new Error('META_SYSTEM_USER_TOKEN required to send WhatsApp messages');

    const url = `https://graph.facebook.com/${config.META_GRAPH_VERSION}/${msg.source_phone_number_id}/messages`;
    const apiPayload = this.translateOutbound(msg);
    const res = await request(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(apiPayload),
    });
    if (res.statusCode >= 400) {
      const text = await res.body.text();
      throw new Error(`whatsapp.send.failed status=${res.statusCode} body=${text}`);
    }
    const body = (await res.body.json()) as { messages: Array<{ id: string }> };
    return { channel_message_id: body.messages[0]?.id ?? 'unknown' };
  }

  private async translateInboundContent(
    m: MetaIncomingMessage,
    tenantId: string | undefined,
  ): Promise<CanonicalContent | null> {
    switch (m.type) {
      case 'text':
        if (!m.text) return null;
        return { type: 'text', text: m.text.body };

      case 'voice':
      case 'audio': {
        const media = m.voice ?? m.audio;
        if (!media) return null;
        const url = await downloadAndStoreMedia(media.id, media.mime_type, tenantId);
        return { type: 'voice', media_url: url };
      }

      case 'image': {
        if (!m.image) return null;
        const url = await downloadAndStoreMedia(m.image.id, m.image.mime_type, tenantId);
        return { type: 'image', media_url: url, caption: m.image.caption };
      }

      case 'document': {
        if (!m.document) return null;
        const url = await downloadAndStoreMedia(m.document.id, m.document.mime_type, tenantId);
        return {
          type: 'document',
          media_url: url,
          filename: m.document.filename,
          mime_type: m.document.mime_type,
        };
      }

      case 'location':
        if (!m.location) return null;
        return {
          type: 'location',
          lat: m.location.latitude,
          lng: m.location.longitude,
          name: m.location.name,
          address: m.location.address,
        };

      case 'interactive':
        if (m.interactive?.type === 'button_reply' && m.interactive.button_reply) {
          return {
            type: 'button_reply',
            selected_id: m.interactive.button_reply.id,
            selected_title: m.interactive.button_reply.title,
            context_message_id: m.context?.id,
          };
        }
        if (m.interactive?.type === 'list_reply' && m.interactive.list_reply) {
          return {
            type: 'list_reply',
            selected_id: m.interactive.list_reply.id,
            selected_title: m.interactive.list_reply.title,
            context_message_id: m.context?.id,
          };
        }
        return null;

      case 'button':
      case 'reaction':
      case 'sticker':
      case 'contacts':
        // logged at inbound() above; not actionable
        return null;

      default:
        logger.warn({ type: m.type }, 'whatsapp.unknown_message_type');
        return null;
    }
  }

  private translateOutbound(msg: OutboundMessage): Record<string, unknown> {
    const base = { messaging_product: 'whatsapp', recipient_type: 'individual', to: msg.target_identifier };
    const c = msg.content;
    switch (c.type) {
      case 'text':
        return { ...base, type: 'text', text: { body: c.text } };
      case 'buttons':
        return {
          ...base,
          type: 'interactive',
          interactive: {
            type: 'button',
            body: { text: c.body_text },
            ...(c.header_text ? { header: { type: 'text', text: c.header_text } } : {}),
            ...(c.footer_text ? { footer: { text: c.footer_text } } : {}),
            action: {
              buttons: c.buttons.map((b) => ({ type: 'reply', reply: { id: b.id, title: b.title } })),
            },
          },
        };
      case 'list':
        return {
          ...base,
          type: 'interactive',
          interactive: {
            type: 'list',
            body: { text: c.body_text },
            ...(c.header_text ? { header: { type: 'text', text: c.header_text } } : {}),
            ...(c.footer_text ? { footer: { text: c.footer_text } } : {}),
            action: {
              button: c.button_text,
              sections: c.list_sections.map((s) => ({
                title: s.title,
                rows: s.items.map((it) => ({ id: it.id, title: it.title, description: it.description })),
              })),
            },
          },
        };
      case 'image':
        return { ...base, type: 'image', image: { link: c.media_url, caption: c.caption } };
      case 'document':
        return {
          ...base,
          type: 'document',
          document: { link: c.media_url, filename: c.filename },
        };
      case 'location':
        return {
          ...base,
          type: 'location',
          location: { latitude: c.lat, longitude: c.lng, name: c.name, address: c.address },
        };
      case 'template':
        return {
          ...base,
          type: 'template',
          template: {
            name: c.template_name,
            language: { code: c.language },
            components: c.components,
          },
        };
      default:
        // Voice and interactive *replies* aren't outbound types — only inbound.
        throw new Error(`unsupported outbound content type: ${(c as { type: string }).type}`);
    }
  }
}
