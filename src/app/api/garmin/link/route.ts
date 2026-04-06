export const dynamic = 'force-dynamic';

import { getAdminDb, getAdminFirestore } from '@/lib/firebaseAdmin';
import { NextResponse } from 'next/server';

export async function GET(req: Request) {
  try {
    const db = getAdminDb();
    const { searchParams } = new URL(req.url);
    const code = searchParams.get('code');

    if (!code) {
      return NextResponse.json({ error: 'Missing code' }, { status: 400 });
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

    return NextResponse.json(data);
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
    const body = await req.json();

    if (body.action === 'generate') {
      const code = Math.floor(100000 + Math.random() * 900000).toString();
      await db.ref(`garmin_links/${code}`).set({
        status: 'pending',
        createdAt: Date.now(),
        expiresAt: Date.now() + 10 * 60 * 1000,
      });
      return NextResponse.json({ code });
    }

    if (body.action === 'link') {
      if (!body.code || !body.uid)
        return NextResponse.json({ error: 'Missing data' }, { status: 400 });

      const ref = db.ref(`garmin_links/${body.code}`);
      const snap = await ref.once('value');

      if (!snap.exists())
        return NextResponse.json(
          { error: 'Invalid or expired code' },
          { status: 404 },
        );

      await ref.update({
        status: 'linked',
        uid: body.uid,
        linkedAt: Date.now(),
      });

      // ЗАПИСЫВАЕМ ФЛАГ В ПРОФИЛЬ ИГРОКА (FIRESTORE)
      await firestore.collection('users').doc(body.uid).update({
        hasGarminDevice: true,
        garminLinkedAt: Date.now(),
      });

      return NextResponse.json({ success: true });
    }

    // НОВОЕ: ОТВЯЗКА УСТРОЙСТВА С ВЕБСАЙТА
    if (body.action === 'unlink') {
      if (!body.uid)
        return NextResponse.json({ error: 'Missing uid' }, { status: 400 });
      await firestore.collection('users').doc(body.uid).update({
        hasGarminDevice: false,
        garminLinkedAt: null,
      });
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
