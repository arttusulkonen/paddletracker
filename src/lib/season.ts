// src/lib/season.ts
import type { Sport, SportConfig } from '@/contexts/SportContext';
import { db } from '@/lib/firebase';
import { getFinnishFormattedDate } from '@/lib/utils';
import {
  arrayUnion,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  Timestamp,
  updateDoc,
  where,
} from 'firebase/firestore';

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
  o.roomNewRating ?? o.rating ?? o.newRating ?? o.oldRating ?? 1000;

interface RawMatch extends Record<string, any> { }
interface PlayerSeason {
  userId: string;
  name: string;
  wins: number;
  losses: number;
  totalAddedPoints: number;
  matches: { w: boolean; ts: Date }[];
  roomRating: number;
}
export interface SeasonRow {
  userId: string;
  name: string;
  place: number;
  matchesPlayed: number;
  wins: number;
  losses: number;
  winRate: number;
  totalAddedPoints: number;
  adjPoints: number;
  longestWinStreak: number;
  roomRating: number;
  startGlobalElo?: number;
  endGlobalElo?: number;
}

const adjFactor = (ratio: number): number => {
  if (!isFinite(ratio) || ratio <= 0) return 0;
  return Math.sqrt(ratio);
};

async function collectStats(
  roomId: string,
  matchesCollectionName: string
): Promise<SeasonRow[]> {
  const snap = await getDocs(
    query(collection(db, matchesCollectionName), where('roomId', '==', roomId))
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
      rec.totalAddedPoints += info.roomAddedPoints ?? info.addedPoints ?? 0;
      rec.matches.push({ w: win, ts: toDate(m.timestamp) });
      rec.roomRating = pickRoomRating(info);
    });
  });

  const rows: Omit<SeasonRow, 'place' | 'adjPoints'>[] = Object.values(map).map(
    (s) => {
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
      const matchesPlayed = s.wins + s.losses;
      return {
        userId: s.userId,
        name: s.name,
        matchesPlayed,
        wins: s.wins,
        losses: s.losses,
        winRate: matchesPlayed > 0 ? (s.wins / matchesPlayed) * 100 : 0,
        totalAddedPoints: s.totalAddedPoints,
        longestWinStreak: max,
        roomRating: s.roomRating,
      };
    }
  );

  const avgM =
    rows.reduce((sum, r) => sum + r.matchesPlayed, 0) / (rows.length || 1);

  const finalRows: SeasonRow[] = rows.map((r) => ({
    ...r,
    place: 0,
    adjPoints: r.totalAddedPoints * adjFactor(r.matchesPlayed / avgM || 0),
  }));

  finalRows.sort(
    (a, b) =>
      b.adjPoints - a.adjPoints ||
      b.totalAddedPoints - a.totalAddedPoints ||
      b.wins - a.wins ||
      a.losses - b.losses ||
      b.longestWinStreak - a.longestWinStreak
  );

  finalRows.forEach((r, i) => (r.place = i + 1));
  return finalRows;
}

async function getLastMatchFinishDateFinnish(
  roomId: string,
  matchesCollectionName: string
): Promise<string> {
  const qs = query(
    collection(db, matchesCollectionName),
    where('roomId', '==', roomId),
    orderBy('tsIso', 'desc'),
    limit(1)
  );
  const snap = await getDocs(qs);
  if (snap.empty) {
    return getFinnishFormattedDate();
  }
  const m = snap.docs[0].data() as any;
  const dt =
    m?.tsIso != null ? new Date(m.tsIso) : (m?.timestamp ? toDate(m.timestamp) : new Date());
  return getFinnishFormattedDate(dt);
}

export async function finalizeSeason(
  roomId: string,
  snapshots: Record<string, { start: number; end: number }>,
  config: SportConfig['collections'],
  sport: Sport
): Promise<void> {
  const summary = await collectStats(roomId, config.matches);
  if (!summary.length) return;

  const roomRef = doc(db, config.rooms, roomId);
  const roomSnap = await getDoc(roomRef);
  if (!roomSnap.exists()) return;
  const roomData = roomSnap.data() as any;

  const enrichedSummary: SeasonRow[] = summary.map((r) => ({
    ...r,
    startGlobalElo: snapshots[r.userId]?.start ?? 1000,
    endGlobalElo: snapshots[r.userId]?.end ?? r.roomRating,
  }));

  const dateFinished = await getLastMatchFinishDateFinnish(
    roomId,
    config.matches
  );

  const entry = {
    dateFinished,
    roomId,
    roomName: roomData.name ?? '',
    summary: enrichedSummary,
    sport,
    type: 'seasonFinish',
  };

  const updatedMembers = (roomData.members ?? []).map((m: any) => {
    const row = enrichedSummary.find((r) => r.userId === m.userId);
    return row
      ? { ...m, wins: row.wins, losses: row.losses, rating: row.roomRating }
      : m;
  });

  await updateDoc(roomRef, {
    seasonHistory: arrayUnion(entry),
    members: updatedMembers,
  });

  for (const r of enrichedSummary) {
    const achievement = {
      type: 'seasonFinish',
      sport,
      roomId,
      roomName: roomData.name ?? '',
      dateFinished,
      userId: r.userId,
      name: r.name,
      place: r.place,
      matchesPlayed: r.matchesPlayed,
      wins: r.wins,
      losses: r.losses,
      winRate: r.winRate,
      totalAddedPoints: r.totalAddedPoints,
      adjPoints: r.adjPoints,
      longestWinStreak: r.longestWinStreak,
      roomRating: r.roomRating,
      startGlobalElo: r.startGlobalElo,
      endGlobalElo: r.endGlobalElo,
    };
    await updateDoc(doc(db, 'users', r.userId), {
      achievements: arrayUnion(achievement),
    });
  }
}