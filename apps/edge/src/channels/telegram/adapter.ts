// Telegram adapter — V1.5 stub. Implements ChannelAdapter so the registry exists,
// but throws on use. Wiring proper handlers is one of the first V1.5 tasks per the spec.

import type { CanonicalMessage, OutboundMessage } from '@veda/shared-types/canonical';
import type { ChannelAdapter } from '../types.js';

export class TelegramAdapter implements ChannelAdapter {
  readonly channel = 'telegram' as const;

  verifySignature(): boolean {
    return false;
  }

  async inbound(): Promise<CanonicalMessage[]> {
    throw new Error('telegram adapter not yet implemented (V1.5)');
  }

  async canSendFreeform(): Promise<boolean> {
    return true;
  }

  async outbound(_: OutboundMessage): Promise<{ channel_message_id: string }> {
    throw new Error('telegram adapter not yet implemented (V1.5)');
  }
}
