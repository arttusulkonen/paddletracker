'use strict';

const admin = require('firebase-admin');
const path = require('path');

const serviceAccount = require(path.join(__dirname, 'serviceAccountKey.json'));

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const FieldValue = admin.firestore.FieldValue;
const BATCH_LIMIT = 450;
const START_ELO = 1000;
const K = 32;

function calcDelta(ratingA, ratingB, scoreA, scoreB, isGlobal) {
  const result = scoreA > scoreB ? 1 : 0;
  const expected = 1 / (1 + 10 ** ((ratingB - ratingA) / 400));

  let delta = Math.round(K * (result - expected));

  if (!isGlobal) {
    if (delta < 0) {
      const inflationFactor = 0.8;
      delta = Math.round(delta * inflationFactor);
    }
  }
  return delta;
}

function parseFinnish(str) {
  if (!str || typeof str !== 'string') return null;
  try {
    const [d, t] = str.split(' ');
    const [dd, mm, yyyy] = (d || '').split('.').map(Number);
    const [HH, MM, SS] = (t || '00.00.00').split('.').map(Number);
    if (!yyyy || !mm || !dd) return null;
    return new Date(yyyy, (mm || 1) - 1, dd || 1, HH || 0, MM || 0, SS || 0);
  } catch {
    return null;
  }
}

function parseAnyDate(x) {
  if (x == null) return null;
  if (typeof x === 'number') {
    const ms = x > 1e12 ? x : x * 1000;
    const d = new Date(ms);
    return isNaN(+d) ? null : d;
  }
  if (typeof x === 'string') {
    const d1 = new Date(x);
    if (!isNaN(+d1)) return d1;
    const d2 = parseFinnish(x);
    if (d2) return d2;
  }
  return null;
}

function getMatchDate(m) {
  const byTsIso = parseAnyDate(m.tsIso);
  if (byTsIso) return byTsIso;
  const byTimestamp = parseAnyDate(m.timestamp);
  if (byTimestamp) return byTimestamp;
  const byCreatedAt = parseAnyDate(m.createdAt);
  if (byCreatedAt) return byCreatedAt;
  return new Date(0);
}

function formatFinnish(dt) {
  const pad = (n) => String(n).padStart(2, '0');
  const dd = pad(dt.getDate());
  const mm = pad(dt.getMonth() + 1);
  const yyyy = dt.getFullYear();
  const HH = pad(dt.getHours());
  const MM = pad(dt.getMinutes());
  const SS = pad(dt.getSeconds());
  return `${dd}.${mm}.${yyyy} ${HH}.${MM}.${SS}`;
}

