// migrate-update.cjs
"use strict";

const admin = require("firebase-admin");
const path = require("path");

const serviceAccount = require(path.join(__dirname, "serviceAccountKey.json"));

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const FieldValue = admin.firestore.FieldValue;
const BATCH_LIMIT = 450;
const START_ELO = 1000;
const K = 32;

function calcElo(ratingA, ratingB, aWins) {
  const expA = 1 / (1 + 10 ** ((ratingB - ratingA) / 400));
  return Math.round(ratingA + K * (aWins - expA));
}

function parseFinnish(str) {
  if (!str || typeof str !== "string") return null;
  try {
    const [d, t] = str.split(" ");
    const [dd, mm, yyyy] = (d || "").split(".").map(Number);
    const [HH, MM, SS] = (t || "00.00.00").split(".").map(Number);
    if (!yyyy || !mm || !dd) return null;
    return new Date(yyyy, (mm || 1) - 1, dd || 1, HH || 0, MM || 0, SS || 0);
  } catch {
    return null;
  }
}

function parseAnyDate(x) {
  if (x == null) return null;

  if (typeof x === "number") {
    const ms = x > 1e12 ? x : x * 1000;
    const d = new Date(ms);
    return isNaN(+d) ? null : d;
  }

  if (typeof x === "string") {
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
  const pad = (n) => String(n).padStart(2, "0");
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
    }
  }
}


