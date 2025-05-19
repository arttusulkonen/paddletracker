'use strict';

// migrate-update.cjs
// Полный скрипт миграции: пересчитывает все матчи, собирает историю ELO,
// обновляет users (eloHistory, globalElo), и добавляет memberIds в rooms.

const admin = require('firebase-admin');

const serviceAccount = require('./serviceAccountKey.json');
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

function parseFinnish(str) {
  const [d, t] = str.split(' ');
  if (!d || !t) return new Date();
  const [dd, mm, yyyy] = d.split('.').map(Number);
  const [HH, MM, SS] = t.split('.').map(Number);
  return new Date(yyyy, mm - 1, dd, HH, MM, SS);
}

function calcElo(rA, rB, sA) {
  const K = 32;
  const EA = 1 / (1 + 10 ** ((rB - rA) / 400));
  return Math.round(rA + K * (sA - EA));
}

(async () => {
  console.log('⏳ Читаем все матчи…');
  const matchesSnap = await db.collection('matches').get();
  const allMatches = matchesSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

  // сортировка по дате
  allMatches.sort(
    (a, b) => parseFinnish(a.timestamp) - parseFinnish(b.timestamp)
  );

  const ratings = {};
  const histories = {};
  const batchMatches = db.batch();

  for (const m of allMatches) {
    const p1 = m.player1Id;
    const p2 = m.player2Id;
    ratings[p1] ??= 1000;
    ratings[p2] ??= 1000;
    histories[p1] ??= [];
    histories[p2] ??= [];

    const old1 = ratings[p1];
    const old2 = ratings[p2];
    const win1 = m.winner === m.player1.name ? 1 : 0;
    const new1 = calcElo(old1, old2, win1);
    const new2 = calcElo(old2, old1, 1 - win1);

    ratings[p1] = new1;
    ratings[p2] = new2;

    const date = parseFinnish(m.timestamp).toISOString();
    histories[p1].push({ date, elo: new1 });
    histories[p2].push({ date, elo: new2 });

    batchMatches.update(db.collection('matches').doc(m.id), {
      player1: {
        ...m.player1,
        oldRating: old1,
        newRating: new1,
        addedPoints: new1 - old1,
      },
      player2: {
        ...m.player2,
        oldRating: old2,
        newRating: new2,
        addedPoints: new2 - old2,
      },
    });
  }

  console.log('⏳ Применяем обновления матчей…');
  await batchMatches.commit();
  console.log('✅ Матчи обновлены');

  console.log('⏳ Обновляем пользователей…');
  const usersSnap = await db.collection('users').get();
  const batchUsers = db.batch();
  for (const docSnap of usersSnap.docs) {
    const uid = docSnap.id;
    const hist = histories[uid] || [];
    const last = hist.length ? hist[hist.length - 1].elo : ratings[uid] || 1000;
    batchUsers.update(docSnap.ref, { eloHistory: hist, globalElo: last });
  }
  await batchUsers.commit();
  console.log('✅ Пользователи обновлены');

  console.log('⏳ Обновляем комнаты…');
  const roomsSnap = await db.collection('rooms').get();
  const batchRooms = db.batch();
  for (const docSnap of roomsSnap.docs) {
    const data = docSnap.data();
    const ids = (data.members || []).map((m) => m.userId).filter(Boolean);
    batchRooms.update(docSnap.ref, { memberIds: ids });
  }
  await batchRooms.commit();
  console.log('✅ Комнаты обновлены');

  process.exit(0);
})();
