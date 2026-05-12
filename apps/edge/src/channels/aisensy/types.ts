// AiSensy webhook payload shapes (from whatsappintegration/webhooks.md).
// We reconstruct only the fields we use; AiSensy may add more.

export interface AisensyContact {
  type?: 'contact';
  id: string;
  project_id: string;
  name?: string;
  phone_number: string;
  country_code?: string;
}

export type AisensyMessageType =
  | 'TEXT'
  | 'IMAGE'
  | 'AUDIO'
  | 'VIDEO'
  | 'DOCUMENT'
  | 'LOCATION'
  | 'INTERACTIVE'
  | 'BUTTON'
  | 'TEMPLATE'
  | 'CONTACTS'
  | 'STICKER';

export interface AisensyMessageContent {
  // Free-form: AiSensy mirrors WhatsApp Cloud API payload fields here.
  body?: string;
  text?: { body?: string };
  caption?: string;
  link?: string;
  url?: string;
  filename?: string;
  mime_type?: string;
  audio?: { id?: string; mime_type?: string; voice?: boolean; link?: string };
  voice?: { id?: string; mime_type?: string; link?: string };
  image?: { id?: string; mime_type?: string; caption?: string; link?: string };
  document?: { id?: string; mime_type?: string; filename?: string; link?: string };
  video?: { id?: string; mime_type?: string; caption?: string; link?: string };
  location?: { latitude: number; longitude: number; name?: string; address?: string };
  interactive?: {
    type?: 'button_reply' | 'list_reply';
    button_reply?: { id: string; title: string };
    list_reply?: { id: string; title: string; description?: string };
  };
  button?: { payload?: string; text?: string };
}

export interface AisensyMessage {
  type: 'message';
  id: string;
  project_id: string;
  phone_number: string;
  contact_id: string;
  sender: 'USER' | 'BOT' | 'AGENT' | 'BUSINESS' | string;
  message_content: AisensyMessageContent;
  message_type: AisensyMessageType;
  status?: string;
  is_HSM?: boolean;
  delivered_at?: number;
  read_at?: number;
  sent_at?: number;
  failed_at?: number;
  messageId?: string;
}

export interface AisensyNotification {
  id: string;
  created_at: number;
  topic: string;
  delivery_attempt: number;
  app_id?: string;
  webhook_id?: string;
  project_id: string;
  data: {
    contact?: AisensyContact;
    message?: AisensyMessage;
    [k: string]: unknown;
  };
}
