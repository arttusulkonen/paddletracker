export const dynamic = 'force-dynamic';

import {
	getAdminAuth,
	getAdminDb,
	getAdminFirestore,
} from '@/lib/firebaseAdmin';
import crypto from 'crypto';
import { NextResponse } from 'next/server';

const CODE_REGEX = /^\d{6}$/;

export async function GET(req: Request) {
  try {
    const db = getAdminDb();
    const { searchParams } = new URL(req.url);
    const code = searchParams.get('code');

    if (!code || !CODE_REGEX.test(code)) {
      return NextResponse.json(
        { error: 'Invalid code format' },
        { status: 400 },
      );
    }

    const snap = await db.ref(`garmin_links/${code}`).once('value');
    if (!snap.exists()) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const data = snap.val();

    if (data.expiresAt && Date.now() > data.expiresAt) {
      await db.ref(`garmin_links/${code}`).remove();
      return NextResponse.json({ error: 'Code expired' }, { status: 410 });
    }

    // ИСПРАВЛЕНИЕ: Возвращаем только публичные данные, скрывая UID
    return NextResponse.json({
      status: data.status,
      expiresAt: data.expiresAt,
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  try {
    const db = getAdminDb();
    const firestore = getAdminFirestore();
    const auth = getAdminAuth();
    const body = await req.json();

    // ============================================
    // GENERATE (Вызывается с часов, без авторизации)
    // ============================================
    if (body.action === 'generate') {
      let code = '';
      let isUnique = false;
      let attempts = 0;

      // Генерируем безопасный уникальный код, защищаемся от коллизий
      while (!isUnique && attempts < 5) {
        code = crypto.randomInt(100000, 1000000).toString();
        const snap = await db.ref(`garmin_links/${code}`).once('value');
        if (
          !snap.exists() ||
          (snap.val().expiresAt && Date.now() > snap.val().expiresAt)
        ) {
          isUnique = true;
        }
        attempts++;
      }

      if (!isUnique) {
        return NextResponse.json(
          { error: 'Failed to generate unique code' },
          { status: 500 },
        );
      }

      await db.ref(`garmin_links/${code}`).set({
        status: 'pending',
        createdAt: Date.now(),
        expiresAt: Date.now() + 10 * 60 * 1000,
      });

      return NextResponse.json({ code });
    }

    // ============================================
    // LINK / UNLINK (Вызывается с сайта, СТРОГАЯ АВТОРИЗАЦИЯ)
    // ============================================
    const authHeader = req.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.split('Bearer ')[1];
    let decodedToken;
    try {
      decodedToken = await auth.verifyIdToken(token);
    } catch (e) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // БЕРЕМ UID НАПРЯМУЮ ИЗ ТОКЕНА, ИГНОРИРУЯ PAYLOAD С КЛИЕНТА
    const uid = decodedToken.uid;

    if (body.action === 'link') {
      if (!body.code || !CODE_REGEX.test(body.code)) {
        return NextResponse.json(
          { error: 'Invalid code format' },
          { status: 400 },
        );
      }

      const ref = db.ref(`garmin_links/${body.code}`);
      const now = Date.now();

      const transactionResult = await ref.transaction((currentData) => {
        // ИСПРАВЛЕНИЕ: Возвращаем undefined (а не currentData), чтобы отменить транзакцию
        if (!currentData) return;

        if (currentData.expiresAt && now > currentData.expiresAt) return;
        if (currentData.status !== 'pending') return;

        return {
          ...currentData,
          status: 'linked',
          uid: uid,
          linkedAt: now,
        };
      });

      if (!transactionResult.committed) {
        const snap = await ref.once('value');
        if (!snap.exists())
          return NextResponse.json({ error: 'Invalid code' }, { status: 404 });
        const data = snap.val();
        if (data.expiresAt && now > data.expiresAt) {
          await ref.remove();
          return NextResponse.json({ error: 'Code expired' }, { status: 410 });
        }
        if (data.status !== 'pending') {
          return NextResponse.json(
            { error: 'Code already used' },
            { status: 409 },
          );
        }
        return NextResponse.json(
          { error: 'Transaction failed' },
          { status: 500 },
        );
      }

      // Используем set с merge: true (idempotent update), чтобы не упало на пустом профиле
      await firestore.collection('users').doc(uid).set(
        {
          hasGarminDevice: true,
          garminLinkedAt: now,
        },
        { merge: true },
      );

      return NextResponse.json({ success: true });
    }

    if (body.action === 'unlink') {
      await firestore.collection('users').doc(uid).set(
        {
          hasGarminDevice: false,
          garminLinkedAt: null,
        },
        { merge: true },
      );

      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 },
    );
  }
}
