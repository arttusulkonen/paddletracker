'use server';

import { getAdminDb } from '@/lib/firebaseAdmin';
import { randomInt } from 'crypto';

export async function createSessionPairing() {
  try {
    const db = getAdminDb();

    if (!db) {
      return {
        success: false,
        error: 'Database not initialized',
        pin: null,
        sessionId: null,
      };
    }

    let pin = '';
    let isUnique = false;
    let attempts = 0;

    while (!isUnique && attempts < 10) {
      pin = randomInt(1000, 10000).toString();
      const snapshot = await db.ref(`pin_mappings/${pin}`).once('value');

      if (!snapshot.exists()) {
        isUnique = true;
      } else {
        const data = snapshot.val();
        if (data && data.expiresAt && Date.now() > data.expiresAt) {
          isUnique = true;
        }
      }
      attempts++;
    }

    if (!isUnique) {
      return {
        success: false,
        error: 'Failed to generate unique PIN',
        pin: null,
        sessionId: null,
      };
    }

    const sessionRef = db.ref('live_sessions').push();
    const sessionId = sessionRef.key;

    if (!sessionId) {
      return {
        success: false,
        error: 'Failed to generate session ID',
        pin: null,
        sessionId: null,
      };
    }

    const expiresAt = Date.now() + 3600000;

    await sessionRef.set({
      deviceConnected: false,
      matchStarted: false,
      scoreL: 0,
      scoreR: 0,
      server: 'L',
      last_updated: Date.now(),
    });

    await db.ref(`pin_mappings/${pin}`).set({
      sessionId,
      expiresAt,
    });

    return { success: true, pin, sessionId, error: null };
  } catch (error) {
    return { success: false, error: String(error), pin: null, sessionId: null };
  }
}
