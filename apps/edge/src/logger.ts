import pino from 'pino';
import { config } from './config.js';

const PII_PHONE = /\+?\d[\d\s\-]{7,}\d/g;
const PII_EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/g;

function redactPii<T>(value: T): T {
  if (typeof value === 'string') {
    return value.replace(PII_PHONE, '[REDACTED_PHONE]').replace(PII_EMAIL, '[REDACTED_EMAIL]') as T;
  }
  if (Array.isArray(value)) return value.map(redactPii) as T;
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = k === 'principal_id' ? v : redactPii(v);
    return out as T;
  }
  return value;
}

export const logger = pino({
  name: 'veda.edge',
  level: config.LOG_LEVEL,
  transport: config.NODE_ENV === 'development' ? { target: 'pino-pretty' } : undefined,
  formatters: {
    log: (obj) => redactPii(obj),
  },
});

export type Logger = typeof logger;
