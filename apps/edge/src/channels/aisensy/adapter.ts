// AiSensy adapter — translates AiSensy webhook notifications to canonical messages,
// and translates outbound canonical messages to AiSensy API requests.
//
// Webhook authenticity:
//   AiSensy signs the raw body with HMAC-SHA256 using each project's
//   webhook_shared_secret. The header is `X-AiSensy-Signature` (hex-encoded).
//   The header `X-AiSensy-Project-Id` tells us WHICH project sent the notification,
//   so we can look up the right shared secret.
//
// Outbound (two tiers, picked per tenant):
//   campaign tier (FREE_FOREVER):
//     POST https://backend.aisensy.com/campaign/t1/api/v2
//     Body: { apiKey, campaignName, destination, userName, templateParams[] }
//     Sends only via approved campaign templates. Agent text gets injected as
//     templateParams[0] of the configured template.
//
//   project tier (paid):
//     POST {AISENSY_BASE_URL}/project-apis/v1/project/{project_id}/messages
//     Header: X-AiSensy-Project-API-Pwd: <project_api_pwd>
//     Free-form text supported; mirrors WhatsApp Cloud API shape.

import { createHmac, timingSafeEqual } from 'node:crypto';
import { request } from 'undici';
import { type CanonicalMessage, type OutboundMessage } from '@veda/shared-types/canonical';
import { config } from '../../config.js';
import { logger } from '../../logger.js';
import { isIdempotentlyNew, tenantKey } from '../../redis.js';
import { resolvePrincipal } from '../../identity/resolver.js';
import type { ChannelAdapter } from '../types.js';
import { findByProjectId, findByTenantId } from './credentials.js';
import { persistRemoteMedia } from './media.js';
import type { AisensyMessage, AisensyMessageContent, AisensyNotification } from './types.js';

const AISENSY_PROJECT_BASE = process.env.AISENSY_BASE_URL ?? 'https://apis.aisensy.com';
const AISENSY_CAMPAIGN_URL =
  process.env.AISENSY_CAMPAIGN_URL ?? 'https://backend.aisensy.com/campaign/t1/api/v2';

export class AiSensyAdapter implements ChannelAdapter {
  readonly channel = 'whatsapp' as const;

  /**
   * Verify the AiSensy webhook signature.
   * IMPORTANT: pass the raw request body (the SAME bytes AiSensy hashed). Don't
   * stringify a parsed JSON object — key ordering and whitespace will diverge.
   */
  async verifySignatureForProject(
    rawBody: Buffer,
    signature: string | undefined,
    projectId: string,
  ): Promise<boolean> {
    if (!signature) {
      logger.warn('aisensy.webhook.no_signature_header');
      return config.NODE_ENV === 'development';
    }
    const creds = await findByProjectId(projectId);
    if (!creds) {
      logger.warn({ projectId }, 'aisensy.webhook.unknown_project');
      return false;
    }
    const expected = createHmac('sha256', creds.webhook_secret).update(rawBody).digest('hex');
    if (signature.length !== expected.length) return false;
    try {
      return timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
    } catch {
      return false;
    }
  }

  // The ChannelAdapter base interface is project-agnostic. AiSensy's
  // signature check needs the project id from the X-AiSensy-Project-Id header,
  // so the route handler calls verifySignatureForProject() directly. We satisfy
  // the interface with a no-op stub here.
  verifySignature(): boolean {
    return false;
  }

  async inbound(payload: unknown): Promise<CanonicalMessage[]> {
    const note = payload as AisensyNotification;
    if (!note?.topic || !note?.data) return [];

    // Idempotency: AiSensy retries failed deliveries up to ~5 minutes later.
    const idemKey = `global:idempotency:aisensy:${note.id}`;
    if (!(await isIdempotentlyNew(idemKey))) return [];

    // We only translate user-sent messages; status/contact/order events are
    // handled separately (or ignored in v1).
    if (note.topic !== 'message.sender.user' && note.topic !== 'message.created') {
      logger.debug({ topic: note.topic }, 'aisensy.skip_topic');
      return [];
    }

    const m = note.data.message as AisensyMessage | undefined;
    if (!m || m.sender !== 'USER') {
      // BOT/AGENT/BUSINESS messages are our own outbound being echoed back.
      return [];
    }

    const tenant = await findByProjectId(note.project_id);
    if (!tenant) {
      logger.warn({ project_id: note.project_id }, 'aisensy.inbound.unknown_project');
      return [];
    }

    const principal = await resolvePrincipal('whatsapp', m.phone_number);

    const content = await this.translateInboundContent(m, tenant.tenant_id);
    if (!content) return [];

    const out: CanonicalMessage[] = [
      {
        message_id: m.id,
        direction: 'inbound',
        channel: 'whatsapp',
        tenant_id: tenant.tenant_id,
        thread_id: null,
        sender_principal_id: principal.principal_id,
        sender_identifier: m.phone_number,
        recipient_identifier: tenant.display_name,
        timestamp: new Date(m.sent_at ?? Date.now()).toISOString(),
        content,
        raw_payload: note as unknown,
      },
    ];

    // Refresh the 24-hour window for this customer (AiSensy enforces it on send).
    const { getRedis } = await import('../../redis.js');
    const key = tenantKey(tenant.tenant_id, 'window', tenant.project_id, m.phone_number);
    await getRedis().set(key, '1', 'EX', 86_400);

    return out;
  }

