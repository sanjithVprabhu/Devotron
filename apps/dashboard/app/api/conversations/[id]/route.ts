import { NextResponse } from 'next/server';
import { MongoClient } from 'mongodb';
import { getSession } from '@/lib/session';
import { withTenant } from '@/lib/db';

let _mongo: MongoClient | null = null;
function mongo(): MongoClient {
  if (!_mongo) {
    const url = process.env.MONGO_URL;
    if (!url) throw new Error('MONGO_URL missing');
    _mongo = new MongoClient(url);
  }
  return _mongo;
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session.email || !session.current_tenant_id) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const { id } = await params;

  const meta = await withTenant(session.current_tenant_id, async (sql) => {
    const rows = await sql<
      Array<{ id: string; status: string; channel: string; principal_id: string }>
    >`
      SELECT id::text, status, channel, principal_id::text
      FROM conversations.threads
      WHERE id = ${id}::uuid
      LIMIT 1
    `;
    return rows[0] ?? null;
  });
  if (!meta) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const client = mongo();
  await client.connect();
  const dbName = `${process.env.MONGO_DB_PREFIX ?? 'tenant_'}${session.current_tenant_id}`;
  const messages = await client
    .db(dbName)
    .collection('messages')
    .find({ thread_id: id })
    .sort({ created_at: 1 })
    .limit(200)
    .toArray();

  return NextResponse.json({
    thread: meta,
    messages: messages.map((m) => ({
      direction: m.direction,
      content: m.content,
      created_at: m.created_at,
      agent_metadata: m.agent_metadata,
    })),
  });
}
