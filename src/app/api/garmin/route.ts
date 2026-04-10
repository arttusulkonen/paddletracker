// src/app/api/garmin/route.ts
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

    if (!rawText)
      return NextResponse.json({ error: 'Empty body' }, { status: 400 });

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

    const sessionRef = db.ref(`live_sessions/${body.sessionId}`);

    // ИСПРАВЛЕНИЕ: Используем Атомарную Транзакцию
    const transactionResult = await sessionRef.transaction((currentData) => {
      // ИСПРАВЛЕНИЕ FIREBASE: Возвращаем null (а не undefined), чтобы заставить
      // SDK сходить на сервер и получить реальные данные, а не отменять локально.
      if (currentData === null) return null;

      const action = body.remoteAction;

      if (action === 'add_left') {
        currentData.scoreL = (currentData.scoreL || 0) + 1;
      } else if (action === 'add_right') {
        currentData.scoreR = (currentData.scoreR || 0) + 1;
      } else if (action === 'sub_left') {
        currentData.scoreL = Math.max(0, (currentData.scoreL || 0) - 1);
      } else if (action === 'sub_right') {
        currentData.scoreR = Math.max(0, (currentData.scoreR || 0) - 1);
      } else {
        if (body.scoreL !== undefined) {
          const parsed = Number(body.scoreL);
          if (!isNaN(parsed)) currentData.scoreL = parsed;
        }
        if (body.scoreR !== undefined) {
          const parsed = Number(body.scoreR);
          if (!isNaN(parsed)) currentData.scoreR = parsed;
        }
      }

      if (
        action &&
        !['add_left', 'add_right', 'sub_left', 'sub_right'].includes(action)
      ) {
        currentData.remoteAction = action;
      }

      if (body.deviceConnected !== undefined) {
        currentData.deviceConnected =
          body.deviceConnected === true || body.deviceConnected === 'true';
      }
      if (body.seriesL !== undefined) {
        const parsed = Number(body.seriesL);
        if (!isNaN(parsed)) currentData.seriesL = parsed;
      }
      if (body.seriesR !== undefined) {
        const parsed = Number(body.seriesR);
        if (!isNaN(parsed)) currentData.seriesR = parsed;
      }
      if (body.last_updated !== undefined) {
        const parsed = Number(body.last_updated);
        if (!isNaN(parsed)) currentData.last_updated = parsed;
      }

      if (body.matchStarted !== undefined)
        currentData.matchStarted = body.matchStarted;
      if (body.isMatchFinished !== undefined) {
        currentData.isMatchFinished =
          body.isMatchFinished === true || body.isMatchFinished === 'true';
      }
      if (body.server !== undefined) currentData.server = body.server;
      if (body.nameL !== undefined) currentData.nameL = body.nameL;
      if (body.nameR !== undefined) currentData.nameR = body.nameR;
      if (body.colorL !== undefined) currentData.colorL = body.colorL;
      if (body.colorR !== undefined) currentData.colorR = body.colorR;

      return currentData;
    });

    // Проверяем, что данные реально существовали в базе после ответа сервера
    if (!transactionResult.committed || !transactionResult.snapshot.exists()) {
      return NextResponse.json(
        { error: 'Session not found or expired' },
        { status: 404 },
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 },
    );
  }
}
