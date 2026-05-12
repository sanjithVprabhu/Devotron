// Encrypt/decrypt per-tenant API credentials using the same scheme the edge
// layer uses (AES-256-GCM keyed by TENANT_SECRET_KEY_B64). Format:
//   "v1:<iv_b64>:<tag_b64>:<ciphertext_b64>"

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

function key(): Buffer {
  const raw = process.env.TENANT_SECRET_KEY_B64;
  if (!raw) throw new Error('TENANT_SECRET_KEY_B64 missing');
  const buf = Buffer.from(raw, 'base64');
  if (buf.length !== 32) throw new Error('TENANT_SECRET_KEY_B64 must decode to 32 bytes');
  return buf;
}

const VERSION = 'v1';

export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString('base64'), tag.toString('base64'), ct.toString('base64')].join(':');
}

export function decryptSecret(blob: string): string {
  const [v, ivB64, tagB64, ctB64, ...rest] = blob.split(':');
  if (v !== VERSION || !ivB64 || !tagB64 || !ctB64 || rest.length > 0) {
    throw new Error('invalid encrypted blob');
  }
  const iv = Buffer.from(ivB64, 'base64');
  const tag = Buffer.from(tagB64, 'base64');
  const ct = Buffer.from(ctB64, 'base64');
  const decipher = createDecipheriv('aes-256-gcm', key(), iv);
  decipher.setAuthTag(tag);
  const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
  return pt.toString('utf8');
}
