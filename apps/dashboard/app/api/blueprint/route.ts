import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/session';
import { callService } from '@/lib/services';

export async function GET() {
  const session = await getSession();
  if (!session.email || !session.current_tenant_id) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  try {
    const data = await callService('blueprint', `/blueprints/${session.current_tenant_id}/current`);
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 404 });
  }
}

const PostSchema = z.object({
  content: z.record(z.unknown()),
  mutation_reason: z.string().optional(),
});

// Replace blueprint atomically (creates a new version).
export async function POST(req: Request) {
  const session = await getSession();
  if (!session.email || !session.current_tenant_id || !session.principal_id) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }
  const parsed = PostSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'invalid_input' }, { status: 400 });

  const out = await callService('blueprint', '/blueprints/create', {
    method: 'POST',
    body: JSON.stringify({
      tenant_id: session.current_tenant_id,
      content: parsed.data.content,
      mutated_by: session.principal_id,
      mutation_source: 'dashboard',
      mutation_reason: parsed.data.mutation_reason,
    }),
  });
  return NextResponse.json(out);
}
