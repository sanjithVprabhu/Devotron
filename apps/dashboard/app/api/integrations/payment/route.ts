// Per-tenant payment credentials. Currently supports Razorpay (live) +
// Stripe placeholder + UPI handle. Secrets are AES-256-GCM-encrypted.

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/session';
import { withTenant } from '@/lib/db';
import { encryptSecret } from '@/lib/secrets';
import { isEnabled } from '@/lib/features';

interface CredsRow {
  razorpay_key_id: string | null;
  has_razorpay_secret: boolean;
  has_razorpay_webhook_secret: boolean;
  stripe_pubkey: string | null;
  has_stripe_secret: boolean;
  upi_handle: string | null;
  configured_at: string | null;
  updated_at: string | null;
}

export async function GET() {
  if (!isEnabled('phase_1_payments')) {
    return NextResponse.json({ error: 'payments_disabled' }, { status: 404 });
  }
  const session = await getSession();
  if (!session.email || !session.current_tenant_id) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const tenantId = session.current_tenant_id;
  const row = await withTenant(tenantId, async (sql) => {
    const rows = await sql<CredsRow[]>`
      SELECT razorpay_key_id,
             (razorpay_key_secret_enc IS NOT NULL) AS has_razorpay_secret,
             (razorpay_webhook_secret_enc IS NOT NULL) AS has_razorpay_webhook_secret,
             stripe_pubkey,
             (stripe_secret_enc IS NOT NULL) AS has_stripe_secret,
             upi_handle,
             configured_at::text,
             updated_at::text
        FROM business.payment_credentials
       WHERE tenant_id = ${tenantId}::uuid
       LIMIT 1
    `;
    return rows[0] ?? null;
  });
  return NextResponse.json({ payment: row });
}

const SaveSchema = z.object({
  // Razorpay
  razorpay_key_id: z.string().min(8).max(80).optional(),
  razorpay_key_secret: z.string().min(8).max(120).optional(),
  razorpay_webhook_secret: z.string().min(8).max(120).optional(),
  // Stripe (not yet wired downstream — accept input for future)
  stripe_pubkey: z.string().min(8).max(120).optional(),
  stripe_secret: z.string().min(8).max(120).optional(),
  // UPI manual fallback
  upi_handle: z.string().min(3).max(60).optional(),
});

export async function POST(req: Request) {
  if (!isEnabled('phase_1_payments')) {
    return NextResponse.json({ error: 'payments_disabled' }, { status: 404 });
  }
  const session = await getSession();
  if (!session.email || !session.current_tenant_id) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const tenantId = session.current_tenant_id;

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }); }
  const parsed = SaveSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'invalid_input', details: parsed.error.flatten() }, { status: 400 });
  const d = parsed.data;

  const rzpSecretEnc = d.razorpay_key_secret ? encryptSecret(d.razorpay_key_secret) : null;
  const rzpWebhookEnc = d.razorpay_webhook_secret ? encryptSecret(d.razorpay_webhook_secret) : null;
  const stripeSecretEnc = d.stripe_secret ? encryptSecret(d.stripe_secret) : null;

  await withTenant(tenantId, async (sql) => {
    await sql`
      INSERT INTO business.payment_credentials
        (tenant_id, razorpay_key_id, razorpay_key_secret_enc, razorpay_webhook_secret_enc,
         stripe_pubkey, stripe_secret_enc, upi_handle)
      VALUES (
        ${tenantId}::uuid,
        ${d.razorpay_key_id ?? null},
        ${rzpSecretEnc},
        ${rzpWebhookEnc},
        ${d.stripe_pubkey ?? null},
        ${stripeSecretEnc},
        ${d.upi_handle ?? null}
      )
      ON CONFLICT (tenant_id) DO UPDATE SET
        razorpay_key_id = COALESCE(EXCLUDED.razorpay_key_id, business.payment_credentials.razorpay_key_id),
        razorpay_key_secret_enc = COALESCE(EXCLUDED.razorpay_key_secret_enc, business.payment_credentials.razorpay_key_secret_enc),
        razorpay_webhook_secret_enc = COALESCE(EXCLUDED.razorpay_webhook_secret_enc, business.payment_credentials.razorpay_webhook_secret_enc),
        stripe_pubkey = COALESCE(EXCLUDED.stripe_pubkey, business.payment_credentials.stripe_pubkey),
        stripe_secret_enc = COALESCE(EXCLUDED.stripe_secret_enc, business.payment_credentials.stripe_secret_enc),
        upi_handle = COALESCE(EXCLUDED.upi_handle, business.payment_credentials.upi_handle)
    `;
  });

  return NextResponse.json({ ok: true });
}
