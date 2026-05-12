// Twitter adapter — Dev-only surface in v1. Mentions and DMs to @veda_bot are
// routed to the Veda meta-agent. Onboarding completion graduates the user to WhatsApp.

import { createHmac, timingSafeEqual } from 'node:crypto';
import { request } from 'undici';
import type { CanonicalMessage, OutboundMessage } from '@veda/shared-types/canonical';
import { config } from '../../config.js';
import { logger } from '../../logger.js';
import { isIdempotentlyNew } from '../../redis.js';
import { resolvePrincipal } from '../../identity/resolver.js';
import type { ChannelAdapter } from '../types.js';

interface TwitterTweet {
  id: string;
  text: string;
  author_id: string;
  conversation_id?: string;
  created_at: string;
  in_reply_to_user_id?: string;
}

interface TwitterMentionPayload {
  data?: TwitterTweet[];
  for_user_id?: string;
}

interface TwitterDmEvent {
  id: string;
  event_type: 'MessageCreate';
  text: string;
  sender_id: string;
  created_at: string;
  dm_conversation_id: string;
}

const ZERO_BUF = Buffer.alloc(0);

export class TwitterAdapter implements ChannelAdapter {
  readonly channel = 'twitter' as const;

  verifySignature(rawBody: Buffer, signature: string | undefined): boolean {
    if (!config.TWITTER_API_SECRET) {
      logger.warn('TWITTER_API_SECRET not set; signature check skipped (DEV ONLY)');
      return config.NODE_ENV === 'development';
    }
    if (!signature || !signature.startsWith('sha256=')) return false;
    const expected = createHmac('sha256', config.TWITTER_API_SECRET).update(rawBody).digest('base64');
    const got = signature.slice('sha256='.length);
    try {
      const a = Buffer.from(got);
      const b = Buffer.from(expected);
      if (a.length !== b.length) return false;
      return timingSafeEqual(a, b);
    } catch {
      return timingSafeEqual(ZERO_BUF, ZERO_BUF) && false;
    }
  }

  async inbound(payload: unknown): Promise<CanonicalMessage[]> {
    const body = payload as TwitterMentionPayload | { dm_events?: TwitterDmEvent[] };
    const out: CanonicalMessage[] = [];

    if ('data' in body && Array.isArray(body.data)) {
      for (const t of body.data) {
        const idem = `global:idempotency:twitter:${t.id}`;
        if (!(await isIdempotentlyNew(idem))) continue;
        const principal = await resolvePrincipal('twitter', t.author_id);
        out.push({
          message_id: t.id,
          direction: 'inbound',
          channel: 'twitter',
          tenant_id: null, // Twitter is Dev-only in v1
          thread_id: null,
          sender_principal_id: principal.principal_id,
          sender_identifier: t.author_id,
          recipient_identifier: 'veda_bot',
          timestamp: t.created_at,
          content: { type: 'text', text: stripMentions(t.text) },
          raw_payload: t,
        });
      }
    }

    if ('dm_events' in body && Array.isArray(body.dm_events)) {
      for (const e of body.dm_events) {
        const idem = `global:idempotency:twitter:dm:${e.id}`;
        if (!(await isIdempotentlyNew(idem))) continue;
        const principal = await resolvePrincipal('twitter', e.sender_id);
        out.push({
          message_id: e.id,
          direction: 'inbound',
          channel: 'twitter',
          tenant_id: null,
          thread_id: null,
          sender_principal_id: principal.principal_id,
          sender_identifier: e.sender_id,
          recipient_identifier: 'veda_bot',
          timestamp: e.created_at,
          content: { type: 'text', text: e.text },
          raw_payload: e,
        });
      }
    }

    return out;
  }

  async canSendFreeform(): Promise<boolean> {
    return true;
  }

  async outbound(msg: OutboundMessage): Promise<{ channel_message_id: string }> {
    if (!config.TWITTER_BEARER_TOKEN) throw new Error('TWITTER_BEARER_TOKEN missing');
    const c = msg.content;
    if (c.type !== 'text') {
      throw new Error('twitter outbound supports text only in v1');
    }
    // Posting tweets/replies via API v2.
    const isReply = msg.target_identifier.startsWith('tweet:');
    const url = isReply
      ? 'https://api.twitter.com/2/tweets'
      : 'https://api.twitter.com/2/dm_conversations/with/' +
        encodeURIComponent(msg.target_identifier) +
        '/messages';
    const body = isReply
      ? {
          text: c.text.slice(0, 280),
          reply: { in_reply_to_tweet_id: msg.target_identifier.slice('tweet:'.length) },
        }
      : { text: c.text.slice(0, 1000) };

    const res = await request(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.TWITTER_BEARER_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    if (res.statusCode >= 400) {
      const text = await res.body.text();
      throw new Error(`twitter.send.failed status=${res.statusCode} body=${text}`);
    }
    const json = (await res.body.json()) as { data?: { id?: string; dm_event_id?: string } };
    return { channel_message_id: json.data?.id ?? json.data?.dm_event_id ?? 'unknown' };
  }
}

function stripMentions(text: string): string {
  return text.replace(/@\w+/g, '').trim();
}
