// src/lib/season.ts  –  обновлено 2025-06-06
// Final-season helper using symmetric √-penalty + “half-average” floor

import { db } from '@/lib/firebase';
import { getFinnishFormattedDate } from '@/lib/utils';
import {
  arrayUnion,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  Timestamp,
  updateDoc,
  where,
} from 'firebase/firestore';

/* ---------- небольшие утилиты ---------- */
const toDate = (v: string | Timestamp): Date =>
  typeof v === 'string'
    ? new Date(
      ...v
        .replace('.', ':')
        .split(/[ .:]/)
        .map(Number)
        .reverse()
        .map((x, i) => (i === 1 ? x - 1 : x))
    )
    : v.toDate();

const pickRoomRating = (o: any): number =>
  o.roomNewRating ??
  o.rating ??
  o.newRating ??
  o.oldRating ??
  1000;

/* ---------- типы ---------- */
interface RawMatch extends Record<string, any> { }
interface StreakMark {
  w: boolean;
  ts: Date;
}
interface PlayerSeason {
  userId: string;
  name: string;
  wins: number;
  losses: number;
  totalAddedPoints: number;
  matches: StreakMark[];
  roomRating: number;
}
export interface SeasonRow {
  userId: string;
  name: string;
  place: number;
  matchesPlayed: number;
  wins: number;
  losses: number;
  totalAddedPoints: number;
  adjPoints: number;
  longestWinStreak: number;
  roomRating: number;
  // новые поля для глобального Elo
  startGlobalElo?: number;
  endGlobalElo?: number;
}

/* ---------- core math ---------- */
const adjFactor = (ratio: number): number => {
  if (!isFinite(ratio) || ratio <= 0) return 0;
  return ratio < 1 ? Math.sqrt(ratio) : 1 / Math.sqrt(ratio);
};

/* ---------- сбор статистики по матча́м ---------- */
async function collectStats(roomId: string): Promise<SeasonRow[]> {
  const snap = await getDocs(
    query(collection(db, 'matches'), where('roomId', '==', roomId))
  );
  if (snap.empty) return [];

  const map: Record<string, PlayerSeason> = {};

  snap.forEach((d) => {
    const m = d.data() as RawMatch;
    [
      { id: m.player1Id, info: m.player1 },
      { id: m.player2Id, info: m.player2 },
    ].forEach(({ id, info }) => {
      if (!map[id]) {
        map[id] = {
          userId: id,
          name: info.name ?? 'Unknown',
          wins: 0,
          losses: 0,
          totalAddedPoints: 0,
          matches: [],
          roomRating: pickRoomRating(info),
        };
      }
      const rec = map[id];
      const win = m.winner === info.name;
      win ? rec.wins++ : rec.losses++;
      rec.totalAddedPoints += info.roomAddedPoints ?? 0;
      rec.matches.push({ w: win, ts: toDate(m.timestamp) });
      rec.roomRating = pickRoomRating(info); // обновляем, чтобы в конце был последний roomRating
    });
  });

  /* строим массив SeasonRow */
  const rows: SeasonRow[] = Object.values(map).map((s) => {
    /* считаем longest win-streak */
    const ordered = [...s.matches].sort(
      (a, b) => a.ts.getTime() - b.ts.getTime()
    );
    let cur = 0,
      max = 0;
    ordered.forEach((m) => {
      if (m.w) {
        if (++cur > max) max = cur;
      } else {
        cur = 0;
      }
    });

    return {
      userId: s.userId,
      name: s.name,
      place: 0,
      matchesPlayed: s.wins + s.losses,
      wins: s.wins,
      losses: s.losses,
      totalAddedPoints: s.totalAddedPoints,
      adjPoints: 0, // зададим чуть ниже
      longestWinStreak: max,
      roomRating: s.roomRating,
      // startGlobalElo/endGlobalElo запишутся позже
    };
  });

  /* среднее и adj-очки */
  const avgM =
    rows.reduce((sum, r) => sum + r.matchesPlayed, 0) / (rows.length || 1);

  rows.forEach((r) => {
    const ratio = r.matchesPlayed / avgM || 0;
    r.adjPoints = r.totalAddedPoints * adjFactor(ratio);
  });

  /* разбиваем на major/minor по “половине среднего” */
  const halfAvg = avgM / 2;
  const major = rows.filter((r) => r.matchesPlayed >= halfAvg);
  const minor = rows.filter((r) => r.matchesPlayed < halfAvg);

  const sortFn = (a: SeasonRow, b: SeasonRow) =>
    b.adjPoints - a.adjPoints ||
    b.totalAddedPoints - a.totalAddedPoints ||
    b.wins - a.wins ||
    b.longestWinStreak - a.longestWinStreak;

  major.sort(sortFn);
  minor.sort(sortFn);

  [...major, ...minor].forEach((r, i) => (r.place = i + 1));
  return [...major, ...minor];
}

