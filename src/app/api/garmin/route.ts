export const dynamic = 'force-dynamic';

import { getAdminDb } from '@/lib/firebaseAdmin';
import { NextResponse } from 'next/server';

export async function GET(req: Request) {
  try {
    const db = getAdminDb();
    const { searchParams } = new URL(req.url);
    const pin = searchParams.get('pin');
    const sessionId = searchParams.get('sessionId');

    if (pin) {
      const snapshot = await db.ref(`pin_mappings/${pin}`).once('value');
      if (!snapshot.exists()) {
        return NextResponse.json({ error: 'Not found' }, { status: 404 });
      }

      const data = snapshot.val();
      if (data && data.expiresAt && Date.now() > data.expiresAt) {
        await db.ref(`pin_mappings/${pin}`).remove();
        return NextResponse.json({ error: 'Pin expired' }, { status: 410 });
      }

      return NextResponse.json(data);
    }

    if (sessionId) {
      const snapshot = await db.ref(`live_sessions/${sessionId}`).once('value');
      if (!snapshot.exists()) {
        return NextResponse.json(
          { error: 'Session not found' },
          { status: 404 },
        );
      }
      return NextResponse.json(snapshot.val());
    }

    return NextResponse.json(
      { error: 'Missing pin or sessionId' },
      { status: 400 },
    );
  } catch (error) {
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  try {
    const apiSecret = process.env.GARMIN_API_SECRET;
    if (apiSecret) {
      const authHeader =
        req.headers.get('authorization') || req.headers.get('x-api-key');
      if (authHeader !== `Bearer ${apiSecret}` && authHeader !== apiSecret) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
    }

    const db = getAdminDb();
    const rawText = await req.text();
    let body;

    if (!rawText) {
      return NextResponse.json({ error: 'Empty body' }, { status: 400 });
    }

    try {
      body = JSON.parse(rawText);
    } catch (e) {
      const params = new URLSearchParams(rawText);
      body = Object.fromEntries(params.entries());
      if (body.deviceConnected === 'true') body.deviceConnected = true;
      if (body.isMatchFinished === 'true') body.isMatchFinished = true;
    }

    if (!body || !body.sessionId) {
      return NextResponse.json({ error: 'Missing sessionId' }, { status: 400 });
    }

    const sessionSnapshot = await db
      .ref(`live_sessions/${body.sessionId}`)
      .once('value');
    if (!sessionSnapshot.exists()) {
      return NextResponse.json(
        { error: 'Session not found or expired' },
        { status: 404 },
      );
    }

    const updates: Record<string, any> = {};

    if (body.deviceConnected !== undefined) {
      updates.deviceConnected =
        body.deviceConnected === true || body.deviceConnected === 'true';
    }

    if (body.scoreL !== undefined) {
      const parsed = Number(body.scoreL);
      if (!isNaN(parsed)) updates.scoreL = parsed;
    }

    if (body.scoreR !== undefined) {
      const parsed = Number(body.scoreR);
      if (!isNaN(parsed)) updates.scoreR = parsed;
    }

    if (body.seriesL !== undefined) {
      const parsed = Number(body.seriesL);
      if (!isNaN(parsed)) updates.seriesL = parsed;
    }

    if (body.seriesR !== undefined) {
      const parsed = Number(body.seriesR);
      if (!isNaN(parsed)) updates.seriesR = parsed;
    }

    if (body.last_updated !== undefined) {
      const parsed = Number(body.last_updated);
      if (!isNaN(parsed)) updates.last_updated = parsed;
    }

    if (body.matchStarted !== undefined) {
      updates.matchStarted = body.matchStarted;
    }

    if (body.isMatchFinished !== undefined) {
      updates.isMatchFinished =
        body.isMatchFinished === true || body.isMatchFinished === 'true';
    }

    if (body.server !== undefined) updates.server = body.server;
    if (body.nameL !== undefined) updates.nameL = body.nameL;
    if (body.nameR !== undefined) updates.nameR = body.nameR;
    if (body.colorL !== undefined) updates.colorL = body.colorL;
    if (body.colorR !== undefined) updates.colorR = body.colorR;
    if (body.remoteAction !== undefined)
      updates.remoteAction = body.remoteAction;

    await db.ref(`live_sessions/${body.sessionId}`).update(updates);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 },
    );
  }
}
