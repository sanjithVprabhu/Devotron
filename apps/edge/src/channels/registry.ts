import type { ChannelAdapter } from './types.js';
import { AiSensyAdapter } from './aisensy/adapter.js';
import { TelegramAdapter } from './telegram/adapter.js';
import { TwitterAdapter } from './twitter/adapter.js';
import { WhatsAppAdapter } from './whatsapp/adapter.js';

// Default WhatsApp adapter resolved by env. Pilot uses AiSensy (BSP); once we
// have direct Meta access we flip WA_PROVIDER=meta_direct and the WhatsAppAdapter
// (which talks to graph.facebook.com) takes over without changing call sites.
const WA_PROVIDER = process.env.WA_PROVIDER ?? 'aisensy';
const whatsappAdapter: ChannelAdapter =
  WA_PROVIDER === 'aisensy' ? new AiSensyAdapter() : new WhatsAppAdapter();

export const channelRegistry: Record<string, ChannelAdapter> = {
  whatsapp: whatsappAdapter,
  twitter: new TwitterAdapter(),
  telegram: new TelegramAdapter(),
};

export function getAdapter(channel: 'whatsapp' | 'twitter' | 'telegram' | 'instagram'): ChannelAdapter {
  const a = channelRegistry[channel];
  if (!a) throw new Error(`no adapter registered for channel ${channel}`);
  return a;
}