  async canSendFreeform(msg: OutboundMessage): Promise<boolean> {
    if (!msg.requires_window_check) return true;
    if (!msg.tenant_id) return false;
    const creds = await findByTenantId(msg.tenant_id);
    if (!creds) return false;
    const { getRedis } = await import('../../redis.js');
    const key = tenantKey(msg.tenant_id, 'window', creds.project_id, msg.target_identifier);
    const exists = await getRedis().exists(key);
    return exists === 1;
  }

  async outbound(msg: OutboundMessage): Promise<{ channel_message_id: string }> {
    if (!msg.tenant_id) {
      throw new Error('aisensy outbound requires tenant_id');
    }
    const creds = await findByTenantId(msg.tenant_id);
    if (!creds) {
      throw new Error(`no AiSensy credentials configured for tenant ${msg.tenant_id}`);
    }
    return creds.tier === 'campaign'
      ? await this.sendViaCampaignApi(msg, creds)
      : await this.sendViaProjectApi(msg, creds);
  }

  /** FREE_FOREVER + most paid plans — POST backend.aisensy.com/campaign/t1/api/v2.
   * Agent text is injected as the first template parameter of the configured
   * campaign template. Customers see the template body with the parameter substituted. */
  private async sendViaCampaignApi(
    msg: OutboundMessage,
    creds: NonNullable<Awaited<ReturnType<typeof findByTenantId>>>,
  ): Promise<{ channel_message_id: string }> {
    if (!creds.campaign_api_key) {
      throw new Error('aisensy campaign api key missing — paste it on the Integrations page');
    }
    if (!creds.campaign_template_name) {
      throw new Error(
        'no campaign template configured. Create an approved template in the AiSensy ' +
          'dashboard (e.g. "veda_session_reply" with one body parameter), then save its ' +
          'name on the Integrations page.',
      );
    }
    const text = this.extractText(msg);
    if (!text) {
      // Campaign API can't represent buttons/lists/media in a free-form way.
      // Skip silently — we'd have lost this content anyway on the free tier.
      logger.warn(
        { tenant: msg.tenant_id, type: msg.content.type },
        'aisensy.campaign.unsupported_content_type',
      );
      return { channel_message_id: 'campaign-skipped' };
    }
    const body = {
      apiKey: creds.campaign_api_key,
      campaignName: creds.campaign_template_name,
      destination: msg.target_identifier,
      userName: 'Customer',
      templateParams: [text.slice(0, 1024)],
      source: 'veda',
    };
    const res = await request(AISENSY_CAMPAIGN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
    });
    const respText = await res.body.text();
    if (res.statusCode >= 400) {
      throw new Error(`aisensy.campaign.send.failed status=${res.statusCode} body=${respText.slice(0, 400)}`);
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(respText);
    } catch {
      parsed = {};
    }
    const id =
      (parsed as { messageId?: string })?.messageId ??
      (parsed as { _id?: string })?._id ??
      (parsed as { id?: string })?.id ??
      'unknown';
    logger.info({ id, status: res.statusCode }, 'aisensy.campaign.delivered');
    return { channel_message_id: id };
  }

  /** Paid Project API — full WhatsApp Cloud API surface, free-form session messages. */
  private async sendViaProjectApi(
    msg: OutboundMessage,
    creds: NonNullable<Awaited<ReturnType<typeof findByTenantId>>>,
  ): Promise<{ channel_message_id: string }> {
    if (!creds.api_pwd) {
      throw new Error('project tier configured but api_pwd missing');
    }
    const url = `${AISENSY_PROJECT_BASE}/project-apis/v1/project/${creds.project_id}/messages`;
    const body = this.translateOutbound(msg);
    const res = await request(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-AiSensy-Project-API-Pwd': creds.api_pwd,
        Accept: 'application/json',
      },
      body: JSON.stringify(body),
    });
    if (res.statusCode >= 400) {
      const text = await res.body.text();
      throw new Error(`aisensy.project.send.failed status=${res.statusCode} body=${text.slice(0, 400)}`);
    }
    interface SendResp {
      messages?: Array<{ id?: string }>;
    }
    const json = (await res.body.json()) as SendResp;
    return { channel_message_id: json.messages?.[0]?.id ?? 'unknown' };
  }

  /** Pull a plain-text representation of an outbound message — used by the
   * Campaign API path which can only stuff text into a template parameter. */
  private extractText(msg: OutboundMessage): string | null {
    const c = msg.content;
    if (c.type === 'text') return c.text;
    if (c.type === 'buttons' || c.type === 'list') return c.body_text;
    if (c.type === 'image' || c.type === 'document') return c.caption ?? null;
    return null;
  }

  private async translateInboundContent(
    m: AisensyMessage,
    tenantId: string,
  ): Promise<CanonicalMessage['content'] | null> {
    const c: AisensyMessageContent = m.message_content ?? {};
    switch (m.message_type) {
      case 'TEXT':
        return { type: 'text', text: c.text?.body ?? c.body ?? '' };

      case 'AUDIO': {
        const link = c.audio?.link ?? c.voice?.link ?? c.url ?? c.link;
        if (!link) return null;
        const stored = await tryStoreMedia(link, c.audio?.mime_type ?? 'audio/ogg', tenantId);
        return { type: 'voice', media_url: stored };
      }

      case 'IMAGE': {
        const link = c.image?.link ?? c.url ?? c.link;
        if (!link) return null;
        const stored = await tryStoreMedia(link, c.image?.mime_type ?? 'image/jpeg', tenantId);
        return { type: 'image', media_url: stored, caption: c.image?.caption ?? c.caption };
      }

      case 'DOCUMENT': {
        const link = c.document?.link ?? c.url ?? c.link;
        if (!link) return null;
        const stored = await tryStoreMedia(link, c.document?.mime_type ?? 'application/pdf', tenantId);
        return {
          type: 'document',
          media_url: stored,
          filename: c.document?.filename ?? c.filename,
          mime_type: c.document?.mime_type ?? c.mime_type,
        };
      }

      case 'LOCATION':
        if (!c.location) return null;
        return {
          type: 'location',
          lat: c.location.latitude,
          lng: c.location.longitude,
          name: c.location.name,
          address: c.location.address,
        };

      case 'INTERACTIVE': {
        const i = c.interactive;
        if (i?.button_reply) {
          return {
            type: 'button_reply',
            selected_id: i.button_reply.id,
            selected_title: i.button_reply.title,
          };
        }
        if (i?.list_reply) {
          return {
            type: 'list_reply',
            selected_id: i.list_reply.id,
            selected_title: i.list_reply.title,
          };
        }
        return null;
      }

      case 'BUTTON': {
        const text = c.button?.text ?? c.button?.payload;
        if (!text) return null;
        return { type: 'text', text };
      }

      default:
        logger.debug({ type: m.message_type }, 'aisensy.unsupported_message_type');
        return null;
    }
  }

  private translateOutbound(msg: OutboundMessage): Record<string, unknown> {
    // AiSensy mirrors the WhatsApp Cloud API send-message format.
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
        throw new Error(`unsupported AiSensy outbound content type: ${(c as { type: string }).type}`);
    }
  }
}

async function tryStoreMedia(remoteUrl: string, mimeType: string, tenantId: string): Promise<string> {
  // AiSensy serves the media via signed link. In dev (no Azure Blob) keep that URL.
  // In prod, download and re-upload to Azure Blob so we don't depend on AiSensy CDN.
  if (!process.env.AZURE_BLOB_CONNECTION_STRING) return remoteUrl;
  try {
    return await persistRemoteMedia(remoteUrl, mimeType, tenantId);
  } catch (err) {
    logger.warn({ err }, 'aisensy.media.persist_failed_using_remote');
    return remoteUrl;
  }
}
