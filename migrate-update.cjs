// fixSeasonPlaces.cjs  – v3 (2025-06-04)
// --------------------------------------------------------------
// ⏬ См. комментарии выше
// --------------------------------------------------------------

'use strict';
const admin = require('firebase-admin');
const path = require('path');

/* ───────── init ───────── */
const keyPath = process.argv[2] || './serviceAccountKey.json';
admin.initializeApp({
  credential: admin.credential.cert(require(path.resolve(keyPath))),
});
const db = admin.firestore();
const BATCH_LIMIT = 450;

/* ───── helpers ───── */
const chunk = (a, n) =>
  a.reduce(
    (res, _, i) => (
      i % n ? res[res.length - 1].push(a[i]) : res.push([a[i]]), res
    ),
    []
  );
const adjF = (r) => (r <= 0 ? 0 : r < 1 ? Math.sqrt(r) : 1 / Math.sqrt(r));

function recomputeSeason(summary) {
  if (!summary.length) return summary;

  /* 1. Cчитаем 𝑀̄ только для сыгравших >0 */
  const avg =
    summary
      .filter((r) => (r.matchesPlayed || 0) > 0)
      .reduce((s, r) => s + (r.matchesPlayed || 0), 0) /
    Math.max(1, summary.filter((r) => (r.matchesPlayed || 0) > 0).length);

  const lowThreshold = avg / 2;

  /* 2. Пересчёт adjPoints */
  summary.forEach((r) => {
    const ratio = (r.matchesPlayed || 0) / avg || 0;
    r.adjPoints = (r.totalAddedPoints || 0) * adjF(ratio);
  });

  /* 3. Две корзины — «достаточно» и «мало» матчей */
  const bigSample = summary.filter(
    (r) => (r.matchesPlayed || 0) >= lowThreshold
  );
  const smallSample = summary.filter(
    (r) => (r.matchesPlayed || 0) < lowThreshold
  );

  /* 4. Сортировки внутри корзин */
  const byFields = (a, b) =>
    (b.adjPoints || 0) - (a.adjPoints || 0) ||
    (b.totalAddedPoints || 0) - (a.totalAddedPoints || 0) ||
    (b.wins || 0) - (a.wins || 0) ||
    (b.longestWinStreak || 0) - (a.longestWinStreak || 0);

  bigSample.sort(byFields);
  smallSample.sort(byFields);

  const ordered = [...bigSample, ...smallSample];
  ordered.forEach((r, idx) => (r.place = idx + 1));
  return ordered;
}

/* ───── per-room ───── */
async function updateRoom(room) {
  const data = room.data();
  const hist = data.seasonHistory || [];
  if (!hist.length) return null;
  const i = hist.length - 1;
  const last = { ...hist[i] };
  if (!Array.isArray(last.summary)) return null; // season not finished

  last.summary = recomputeSeason(last.summary);
  const newHist = [...hist];
  newHist[i] = last;
  await room.ref.update({ seasonHistory: newHist });
  console.log(`• Room ${room.id} recalculated (${last.summary.length})`);
  return last.summary;
}

/* ───── achievements ───── */
async function syncAchievements(roomId, summary) {
  const upd = await Promise.all(
    summary.map(async (r) => {
      const uRef = db.collection('users').doc(r.userId);
      const snap = await uRef.get();
      if (!snap.exists) return null;
      const ach = (snap.data().achievements || []).map((a) =>
        a.type === 'seasonFinish' && a.roomId === roomId
          ? { ...a, place: r.place, adjPoints: r.adjPoints }
          : a
      );
      return { ref: uRef, ach };
    })
  );
  const valid = upd.filter(Boolean);
  for (const group of chunk(valid, BATCH_LIMIT)) {
    const batch = db.batch();
    group.forEach(({ ref, ach }) => batch.update(ref, { achievements: ach }));
    await batch.commit();
  }
}

/* ───── run all ───── */
(async () => {
  try {
    console.log('⏳ Fetching rooms…');
    const rooms = await db.collection('rooms').get();
    for (const room of rooms.docs) {
      const summary = await updateRoom(room);
      if (summary) await syncAchievements(room.id, summary);
    }
    console.log('✅ Done.');
    process.exit(0);
  } catch (e) {
    console.error('❌', e);
    process.exit(1);
  }
})();
