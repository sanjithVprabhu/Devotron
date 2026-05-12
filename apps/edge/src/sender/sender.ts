// Outbound sender — consumes veda.messages.outbound, sends via the right channel.
// 24-hour window enforcement is delegated to each adapter's canSendFreeform().

import { KAFKA_TOPICS } from '@veda/shared-types/constants';
import type { MessagesOutboundEvent } from '@veda/shared-types/events';
import type { OutboundMessage } from '@veda/shared-types/canonical';
import type { VedaKafka } from '@veda/kafka-client';
import { logger } from '../logger.js';
import { getAdapter } from '../channels/registry.js';
import { lookupApprovedTemplate } from './templates.js';

export async function startSender(kafka: VedaKafka): Promise<void> {
  await kafka.consume(
    KAFKA_TOPICS.MESSAGES_OUTBOUND,
    'edge-sender',
    async (event: MessagesOutboundEvent) => {
      await sendOnce(event);
    },
  );
  logger.info('sender.started');
}

async function sendOnce(event: MessagesOutboundEvent): Promise<void> {
  const adapter = getAdapter(event.target_channel as 'whatsapp' | 'twitter' | 'telegram' | 'instagram');

  const msg: OutboundMessage = {
    event_id: event.event_id,
    occurred_at: event.occurred_at,
    tenant_id: event.tenant_id,
    thread_id: event.thread_id,
    target_channel: event.target_channel,
    target_identifier: event.target_identifier,
    source_phone_number_id: event.source_phone_number_id,
    content: event.content,
    template_name: event.template_name,
    template_variables: event.template_variables,
    requires_window_check: event.requires_window_check,
    priority: event.priority,
  };

  const isFreeform = msg.content.type !== 'template';
  if (isFreeform && !(await adapter.canSendFreeform(msg))) {
    // Window closed — must use template. Look up best fit from template registry.
    if (!msg.tenant_id) {
      logger.warn({ event_id: event.event_id }, 'sender.window_closed.no_tenant');
      return;
    }
    const tmpl = await lookupApprovedTemplate(msg.tenant_id, msg.template_name ?? null);
    if (!tmpl) {
      logger.warn({ event_id: event.event_id }, 'sender.window_closed.no_template');
      return;
    }
    msg.content = {
      type: 'template',
      template_name: tmpl.name,
      language: tmpl.language,
      components: substituteTemplateComponents(tmpl.components, msg.template_variables),
    };
  }

  try {
    const { channel_message_id } = await adapter.outbound(msg);
    logger.info(
      { event_id: event.event_id, channel_message_id, channel: msg.target_channel },
      'sender.delivered',
    );
  } catch (err) {
    logger.error({ err, event_id: event.event_id }, 'sender.failed');
    throw err;
  }
}

function substituteTemplateComponents(
  components: unknown,
  vars: Record<string, string> | undefined,
): { type: 'header' | 'body' | 'button'; parameters: { type: 'text'; value: string }[] }[] {
  // Minimal v1 substitution: walk components, replace {{key}} placeholders.
  if (!Array.isArray(components)) return [];
  return components.map((c: { type: string; parameters?: { type: string; value: string }[] }) => ({
    type: c.type as 'header' | 'body' | 'button',
    parameters: (c.parameters ?? []).map((p) => ({
      type: 'text' as const,
      value: substitute(p.value ?? '', vars ?? {}),
    })),
  }));
}

function substitute(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? '');
}
