// backfill-season-elo.cjs  – 2025-06-07
// Запуск:  node backfill-season-elo.cjs ./serviceAccountKey.json

'use strict';
const admin = require('firebase-admin');
const path = require('path');

/* ─── init ─── */
const keyFile = process.argv[2] || './serviceAccountKey.json';
admin.initializeApp({
  credential: admin.credential.cert(require(path.resolve(keyFile))),
});
const db = admin.firestore();

/* ─── helpers ─── */
const CHUNK = 450;

function chunk(arr, n = CHUNK) {
  return arr.reduce(
    (acc, x, i) => (i % n ? acc[acc.length - 1].push(x) : acc.push([x]), acc),
    []
  );
}

/* "06.06.2025 18.21.16"  or  "19.1.2025 klo 14.17.41" → Date */
function parseFinnish(s = '') {
  const clean = s.replace('klo', '').trim(); // 19.1.2025 klo 14.17.41 → 19.1.2025 14.17.41
  const [d, m, y, hh = 0, mm = 0, ss = 0] = clean
    .split(/[ .:]/)
    .filter(Boolean)
    .map(Number);
  return new Date(y, m - 1, d, hh, mm, ss);
}

/* Вычисляем { userId → {start, end} } */
async function calcSnapshots(roomId, seasonEnd) {
  const msEnd = seasonEnd.getTime();
  const qs = await db.collection('matches').where('roomId', '==', roomId).get();

  const first = {},
    last = {};
  qs.forEach((d) => {
    const m = d.data();
    const ts = parseFinnish(m.timestamp).getTime();
    if (ts > msEnd) return; // матч сыгран уже после завершения того сезона
    [
      { id: m.player1Id, old: m.player1.oldRating, nw: m.player1.newRating },
      { id: m.player2Id, old: m.player2.oldRating, nw: m.player2.newRating },
    ].forEach(({ id, old, nw }) => {
      if (first[id] == null) first[id] = old;
      last[id] = nw;
    });
  });

  const out = {};
  Object.keys(first).forEach((uid) => {
    out[uid] = { start: first[uid], end: last[uid] ?? first[uid] };
  });
  return out;
}

/* ─── основной проход по комнатам ─── */
(async () => {
  console.log('⏳ scanning rooms…');
  const rooms = await db.collection('rooms').get();

  for (const room of rooms.docs) {
    const data = room.data();
    const hist = Array.isArray(data.seasonHistory) ? data.seasonHistory : [];
    let updated = false;

    /* по каждому сезону внутри комнаты */
    for (let idx = 0; idx < hist.length; idx++) {
      const season = hist[idx];
      if (season.type !== 'seasonFinish' || !Array.isArray(season.summary))
        continue;

      // Уже проставлены? → пропускаем
      if (
        season.summary.every(
          (r) => r.startGlobalElo != null && r.endGlobalElo != null
        )
      )
        continue;

      /* 1. Считаем snapshots */
      const seasonEnd = parseFinnish(season.dateFinished);
      const snaps = await calcSnapshots(room.id, seasonEnd);

      /* 2. Обновляем summary */
      season.summary = season.summary.map((r) => ({
        ...r,
        startGlobalElo: snaps[r.userId]?.start ?? r.startGlobalElo ?? null,
        endGlobalElo: snaps[r.userId]?.end ?? r.endGlobalElo ?? null,
      }));
      hist[idx] = season;
      updated = true;

      /* 3. Синхронизируем achievements */
      const achUpdates = [];
      for (const row of season.summary) {
        const uRef = db.collection('users').doc(row.userId);
        const uSnap = await uRef.get();
        if (!uSnap.exists) continue;
        const ach = (uSnap.data().achievements || []).map((a) =>
          a.type === 'seasonFinish' &&
          a.roomId === room.id &&
          a.dateFinished === season.dateFinished
            ? {
                ...a,
                startGlobalElo: row.startGlobalElo,
                endGlobalElo: row.endGlobalElo,
              }
            : a
        );
        achUpdates.push({ ref: uRef, ach });
      }
      // batched writes
      for (const grp of chunk(achUpdates)) {
        const batch = db.batch();
        grp.forEach(({ ref, ach }) => batch.update(ref, { achievements: ach }));
        await batch.commit();
      }
      console.log(`• ${room.id}  –  season ${idx + 1} enriched`);
    }

    /* 4. Записываем обратно в room */
    if (updated) {
      await room.ref.update({ seasonHistory: hist });
    }
  }

  console.log('✅ migration finished');
  process.exit(0);
})();
