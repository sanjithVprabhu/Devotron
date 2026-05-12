// One-time code store + delivery. In dev the code is logged to the server
// console; in prod swap `deliver()` for nodemailer/Resend/SES.

import { createHash, randomInt } from 'node:crypto';

interface PendingCode {
  hash: string;
  expires_at: number;
  attempts: number;
}

// In-memory map. Process-local — fine for single-instance dev. For prod swap
// for Redis (we already have it). Keys are normalized email addresses.
const STORE = new Map<string, PendingCode>();

const TTL_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;

function hashCode(email: string, code: string): string {
  return createHash('sha256').update(`${email}:${code}`).digest('hex');
}

export function generate(email: string): string {
  const norm = email.trim().toLowerCase();
  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  STORE.set(norm, {
    hash: hashCode(norm, code),
    expires_at: Date.now() + TTL_MS,
    attempts: 0,
  });
  return code;
}

export function verify(email: string, code: string): boolean {
  const norm = email.trim().toLowerCase();
  const rec = STORE.get(norm);
  if (!rec) return false;
  if (Date.now() > rec.expires_at) {
    STORE.delete(norm);
    return false;
  }
  rec.attempts++;
  if (rec.attempts > MAX_ATTEMPTS) {
    STORE.delete(norm);
    return false;
  }
  if (rec.hash !== hashCode(norm, code)) return false;
  STORE.delete(norm);
  return true;
}

export async function deliver(email: string, code: string): Promise<void> {
  const provider = process.env.AUTH_EMAIL_PROVIDER ?? 'console';
  if (provider === 'console') {
    // eslint-disable-next-line no-console
    console.log(
      `\n┌──────────────────────────────────────────────────────┐\n` +
        `│ VEDA login OTP                                        │\n` +
        `│ email: ${email.padEnd(45)}│\n` +
        `│ code:  ${code.padEnd(45)}│\n` +
        `│ valid for 10 minutes                                  │\n` +
        `└──────────────────────────────────────────────────────┘\n`,
    );
    return;
  }
  // Hook for nodemailer / Resend / SES. Implement in prod path.
  throw new Error(`unknown AUTH_EMAIL_PROVIDER: ${provider}`);
}
