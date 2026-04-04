export async function register() {
  // Выполняем только на стороне сервера (Node.js)
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { initFirebaseAdmin } = await import('@/lib/firebaseAdmin');
    try {
      initFirebaseAdmin();
      console.log('[Instrumentation] Firebase Admin successfully registered at startup');
    } catch (error) {
      console.error('[Instrumentation] Firebase Admin failed to register at startup:', error);
    }
  }
}