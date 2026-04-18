'use strict';

const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

// === ID МАТЧЕЙ, КОТОРЫЕ НУЖНО УДАЛИТЬ ===
const MATCHES_TO_DELETE = [
  'RgI1vLFqJn8ffRg57pRa',
  'v4n5FuivmS6j8X2mfqBe',
  '8sRlR3LAGb6GFVy8zMte'
];

const SPORT = 'pingpong';
const ROOMS_COLLECTION = `rooms-${SPORT}`;
const MATCHES_COLLECTION = `matches-${SPORT}`;

// Подключение к БД
const serviceAccountPath = path.join(__dirname, '../serviceAccountKey.json');
if (!fs.existsSync(serviceAccountPath)) {
  console.error('❌ Ошибка: serviceAccountKey.json не найден');
  process.exit(1);
}

const serviceAccount = require(serviceAccountPath);
if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}
const db = admin.firestore();

// === ЛОГИКА КАЛЬКУЛЯЦИИ ELO ===
function getDynamicK(baseK, matchesPlayed, mode) {
  if (mode !== 'professional') return baseK; 
  if (matchesPlayed < 10) return baseK * 2; // Placement games x2
  return baseK;
}

function calculateDelta(rating1, rating2, score1, score2, isGlobal, mode = 'office', kFactor = 32) {
  if (!isGlobal && mode === 'arcade') return 0;
  
  const K = isGlobal ? 32 : kFactor;
  const result = score1 > score2 ? 1 : 0;
  const expected = 1 / (1 + 10 ** ((rating2 - rating1) / 400));
  
  let delta = Math.round(K * (result - expected));
  
  if (!isGlobal && mode === 'office' && delta < 0) {
    delta = Math.round(delta * 0.8);
  }
  return delta;
}

