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
import type { RoomMode } from './types';

const toDate = (v: string | Timestamp): Date => {
  if (v instanceof Timestamp) return v.toDate();
  if (typeof v === 'string') {
    if (v.includes('.')) {
      const parts = v.split(' ');
      const dateParts = parts[0].split('.');
      const timeParts = parts[1] ? parts[1].split('.') : ['00', '00', '00'];
      return new Date(
        +dateParts[2],
        +dateParts[1] - 1,
        +dateParts[0],
        +timeParts[0],
        +timeParts[1],
        +timeParts[2] || 0
      );
    }
    return new Date(v);
  }
  return new Date();
};

const formatDate = (d: Date): string => {
  const day = d.getDate().toString().padStart(2, '0');
  const month = (d.getMonth() + 1).toString().padStart(2, '0');
  const year = d.getFullYear();
  const hours = d.getHours().toString().padStart(2, '0');
  const mins = d.getMinutes().toString().padStart(2, '0');
  const secs = d.getSeconds().toString().padStart(2, '0');
  return `${day}.${month}.${year} ${hours}:${mins}:${secs}`;
};

const pickRoomRating = (o: any): number =>
  o.roomNewRating ?? o.rating ?? o.newRating ?? o.oldRating ?? 1000;

interface RawMatch extends Record<string, any> {}
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
  matchesCollectionName: string,
  mode: RoomMode
): Promise<SeasonRow[]> {
  if (!db) return [];

  const snap = await getDocs(
    query(
      collection(db, matchesCollectionName),
      where('roomId', '==', roomId),
      orderBy('tsIso', 'asc')
    )
  );

  if (snap.empty) return [];

  const map: Record<string, PlayerSeason> = {};

  snap.forEach((d) => {
    const m = d.data() as RawMatch;
    if (!m.player1Id || !m.player2Id) return;

    [
      { id: m.player1Id, info: m.player1 },
      { id: m.player2Id, info: m.player2 },
    ].forEach(({ id, info }) => {
      if (!info) return;

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

      const isWinner = m.winner === info.name;

      if (isWinner) {
        rec.wins++;
      } else {
        rec.losses++;
      }
      rec.totalAddedPoints += info.roomAddedPoints ?? info.addedPoints ?? 0;

      const matchDate = m.tsIso ? new Date(m.tsIso) : toDate(m.timestamp);
      rec.matches.push({ w: isWinner, ts: matchDate });

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
          cur++;
          if (cur > max) max = cur;
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

  const totalMatchesAll = rows.reduce((sum, r) => sum + r.matchesPlayed, 0);
  const avgM = rows.length > 0 ? totalMatchesAll / rows.length : 1;

  const finalRows: SeasonRow[] = rows.map((r) => {
    const adjPoints = r.totalAddedPoints * adjFactor(r.matchesPlayed / avgM);

    return {
      ...r,
      place: 0,
      adjPoints,
    };
  });

  finalRows.sort((a, b) => {
    const aPlayed = a.matchesPlayed > 0;
    const bPlayed = b.matchesPlayed > 0;
    if (aPlayed !== bPlayed) return aPlayed ? -1 : 1;

    if (mode === 'professional') {
      if (b.roomRating !== a.roomRating) return b.roomRating - a.roomRating;
      if (b.winRate !== a.winRate) return b.winRate - a.winRate;
      return b.wins - a.wins;
    } else if (mode === 'arcade') {
      if (b.wins !== a.wins) return b.wins - a.wins;
      if (b.winRate !== a.winRate) return b.winRate - a.winRate;
      return b.matchesPlayed - a.matchesPlayed;
    } else {
      if (b.adjPoints !== a.adjPoints) return b.adjPoints - a.adjPoints;
      if (b.roomRating !== a.roomRating) return b.roomRating - a.roomRating;
      return b.winRate - a.winRate;
    }
  });

  finalRows.forEach((r, i) => (r.place = i + 1));

  return finalRows;
}

async function getLastMatchFinishDateFinnish(
  roomId: string,
  matchesCollectionName: string
): Promise<string> {
  if (!db) return getFinnishFormattedDate();

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
    m?.tsIso != null
      ? new Date(m.tsIso)
      : m?.timestamp
      ? toDate(m.timestamp)
      : new Date();
  
  // FIX: Use local helper instead of getFinnishFormattedDate(dt)
  return formatDate(dt);
}

export async function finalizeSeason(
  roomId: string,
  snapshots: Record<string, { start: number; end: number }>,
  config: SportConfig['collections'],
  sport: Sport
): Promise<void> {
  if (!db) return;

  const roomRef = doc(db, config.rooms, roomId);
  const roomSnap = await getDoc(roomRef);
  if (!roomSnap.exists()) return;
  const roomData = roomSnap.data() as any;
  const mode = roomData.mode || 'office';

  const summary = await collectStats(roomId, config.matches, mode);
  if (!summary.length) return;

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
    mode,
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
      mode,
    };

    if (db) {
      await updateDoc(doc(db, 'users', r.userId), {
        achievements: arrayUnion(achievement),
      });
    }
  }
}