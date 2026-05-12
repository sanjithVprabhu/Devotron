import { NextResponse } from 'next/server';
import { z } from 'zod';
import { deliver, generate } from '@/lib/otp';

const Schema = z.object({ email: z.string().email() });

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_email' }, { status: 400 });
  }
  const code = generate(parsed.data.email);
  await deliver(parsed.data.email, code);
  return NextResponse.json({ ok: true });
}