async function runRecalc() {
  console.log('🚀 Начинаем удаление дубликатов и полный пересчет ELO (с учетом Professional Mode)...');

  // 1. УДАЛЕНИЕ МАТЧЕЙ
  for (const matchId of MATCHES_TO_DELETE) {
    await db.collection(MATCHES_COLLECTION).doc(matchId).delete();
    console.log(`🗑 Удалили случайный матч: ${matchId}`);
  }

  // 2. СКАЧИВАЕМ ВСЕ ОСТАВШИЕСЯ ДАННЫЕ
  console.log('\n📥 Скачиваем базу данных для пересчета...');
  
  const usersSnap = await db.collection('users').get();
  const globalStates = {}; 
  usersSnap.forEach(d => {
    globalStates[d.id] = { globalElo: 1000, wins: 0, losses: 0, eloHistory: [] };
  });

  const roomsSnap = await db.collection(ROOMS_COLLECTION).get();
  const roomStates = {}; 
  roomsSnap.forEach(d => {
    const data = d.data();
    const membersDict = {};
    (data.members || []).forEach(m => {
      const uid = m.userId || m.uid;
      // Сбрасываем стату до 1000, но сохраняем имя, роль и фото
      membersDict[uid] = { ...m, rating: 1000, roomElo: 1000, wins: 0, losses: 0 };
    });
    roomStates[d.id] = { ref: d.ref, data: data, members: membersDict };
  });

  const matchesSnap = await db.collection(MATCHES_COLLECTION).get();
  let matches = [];
  matchesSnap.forEach(d => matches.push({ id: d.id, ...d.data() }));

  // Сортируем матчи строго хронологически
  matches.sort((a, b) => new Date(a.tsIso || 0).getTime() - new Date(b.tsIso || 0).getTime());
  console.log(`🏓 Найдено актуальных матчей: ${matches.length}. Начинаем прогон...`);

  // 3. ПРОГОНЯЕМ ИСТОРИЮ
  for (const m of matches) {
    const p1Id = m.player1Id || m.player1?.userId || m.player1?.uid;
    const p2Id = m.player2Id || m.player2?.userId || m.player2?.uid;
    if (!p1Id || !p2Id) continue;

    // Инициализация, если юзер не найден
    if (!globalStates[p1Id]) globalStates[p1Id] = { globalElo: 1000, wins: 0, losses: 0, eloHistory: [] };
    if (!globalStates[p2Id]) globalStates[p2Id] = { globalElo: 1000, wins: 0, losses: 0, eloHistory: [] };

    const roomId = m.roomId;
    const rState = roomStates[roomId];
    
    let mode = 'professional';
    let baseKFactor = 32;
    
    if (rState) {
      mode = rState.data.mode || 'professional';
      baseKFactor = rState.data.kFactor || 32;
      if (!rState.members[p1Id]) rState.members[p1Id] = { userId: p1Id, rating: 1000, roomElo: 1000, wins: 0, losses: 0, role: 'player' };
      if (!rState.members[p2Id]) rState.members[p2Id] = { userId: p2Id, rating: 1000, roomElo: 1000, wins: 0, losses: 0, role: 'player' };
    }

    const p1GlobalOld = globalStates[p1Id].globalElo;
    const p2GlobalOld = globalStates[p2Id].globalElo;
    const p1RoomOld = rState ? rState.members[p1Id].rating : 1000;
    const p2RoomOld = rState ? rState.members[p2Id].rating : 1000;

    // Вычисляем количество сыгранных матчей в комнате для динамического K
    const p1RoomMatches = rState ? rState.members[p1Id].wins + rState.members[p1Id].losses : 0;
    const p2RoomMatches = rState ? rState.members[p2Id].wins + rState.members[p2Id].losses : 0;

    const p1DynamicK = rState ? getDynamicK(baseKFactor, p1RoomMatches, mode) : baseKFactor;
    const p2DynamicK = rState ? getDynamicK(baseKFactor, p2RoomMatches, mode) : baseKFactor;

    const score1 = Number(m.score1 || m.player1?.scores || 0);
    const score2 = Number(m.score2 || m.player2?.scores || 0);

    // Считаем дельту (Глобальный рейтинг всегда идет со стандартным K=32)
    const globalDelta1 = calculateDelta(p1GlobalOld, p2GlobalOld, score1, score2, true);
    const globalDelta2 = calculateDelta(p2GlobalOld, p1GlobalOld, score2, score1, true);
    
    // Комнатный рейтинг считается с индивидуальным динамическим K
    const roomDelta1 = calculateDelta(p1RoomOld, p2RoomOld, score1, score2, false, mode, p1DynamicK);
    const roomDelta2 = calculateDelta(p2RoomOld, p1RoomOld, score2, score1, false, mode, p2DynamicK);

    // Обновляем сам матч
    if (!m.player1) m.player1 = {};
    m.player1.oldRating = p1GlobalOld;
    m.player1.newRating = p1GlobalOld + globalDelta1;
    m.player1.addedPoints = globalDelta1;
    m.player1.roomOldRating = p1RoomOld;
    m.player1.roomNewRating = p1RoomOld + roomDelta1;
    m.player1.roomAddedPoints = roomDelta1;

    if (!m.player2) m.player2 = {};
    m.player2.oldRating = p2GlobalOld;
    m.player2.newRating = p2GlobalOld + globalDelta2;
    m.player2.addedPoints = globalDelta2;
    m.player2.roomOldRating = p2RoomOld;
    m.player2.roomNewRating = p2RoomOld + roomDelta2;
    m.player2.roomAddedPoints = roomDelta2;

    // Обновляем победы/поражения
    if (score1 > score2) {
      globalStates[p1Id].wins++;
      globalStates[p2Id].losses++;
      if (rState) { rState.members[p1Id].wins++; rState.members[p2Id].losses++; }
    } else {
      globalStates[p2Id].wins++;
      globalStates[p1Id].losses++;
      if (rState) { rState.members[p2Id].wins++; rState.members[p1Id].losses++; }
    }

    // Обновляем ELO
    globalStates[p1Id].globalElo += globalDelta1;
    globalStates[p2Id].globalElo += globalDelta2;
    if (rState) {
      rState.members[p1Id].rating += roomDelta1;
      rState.members[p2Id].rating += roomDelta2;
      rState.members[p1Id].roomElo = rState.members[p1Id].rating; // синхронизация полей
      rState.members[p2Id].roomElo = rState.members[p2Id].rating;
    }

    // Пишем в историю
    const tsIso = m.tsIso || new Date().toISOString();
    globalStates[p1Id].eloHistory.push({ date: tsIso, elo: globalStates[p1Id].globalElo, matchId: m.id });
    globalStates[p2Id].eloHistory.push({ date: tsIso, elo: globalStates[p2Id].globalElo, matchId: m.id });
  }

  // 4. ЗАПИСЫВАЕМ ВСЁ В БАЗУ ДАННЫХ
  console.log('\n💾 Сохраняем пересчитанные данные в базу...');
  const batch = db.batch();

  // Сохраняем матчи
  for (const m of matches) {
    const ref = db.collection(MATCHES_COLLECTION).doc(m.id);
    const mData = { ...m };
    delete mData.id;
    batch.set(ref, mData, { merge: true });
  }

  // Сохраняем пользователей
  for (const uid in globalStates) {
    const ref = db.collection('users').doc(uid);
    const s = globalStates[uid];
    batch.set(ref, {
      sports: {
        [SPORT]: {
          globalElo: s.globalElo,
          wins: s.wins,
          losses: s.losses,
          eloHistory: s.eloHistory
        }
      }
    }, { merge: true });
  }

  // Сохраняем комнаты
  for (const roomId in roomStates) {
    const r = roomStates[roomId];
    const membersArr = Object.values(r.members);
    batch.set(r.ref, { members: membersArr }, { merge: true });
  }

  await batch.commit();
  console.log('✅ Успех! Ошибочные матчи удалены, а ELO-история пересчитана с учетом Professional-режима.');
  process.exit(0);
}

runRecalc().catch(err => {
  console.error('❌ Ошибка при пересчете:', err);
  process.exit(1);
});