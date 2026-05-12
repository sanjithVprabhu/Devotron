import type { CanonicalMessage, OutboundMessage } from '@veda/shared-types/canonical';

export interface ChannelAdapter {
  /** Channel identifier for routing. */
  readonly channel: 'whatsapp' | 'twitter' | 'telegram' | 'instagram';

  /** Verify webhook signature against shared secret. */
  verifySignature(rawBody: Buffer, signature: string | undefined): boolean;

  /** Translate channel-specific webhook payload to canonical messages. May produce 0..N. */
  inbound(payload: unknown): Promise<CanonicalMessage[]>;

  /** Send an outbound canonical message. */
  outbound(msg: OutboundMessage): Promise<{ channel_message_id: string }>;

  /** Free-form (non-template) outbound allowed? Used by the sender to gate. */
  canSendFreeform(msg: OutboundMessage): Promise<boolean>;
}
