'use strict';

const admin = require('firebase-admin');
const path = require('path');

// 1. Инициализация
const serviceAccountPath = path.join(__dirname, '../serviceAccountKey.json');
const serviceAccount = require(serviceAccountPath);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();
const BATCH_LIMIT = 400;
const START_ELO = 1000;
const K_FACTOR = 32;

// --- Helpers ---

function calculateElo(ratingA, ratingB, actualScoreA) {
  const expectedA = 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
  return Math.round(ratingA + K_FACTOR * (actualScoreA - expectedA));
}

function parseDate(val) {
  if (!val) return new Date(0);
  if (typeof val === 'object' && val.toDate) return val.toDate();

  if (typeof val === 'string' && (val.includes('T') || val.includes('-'))) {
    const d = new Date(val);
    if (!isNaN(d.getTime())) return d;
  }

  if (typeof val === 'string' && val.includes('.')) {
    try {
      const [datePart, timePart] = val.split(' ');
      const [d, m, y] = datePart.split('.').map(Number);
      const [h, min, s] = (timePart || '00.00.00').split('.').map(Number);
      return new Date(y, m - 1, d, h || 0, min || 0, s || 0);
    } catch (e) {
      return new Date(0);
    }
  }
  return new Date(0);
}

function formatFinnish(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(date.getDate())}.${pad(
    date.getMonth() + 1,
  )}.${date.getFullYear()} ${pad(date.getHours())}.${pad(
    date.getMinutes(),
  )}.${pad(date.getSeconds())}`;
}

class BatchManager {
  constructor(db) {
    this.db = db;
    this.batch = db.batch();
    this.count = 0;
  }
  async update(ref, data) {
    this.batch.update(ref, data);
    this.count++;
    if (this.count >= BATCH_LIMIT) await this.flush();
  }
  async set(ref, data, options) {
    this.batch.set(ref, data, options);
    this.count++;
    if (this.count >= BATCH_LIMIT) await this.flush();
  }
  async flush() {
    if (this.count > 0) {
      await this.batch.commit();
      this.batch = this.db.batch();
      this.count = 0;
      process.stdout.write('.');
    }
  }
}

async function processSport(sport) {
  console.log(`\n\n🏓 PROCESSING SPORT: ${sport.toUpperCase()}`);

  const matchesColl = `matches-${sport}`;
  const roomsColl = `rooms-${sport}`;

  // 1. Загружаем матчи
  console.log(`⏳ Loading matches from ${matchesColl}...`);
  const matchesSnap = await db.collection(matchesColl).get();
  let matches = matchesSnap.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  }));

  if (matches.length === 0) {
    console.log('No matches found. Skipping.');
    return;
  }

  // 2. Сортировка
  matches = matches
    .map((m) => ({
      ...m,
      _date: parseDate(m.tsIso || m.timestamp || m.createdAt),
    }))
    .sort((a, b) => a._date.getTime() - b._date.getTime());

  console.log(`✅ Loaded and sorted ${matches.length} matches.`);

  // 3. Инициализация
  const globalRatings = new Map();
  const roomRatings = new Map();
  const userStats = new Map();
  const roomStats = new Map();

  const initPlayer = (uid) => {
    if (!globalRatings.has(uid)) globalRatings.set(uid, START_ELO);
    if (!userStats.has(uid))
      userStats.set(uid, { wins: 0, losses: 0, eloHistory: [] });
  };

  const initRoomPlayer = (roomId, uid) => {
    if (!roomRatings.has(roomId)) roomRatings.set(roomId, new Map());
    if (!roomStats.has(roomId)) roomStats.set(roomId, new Map());
    const rMap = roomRatings.get(roomId);
    const sMap = roomStats.get(roomId);
    if (!rMap.has(uid)) rMap.set(uid, START_ELO);
    if (!sMap.has(uid)) sMap.set(uid, { wins: 0, losses: 0 });
  };

  // 4. Пересчет матчей
  const writer = new BatchManager(db);
  console.log('🔄 Recalculating ELO and normalizing data...');

  for (const m of matches) {
    const p1Id = m.player1Id;
    const p2Id = m.player2Id;
    const roomId = m.roomId;

    if (!p1Id || !p2Id || !roomId) continue;

    initPlayer(p1Id);
    initPlayer(p2Id);
    initRoomPlayer(roomId, p1Id);
    initRoomPlayer(roomId, p2Id);

    const oldGlobal1 = globalRatings.get(p1Id);
    const oldGlobal2 = globalRatings.get(p2Id);
    const oldRoom1 = roomRatings.get(roomId).get(p1Id);
    const oldRoom2 = roomRatings.get(roomId).get(p2Id);

    const score1 = Number(m.player1?.scores ?? m.score1 ?? 0);
    const score2 = Number(m.player2?.scores ?? m.score2 ?? 0);

    const isDraw = score1 === score2;
    const p1Wins = score1 > score2 ? 1 : 0;
    const p2Wins = score2 > score1 ? 1 : 0;

    let newGlobal1 = oldGlobal1,
      newGlobal2 = oldGlobal2;
    let newRoom1 = oldRoom1,
      newRoom2 = oldRoom2;
    let diffGlobal1 = 0,
      diffGlobal2 = 0;
    let diffRoom1 = 0,
      diffRoom2 = 0;

    if (m.isRanked !== false && !isDraw) {
      newGlobal1 = calculateElo(oldGlobal1, oldGlobal2, p1Wins);
      newGlobal2 = calculateElo(oldGlobal2, oldGlobal1, p2Wins);
      newRoom1 = calculateElo(oldRoom1, oldRoom2, p1Wins);
      newRoom2 = calculateElo(oldRoom2, oldRoom1, p2Wins);

      diffGlobal1 = newGlobal1 - oldGlobal1;
      diffGlobal2 = newGlobal2 - oldGlobal2;
      diffRoom1 = newRoom1 - oldRoom1;
      diffRoom2 = newRoom2 - oldRoom2;
    }

    globalRatings.set(p1Id, newGlobal1);
    globalRatings.set(p2Id, newGlobal2);
    roomRatings.get(roomId).set(p1Id, newRoom1);
    roomRatings.get(roomId).set(p2Id, newRoom2);

    if (!isDraw) {
      const u1 = userStats.get(p1Id);
      const u2 = userStats.get(p2Id);
      const r1 = roomStats.get(roomId).get(p1Id);
      const r2 = roomStats.get(roomId).get(p2Id);
      if (p1Wins) {
        u1.wins++;
        u2.losses++;
        r1.wins++;
        r2.losses++;
      } else {
        u1.losses++;
        u2.wins++;
        r1.losses++;
        r2.wins++;
      }
    }

    const tsIso = m._date.toISOString();
    userStats.get(p1Id).eloHistory.push({ date: tsIso, elo: newGlobal1 });
    userStats.get(p2Id).eloHistory.push({ date: tsIso, elo: newGlobal2 });

    const p1Name = m.player1?.name || m.player1Name || 'Player 1';
    const p2Name = m.player2?.name || m.player2Name || 'Player 2';
    const winnerName = p1Wins ? p1Name : p2Name;

    const matchUpdate = {
      tsIso: tsIso,
      timestamp: formatFinnish(m._date),
      createdAt: formatFinnish(m._date),
      winner: winnerName,
      isRanked: m.isRanked !== false,
      player1Id: p1Id,
      player2Id: p2Id,
      roomId: roomId,
      players: [p1Id, p2Id],

      player1: {
        name: p1Name,
        scores: score1,
        side: m.player1?.side || 'left',
        oldRating: oldGlobal1,
        newRating: newGlobal1,
        addedPoints: diffGlobal1,
        roomOldRating: oldRoom1,
        roomNewRating: newRoom1,
        roomAddedPoints: diffRoom1,
      },
      player2: {
        name: p2Name,
        scores: score2,
        side: m.player2?.side || 'right',
        oldRating: oldGlobal2,
        newRating: newGlobal2,
        addedPoints: diffGlobal2,
        roomOldRating: oldRoom2,
        roomNewRating: newRoom2,
        roomAddedPoints: diffRoom2,
      },
    };
    await writer.update(db.collection(matchesColl).doc(m.id), matchUpdate);
  }
  await writer.flush();
  console.log(`\n✅ Matches updated.`);

  // 5. Обновляем КОМНАТЫ
  console.log('🔄 Updating Rooms...');
  for (const [roomId, rMap] of roomRatings) {
    const sMap = roomStats.get(roomId);
    const roomRef = db.collection(roomsColl).doc(roomId);

    const roomSnap = await roomRef.get();
    if (!roomSnap.exists) continue;

    const roomData = roomSnap.data();
    const currentMembers = roomData.members || [];

    const updatedMembers = currentMembers.map((m) => {
      const uid = m.userId;
      if (rMap.has(uid)) {
        return {
          ...m,
          rating: rMap.get(uid),
          wins: sMap.get(uid).wins,
          losses: sMap.get(uid).losses,
        };
      }
      return m;
    });

    await writer.update(roomRef, {
      members: updatedMembers,
      // Удаляем историю сезонов и флаг архивации, чтобы открыть комнаты заново
      seasonHistory: admin.firestore.FieldValue.delete(),
      isArchived: admin.firestore.FieldValue.delete(),
    });
  }
  await writer.flush();
  console.log(`✅ Rooms updated.`);

  // 6. Обновляем ПОЛЬЗОВАТЕЛЕЙ
  console.log('🔄 Updating Users...');

  const allUserIds = Array.from(userStats.keys());
  const existingUsersData = new Map();

  const chunkSize = 100;
  for (let i = 0; i < allUserIds.length; i += chunkSize) {
    const chunk = allUserIds.slice(i, i + chunkSize);
    const refs = chunk.map((id) => db.collection('users').doc(id));
    const snaps = await db.getAll(...refs);

    snaps.forEach((snap) => {
      if (snap.exists) {
        existingUsersData.set(snap.id, snap.data());
      }
    });
  }

  for (const [uid, stats] of userStats) {
    if (!existingUsersData.has(uid)) continue;

    const currentUserData = existingUsersData.get(uid);

    const currentAchievements = Array.isArray(currentUserData.achievements)
      ? currentUserData.achievements
      : [];
    const keptAchievements = currentAchievements.filter(
      (a) => a.sport !== sport,
    );

    const userRef = db.collection('users').doc(uid);
    const updateData = {
      [`sports.${sport}.globalElo`]: globalRatings.get(uid),
      [`sports.${sport}.wins`]: stats.wins,
      [`sports.${sport}.losses`]: stats.losses,
      [`sports.${sport}.eloHistory`]: stats.eloHistory,
      achievements: keptAchievements,
    };

    await writer.update(userRef, updateData);
  }
  await writer.flush();
  console.log(`✅ Users updated.`);
}

async function main() {
  try {
    const sports = ['pingpong'];

    for (const sport of sports) {
      await processSport(sport);
    }
    console.log('\n✨ FULL RECALCULATION COMPLETE ✨');
    process.exit(0);
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
}

main();
