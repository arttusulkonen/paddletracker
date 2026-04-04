// src/app/api/garmin/route.ts
import { getAdminDb } from '@/lib/firebaseAdmin';
import { NextResponse } from 'next/server';

export async function GET(req: Request) {
  try {
    const db = getAdminDb();
    const { searchParams } = new URL(req.url);
    const pin = searchParams.get('pin');

    if (pin) {
      const snapshot = await db.ref(`pin_mappings/${pin}`).once('value');
      if (!snapshot.exists()) {
        return NextResponse.json({ error: 'Not found' }, { status: 404 });
      }
      return NextResponse.json(snapshot.val());
    }

    return NextResponse.json({ error: 'Missing pin' }, { status: 400 });
  } catch (error) {
    console.error('[API Garmin] GET Error:', error);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  try {
    const db = getAdminDb();
    const body = await req.json();

    if (!body || !body.sessionId) {
      return NextResponse.json({ error: 'Missing sessionId' }, { status: 400 });
    }

    const updates: Record<string, any> = {};
    if (body.deviceConnected !== undefined)
      updates.deviceConnected = body.deviceConnected;
    if (body.scoreL !== undefined) updates.scoreL = body.scoreL;
    if (body.scoreR !== undefined) updates.scoreR = body.scoreR;
    if (body.last_updated !== undefined)
      updates.last_updated = body.last_updated;

    await db.ref(`live_sessions/${body.sessionId}`).update(updates);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[API Garmin] POST Error:', error);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 },
    );
  }
}