async function listSports() {
  const roots = await db.listCollections();
  const sports = roots
    .map((c) => c.id)
    .filter((name) => name.startsWith("matches-"))
    .map((name) => name.replace(/^matches-/, ""));
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
  const refs = uids.map((uid) => db.collection("users").doc(uid));
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

  const roomRatings = new Map(); 
  const roomWL = new Map(); 

  const matchesWriter = new BatchWriter(db);

  for (const m of matches) {
    const roomId = m.roomId;
    const room = rooms.get(roomId) || {};
    const isRanked = m.isRanked !== false && room.isRanked !== false;

    const p1 = String(m.player1Id);
    const p2 = String(m.player2Id);

    if (!globalRating.has(p1)) globalRating.set(p1, START_ELO);
    if (!globalRating.has(p2)) globalRating.set(p2, START_ELO);
    if (!eloHistory.has(p1)) eloHistory.set(p1, []);
    if (!eloHistory.has(p2)) eloHistory.set(p2, []);
    if (!wlTotals.has(p1)) wlTotals.set(p1, { w: 0, l: 0 });
    if (!wlTotals.has(p2)) wlTotals.set(p2, { w: 0, l: 0 });
    if (!tennisTotals.has(p1))
      tennisTotals.set(p1, { aces: 0, df: 0, winners: 0 });
    if (!tennisTotals.has(p2))
      tennisTotals.set(p2, { aces: 0, df: 0, winners: 0 });

    if (!roomRatings.has(roomId)) roomRatings.set(roomId, new Map());
    if (!roomWL.has(roomId)) roomWL.set(roomId, new Map());
    const rMap = roomRatings.get(roomId);
    const wlMap = roomWL.get(roomId);
    if (!rMap.has(p1)) rMap.set(p1, START_ELO);
    if (!rMap.has(p2)) rMap.set(p2, START_ELO);
    if (!wlMap.has(p1)) wlMap.set(p1, { w: 0, l: 0 });
    if (!wlMap.has(p2)) wlMap.set(p2, { w: 0, l: 0 });

    const date = getMatchDate(m);
    const tsIso = date.toISOString();
    const fin = formatFinnish(date);

    const s1 = Number(m?.player1?.scores ?? m?.score1 ?? 0);
    const s2 = Number(m?.player2?.scores ?? m?.score2 ?? 0);
    const aWins = s1 > s2 ? 1 : 0;
    const bWins = 1 - aWins;

    const oldG1 = globalRating.get(p1);
    const oldG2 = globalRating.get(p2);
    let newG1 = oldG1;
    let newG2 = oldG2;
    let d1 = 0;
    let d2 = 0;

    const oldR1 = rMap.get(p1);
    const oldR2 = rMap.get(p2);
    let newR1 = oldR1;
    let newR2 = oldR2;

    if (isRanked) {
      newG1 = calcElo(oldG1, oldG2, aWins);
      newG2 = calcElo(oldG2, oldG1, bWins);
      d1 = newG1 - oldG1;
      d2 = newG2 - oldG2;

      newR1 = oldR1 + d1;
      newR2 = oldR2 + d2;

      globalRating.set(p1, newG1);
      globalRating.set(p2, newG2);

      eloHistory.get(p1).push({ date: tsIso, elo: newG1 });
      eloHistory.get(p2).push({ date: tsIso, elo: newG2 });
    } else {
      newR1 = calcElo(oldR1, oldR2, aWins);
      newR2 = calcElo(oldR2, oldR1, bWins);
      d1 = newR1 - oldR1; 
      d2 = newR2 - oldR2;
    }

    rMap.set(p1, newR1);
    rMap.set(p2, newR2);

    const wl1 = wlMap.get(p1);
    const wl2 = wlMap.get(p2);
    if (aWins) {
      wl1.w++;
      wl2.l++;
    } else {
      wl1.l++;
      wl2.w++;
    }

    const g1 = wlTotals.get(p1);
    const g2 = wlTotals.get(p2);
    if (aWins) {
      g1.w++;
      g2.l++;
    } else {
      g1.l++;
      g2.w++;
    }

    if (sport === "tennis") {
      const t1 = tennisTotals.get(p1);
      const t2 = tennisTotals.get(p2);
      t1.aces += Number(m?.player1?.aces || 0);
      t1.df += Number(m?.player1?.doubleFaults || 0);
      t1.winners += Number(m?.player1?.winners || 0);
      t2.aces += Number(m?.player2?.aces || 0);
      t2.df += Number(m?.player2?.doubleFaults || 0);
      t2.winners += Number(m?.player2?.winners || 0);
    }

    const matchRef = db.collection(`matches-${sport}`).doc(m.id);

    const p1Patch = {
      ...(m.player1 || {}),
      oldRating: oldG1, 
      newRating: newG1,
      addedPoints: d1, 
      roomOldRating: oldR1,
      roomNewRating: newR1,
      
      roomAddedPoints: d1,
    };
    const p2Patch = {
      ...(m.player2 || {}),
      oldRating: oldG2,
      newRating: newG2,
      addedPoints: d2,
      roomOldRating: oldR2,
      roomNewRating: newR2,
      roomAddedPoints: d2,
    };

    const winnerName =
      s1 === s2
        ? (m.winner || (m?.player1?.name || m?.player2?.name || ""))
        : (aWins
            ? (m?.player1?.name || m?.player1Name || "Player 1")
            : (m?.player2?.name || m?.player2Name || "Player 2"));

    await matchesWriter.update(matchRef, {
      player1: p1Patch,
      player2: p2Patch,
      isRanked: !!isRanked,

      tsIso: tsIso,
      timestamp: formatFinnish(date),
      createdAt: formatFinnish(date),

      winner: winnerName,
    });
  }

  await matchesWriter.flush();
  console.log(`✓ Матчи ${sport}: пересчитаны и сохранены`);

  const roomsWriter = new BatchWriter(db);
  for (const [roomId, room] of rooms.entries()) {
    const rMap = roomRatings.get(roomId) || new Map();
    const wlMap = roomWL.get(roomId) || new Map();

    const baseMembers = Array.isArray(room.members) ? room.members : [];
    const newMembers = baseMembers.map((m) => {
      const uid = String(m.userId);
      const r = rMap.has(uid) ? rMap.get(uid) : START_ELO;
      const wl = wlMap.get(uid) || { w: 0, l: 0 };
      return {
        ...m,
        rating: r,
        wins: wl.w,
        losses: wl.l,
      };
    });

    const memberIds = uniq(newMembers.map((m) => String(m.userId)).filter(Boolean));

    await roomsWriter.update(
      db.collection(`rooms-${sport}`).doc(roomId),
      {
        members: newMembers,
        memberIds,
        seasonHistory: FieldValue.delete(), 
      }
    );
  }
  await roomsWriter.flush();
  console.log(`✓ Комнаты ${sport}: members/seasonHistory обновлены`);

  const uids = uniq(
    matches.flatMap((m) => [String(m.player1Id), String(m.player2Id)])
  );

  const existingUserIds = await buildExistingUsersSet(uids);
  const missing = uids.filter((u) => !existingUserIds.has(u));
  if (missing.length) {
    console.warn(
      `[WARN] Пропускаем отсутствующих пользователей (${missing.length}):`,
      missing.slice(0, 10).join(", "),
      missing.length > 10 ? "… (ещё есть)" : ""
    );
  }

  const usersWriter = new BatchWriter(db);
  for (const uid of uids) {
    if (!existingUserIds.has(uid)) continue; 

    const lastElo = globalRating.get(uid) ?? START_ELO;
    const hist = (eloHistory.get(uid) || []).map((h) => ({ date: h.date, elo: h.elo }));
    const wl = wlTotals.get(uid) || { w: 0, l: 0 };

    const sportPatch = {
      [`sports.${sport}.globalElo`]: lastElo,
      [`sports.${sport}.eloHistory`]: hist,
      [`sports.${sport}.wins`]: wl.w,
      [`sports.${sport}.losses`]: wl.l,
    };

    if (sport === "tennis") {
      const tt = tennisTotals.get(uid) || { aces: 0, df: 0, winners: 0 };
      sportPatch[`sports.tennis.aces`] = tt.aces;
      sportPatch[`sports.tennis.doubleFaults`] = tt.df;
      sportPatch[`sports.tennis.winners`] = tt.winners;
    }

    await usersWriter.update(db.collection("users").doc(uid), {
      ...sportPatch,
      achievements: [], 
    });
  }
  await usersWriter.flush();
  console.log(`✓ Пользователи: обновлены поля sports.${sport} и achievements очищены`);

  console.log(`===== SPORT ${sport}: Готово =====`);
}

async function main() {
  try {
    const sports = await listSports();
    if (!sports.length) {
      console.log("Коллекции matches-* не найдены. Нечего мигрировать.");
      process.exit(0);
    }
    console.log("Спорты:", sports.join(", "));

    for (const sport of sports) {
      await migrateSport(sport);
    }

    console.log("\n🎉 Миграция завершена успешно.");
    process.exit(0);
  } catch (e) {
    console.error("❌ Ошибка миграции:", e);
    process.exit(1);
  }
}

main();