function uniq(arr) {
  return Array.from(new Set(arr));
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

class BatchWriter {
  constructor(db) {
    this.db = db;
    this.batch = db.batch();
    this.count = 0;
    this.commits = 0;
  }
  async commitIfNeeded() {
    if (this.count >= BATCH_LIMIT) {
      await this.batch.commit();
      this.batch = this.db.batch();
      this.count = 0;
      this.commits++;
      process.stdout.write('.');
    }
  }
  update(ref, data) {
    this.batch.update(ref, data);
    this.count++;
    return this.commitIfNeeded();
  }
  set(ref, data, opts) {
    this.batch.set(ref, data, opts);
    this.count++;
    return this.commitIfNeeded();
  }
  delete(ref) {
    this.batch.delete(ref);
    this.count++;
    return this.commitIfNeeded();
  }
  async flush() {
    if (this.count > 0) {
      await this.batch.commit();
      this.count = 0;
      this.commits++;
      console.log(' Done.');
    }
  }
}

async function listSports() {
  const roots = await db.listCollections();
  const sports = roots
    .map((c) => c.id)
    .filter((name) => name.startsWith('matches-'))
    .map((name) => name.replace(/^matches-/, ''));
  return uniq(sports).sort();
}

async function loadRoomsMap(sport) {
  const coll = `rooms-${sport}`;
  const snap = await db.collection(coll).get();
  const out = new Map();
  snap.forEach((d) => out.set(d.id, { id: d.id, ...d.data() }));
  return out;
}

async function loadAllMatches(sport) {
  const coll = `matches-${sport}`;
  const snap = await db.collection(coll).get();
  const all = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  all.sort((a, b) => +getMatchDate(a) - +getMatchDate(b));
  return all;
}

async function buildExistingUsersSet(uids) {
  const refs = uids.map((uid) => db.collection('users').doc(uid));
  const existing = new Set();
  for (const part of chunk(refs, 300)) {
    const snaps = await db.getAll(...part);
    snaps.forEach((s) => {
      if (s.exists) existing.add(s.id);
    });
  }
  return existing;
}

async function migrateSport(sport) {
  console.log(`\n===== SPORT: ${sport} =====`);
  const rooms = await loadRoomsMap(sport);
  const matches = await loadAllMatches(sport);
  console.log(`Матчей: ${matches.length}, комнат: ${rooms.size}`);

  const globalRating = new Map();
  const eloHistory = new Map();
  const wlTotals = new Map();
  const tennisTotals = new Map();

  const roomRatingsMap = new Map();
  const roomWLMap = new Map();

  const userNames = new Map();

  const matchesWriter = new BatchWriter(db);

  for (const m of matches) {
    const roomId = m.roomId;
    const room = rooms.get(roomId) || {};
    const isGlobalRanked = m.isRanked !== false && room.isRanked !== false;

    const p1 = String(m.player1Id);
    const p2 = String(m.player2Id);

    if (m.player1?.name) userNames.set(p1, m.player1.name);
    if (m.player2?.name) userNames.set(p2, m.player2.name);

    if (!globalRating.has(p1)) globalRating.set(p1, START_ELO);
    if (!globalRating.has(p2)) globalRating.set(p2, START_ELO);
    if (!eloHistory.has(p1)) eloHistory.set(p1, []);
    if (!eloHistory.has(p2)) eloHistory.set(p2, []);
    if (!wlTotals.has(p1)) wlTotals.set(p1, { w: 0, l: 0 });
    if (!wlTotals.has(p2)) wlTotals.set(p2, { w: 0, l: 0 });

    if (!roomRatingsMap.has(roomId)) roomRatingsMap.set(roomId, new Map());
    if (!roomWLMap.has(roomId)) roomWLMap.set(roomId, new Map());

    const currentRoomRatings = roomRatingsMap.get(roomId);
    const currentRoomWL = roomWLMap.get(roomId);

    if (!currentRoomRatings.has(p1)) currentRoomRatings.set(p1, START_ELO);
    if (!currentRoomRatings.has(p2)) currentRoomRatings.set(p2, START_ELO);
    if (!currentRoomWL.has(p1)) currentRoomWL.set(p1, { w: 0, l: 0 });
    if (!currentRoomWL.has(p2)) currentRoomWL.set(p2, { w: 0, l: 0 });

    const date = getMatchDate(m);
    const tsIso = date.toISOString();
    const fin = formatFinnish(date);

    const s1 = Number(m?.player1?.scores ?? m?.score1 ?? 0);
    const s2 = Number(m?.player2?.scores ?? m?.score2 ?? 0);

    const oldGlobal1 = globalRating.get(p1);
    const oldGlobal2 = globalRating.get(p2);
    const oldRoom1 = currentRoomRatings.get(p1);
    const oldRoom2 = currentRoomRatings.get(p2);

    let d1_Global = 0;
    let d2_Global = 0;
    if (isGlobalRanked) {
      d1_Global = calcDelta(oldGlobal1, oldGlobal2, s1, s2, true);
      d2_Global = calcDelta(oldGlobal2, oldGlobal1, s2, s1, true);
    }

    const d1_Room = calcDelta(oldRoom1, oldRoom2, s1, s2, false);
    const d2_Room = calcDelta(oldRoom2, oldRoom1, s2, s1, false);

    const newGlobal1 = oldGlobal1 + d1_Global;
    const newGlobal2 = oldGlobal2 + d2_Global;
    const newRoom1 = oldRoom1 + d1_Room;
    const newRoom2 = oldRoom2 + d2_Room;

    if (isGlobalRanked) {
      globalRating.set(p1, newGlobal1);
      globalRating.set(p2, newGlobal2);
      const histDate = tsIso;
      eloHistory.get(p1).push({ date: histDate, elo: newGlobal1 });
      eloHistory.get(p2).push({ date: histDate, elo: newGlobal2 });
    }

    currentRoomRatings.set(p1, newRoom1);
    currentRoomRatings.set(p2, newRoom2);

    const isP1Win = s1 > s2;
    if (isP1Win) {
      wlTotals.get(p1).w++;
      wlTotals.get(p2).l++;
      currentRoomWL.get(p1).w++;
      currentRoomWL.get(p2).l++;
    } else {
      wlTotals.get(p1).l++;
      wlTotals.get(p2).w++;
      currentRoomWL.get(p1).l++;
      currentRoomWL.get(p2).w++;
    }

    if (sport === 'tennis') {
      const t1 = tennisTotals.get(p1) || { aces: 0, df: 0, winners: 0 };
      const t2 = tennisTotals.get(p2) || { aces: 0, df: 0, winners: 0 };
      t1.aces += Number(m?.player1?.aces || 0);
      t1.df += Number(m?.player1?.doubleFaults || 0);
      t1.winners += Number(m?.player1?.winners || 0);
      t2.aces += Number(m?.player2?.aces || 0);
      t2.df += Number(m?.player2?.doubleFaults || 0);
      t2.winners += Number(m?.player2?.winners || 0);
      tennisTotals.set(p1, t1);
      tennisTotals.set(p2, t2);
    }

    const matchRef = db.collection(`matches-${sport}`).doc(m.id);

    const p1Patch = {
      ...(m.player1 || {}),
      oldRating: oldGlobal1,
      newRating: newGlobal1,
      addedPoints: d1_Global,

      roomOldRating: oldRoom1,
      roomNewRating: newRoom1,
      roomAddedPoints: d1_Room,
    };

    const p2Patch = {
      ...(m.player2 || {}),
      oldRating: oldGlobal2,
      newRating: newGlobal2,
      addedPoints: d2_Global,

      roomOldRating: oldRoom2,
      roomNewRating: newRoom2,
      roomAddedPoints: d2_Room,
    };

    const winnerName =
      s1 === s2
        ? m.winner || m?.player1?.name || m?.player2?.name || ''
        : isP1Win
        ? m?.player1?.name || m?.player1Name || 'Player 1'
        : m?.player2?.name || m?.player2Name || 'Player 2';

    await matchesWriter.update(matchRef, {
      player1: p1Patch,
      player2: p2Patch,
      isRanked: !!isGlobalRanked,
      tsIso: tsIso,
      timestamp: fin,
      createdAt: fin,
      winner: winnerName,
    });
  }

  await matchesWriter.flush();
  console.log(`✓ Матчи ${sport}: пересчитаны с новой логикой.`);

  const roomsWriter = new BatchWriter(db);
  for (const [roomId, room] of rooms.entries()) {
    const roomRats = roomRatingsMap.get(roomId) || new Map();
    const roomWL = roomWLMap.get(roomId) || new Map();

    const baseMembers = Array.isArray(room.members) ? room.members : [];
    const newMembers = baseMembers.map((m) => {
      const uid = String(m.userId);
      const r = roomRats.has(uid) ? roomRats.get(uid) : START_ELO;
      const wl = roomWL.get(uid) || { w: 0, l: 0 };

      return {
        ...m,
        rating: r,
        globalElo: globalRating.get(uid) || START_ELO,
        wins: wl.w,
        losses: wl.l,
      };
    });

    await roomsWriter.update(db.collection(`rooms-${sport}`).doc(roomId), {
      members: newMembers,
      seasonHistory: FieldValue.delete(),
    });
  }
  await roomsWriter.flush();
  console.log(`✓ Комнаты ${sport}: рейтинги участников обновлены.`);

  const uids = uniq(
    matches.flatMap((m) => [String(m.player1Id), String(m.player2Id)])
  );
  const existingUserIds = await buildExistingUsersSet(uids);

  const usersWriter = new BatchWriter(db);
  for (const uid of uids) {
    if (!existingUserIds.has(uid)) continue;

    const lastGlobal = globalRating.get(uid) ?? START_ELO;
    const hist = (eloHistory.get(uid) || []).map((h) => ({
      date: h.date,
      elo: h.elo,
    }));
    const wl = wlTotals.get(uid) || { w: 0, l: 0 };

    const sportPatch = {
      [`sports.${sport}.globalElo`]: lastGlobal,
      [`sports.${sport}.eloHistory`]: hist,
      [`sports.${sport}.wins`]: wl.w,
      [`sports.${sport}.losses`]: wl.l,
    };

    if (sport === 'tennis') {
      const tt = tennisTotals.get(uid) || { aces: 0, df: 0, winners: 0 };
      sportPatch[`sports.tennis.aces`] = tt.aces;
      sportPatch[`sports.tennis.doubleFaults`] = tt.df;
      sportPatch[`sports.tennis.winners`] = tt.winners;
    }

    await usersWriter.update(db.collection('users').doc(uid), {
      ...sportPatch,
      achievements: [],
    });
  }
  await usersWriter.flush();
  console.log(`✓ Пользователи: Global ELO обновлен.`);

  console.log(`\n📊 --- ОТЧЕТ ПО РЕЙТИНГАМ (${sport}) ---`);
  console.log(`(Сравниваем Global vs Room для ВСЕХ комнат)\n`);

  const sortedRooms = Array.from(roomRatingsMap.entries()).sort(
    (a, b) => b[1].size - a[1].size
  );

  for (const [roomId, rMap] of sortedRooms) {
    const roomName = rooms.get(roomId)?.name || roomId;
    console.log(`🏠 ROOM: ${roomName}`);
    console.log(`ID: ${roomId}`);
    console.log(
      `-------------------------------------------------------------`
    );
    console.log(
      `| Player             | Global (Real) | Room (Inflated) | Diff |`
    );
    console.log(
      `-------------------------------------------------------------`
    );

    const topPlayers = Array.from(rMap.entries()).sort((a, b) => b[1] - a[1]);

    for (const [uid, roomElo] of topPlayers) {
      const globElo = globalRating.get(uid) || 1000;
      const name = (userNames.get(uid) || uid).padEnd(18).slice(0, 18);
      const diff = roomElo - globElo;
      const sign = diff > 0 ? '+' : '';
      console.log(
        `| ${name} | ${globElo.toString().padEnd(13)} | ${roomElo
          .toString()
          .padEnd(15)} | ${sign}${diff} |`
      );
    }
    console.log(
      `-------------------------------------------------------------\n`
    );
  }

  console.log(`===== SPORT ${sport}: Готово =====`);
}

async function main() {
  try {
    let sports = await listSports();
    sports = sports.filter((s) => s === 'pingpong');

    if (!sports.length) {
      console.log('Коллекции не найдены или нет pingpong.');
      process.exit(0);
    }
    for (const sport of sports) {
      await migrateSport(sport);
    }
    console.log(
      '\n🎉 Полная миграция с новой логикой (Global/Room) завершена.'
    );
    process.exit(0);
  } catch (e) {
    console.error('❌ Ошибка миграции:', e);
    process.exit(1);
  }
}

main();
