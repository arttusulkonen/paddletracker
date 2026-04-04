// src/app/actions/garminPairing.ts
'use server';

import { getAdminDb } from '@/lib/firebaseAdmin';

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

    const pin = Math.floor(1000 + Math.random() * 9000).toString();
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
    console.error('[Action createSessionPairing] Error:', error);
    return { success: false, error: String(error), pin: null, sessionId: null };
  }
}