/* ---------- публичная функция завершения сезона ---------- */
/**
 * Завершает сезон в комнате roomId.
 * Если передан второй аргумент snapshots, то для каждого игрока в summary будут проставлены
 * поля startGlobalElo и endGlobalElo (рейтинг до начала первого матча и после последнего).
 *
 * @param roomId  Идентификатор комнаты.
 * @param snapshots  Карта: userId → { start: number; end: number }
 */
export async function finalizeSeason(
  roomId: string,
  snapshots?: Record<string, { start: number; end: number }>
): Promise<void> {
  // 1) соберём базовый summary по roomRating, adjPoints и прочему
  const summary = await collectStats(roomId);
  if (!summary.length) return;

  // 2) получим документ комнаты, чтобы взять roomName и список участников
  const roomRef = doc(db, 'rooms', roomId);
  const roomSnap = await getDoc(roomRef);
  if (!roomSnap.exists()) return;
  const roomData = roomSnap.data() as any;

  // 3) допишем в каждый объект r поля startGlobalElo и endGlobalElo
  const enrichedSummary: SeasonRow[] = summary.map((r) => {
    const userId = r.userId;
    if (snapshots && snapshots[userId]) {
      return {
        ...r,
        startGlobalElo: snapshots[userId].start,
        endGlobalElo: snapshots[userId].end,
      };
    }
    // Если snapshots нет (например, вы вызвали без аргумента), можно оставить undefined или поставить текущий roomRating
    return {
      ...r,
      startGlobalElo: r.roomRating,
      endGlobalElo: r.roomRating,
    };
  });

  // 4) соберём запись seasonHistory
  const entry = {
    dateFinished: getFinnishFormattedDate(),
    roomId,
    roomName: roomData.name ?? '',
    summary: enrichedSummary,
    type: 'seasonFinish',
  };

  // 5) обновим поле members в комнате (wins, losses, rating → roomRating)
  const updatedMembers = (roomData.members ?? []).map((m: any) => {
    const row = enrichedSummary.find((r) => r.userId === m.userId);
    if (!row) return m;
    return {
      ...m,
      wins: row.wins,
      losses: row.losses,
      rating: row.roomRating,
    };
  });

  // 6) сохраним в Firestore: добавим новую запись в seasonHistory и обновим members
  await updateDoc(roomRef, {
    seasonHistory: arrayUnion(entry),
    members: updatedMembers,
  });

  // 7) добавим “achievements” каждому участнику (опционально)
  for (const r of enrichedSummary) {
    await updateDoc(doc(db, 'users', r.userId), {
      achievements: arrayUnion({
        type: 'seasonFinish',
        roomId,
        roomName: roomData.name ?? '',
        dateFinished: entry.dateFinished,
        userId: r.userId,
        name: r.name,
        place: r.place,
        matchesPlayed: r.matchesPlayed,
        wins: r.wins,
        losses: r.losses,
        totalAddedPoints: r.totalAddedPoints,
        adjPoints: r.adjPoints,
        longestWinStreak: r.longestWinStreak,
        roomRating: r.roomRating,
        startGlobalElo: r.startGlobalElo,
        endGlobalElo: r.endGlobalElo,
      }),
    });
  }
}