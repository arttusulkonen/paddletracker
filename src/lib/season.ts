// src/lib/season.ts
import { db } from "@/lib/firebase";
import { getFinnishFormattedDate } from "@/lib/utils";
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
} from "firebase/firestore";

export const toDate = (v: string | Timestamp): Date =>
  typeof v === "string"
    ? new Date(
      ...v
        .replace(".", ":")
        .split(/[ .:]/)
        .map(Number)
        .reverse()
        .map((x, i) => (i === 1 ? x - 1 : x))
    )
    : v.toDate();

type RawMatch = any;

type PlayerSeasonStat = {
  userId: string;
  name: string;
  wins: number;
  losses: number;
  totalAddedPoints: number;
  matches: { w: boolean; ts: Date }[];
  roomRating: number; // rating внутри комнаты к моменту матча
};

type SeasonRow = {
  userId: string;
  name: string;
  place: number;
  matchesPlayed: number;
  wins: number;
  losses: number;
  totalAddedPoints: number;
  finalScore: number;
  longestWinStreak: number;
};

function pickRoomRating(obj: any): number {
  // матчи новой версии содержат roomNewRating, старые — rating/newRating
  return (
    obj.roomNewRating ??
    obj.rating ??
    obj.newRating ??
    obj.oldRating ??
    1000
  );
}

async function collectStats(roomId: string): Promise<SeasonRow[]> {
  const qs = query(collection(db, "matches"), where("roomId", "==", roomId));
  const snap = await getDocs(qs);
  if (snap.empty) return [];

  const stats: Record<string, PlayerSeasonStat> = {};

  snap.forEach((d) => {
    const m = d.data() as RawMatch;
    const players = [
      { id: m.player1Id, info: m.player1 },
      { id: m.player2Id, info: m.player2 },
    ] as const;

    players.forEach(({ id, info }) => {
      if (!stats[id]) {
        stats[id] = {
          userId: id,
          name: info.name ?? "Unknown",
          wins: 0,
          losses: 0,
          totalAddedPoints: 0,
          matches: [],
          roomRating: pickRoomRating(info),
        };
      }
      const s = stats[id];
      const win = m.winner === info.name;
      win ? s.wins++ : s.losses++;
      s.totalAddedPoints += info.addedPoints ?? 0;
      s.matches.push({ w: win, ts: toDate(m.timestamp) });
      // сохраняем «последний» рейтинг в комнате
      s.roomRating = pickRoomRating(info);
    });
  });

  /* ---------- пост-обработка ---------- */
  const rows: SeasonRow[] = Object.values(stats).map((s) => {
    /* streak */
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
      finalScore: 0, // вычислим ниже
      longestWinStreak: max,
    };
  });

  /* ---------- финальный скор ---------- */
  const avgMatches =
    rows.length > 0
      ? rows.reduce((acc, r) => acc + r.matchesPlayed, 0) / rows.length
      : 0;

  rows.forEach((r) => {
    const rating = stats[r.userId].roomRating;
    const base = r.wins * 2 + rating * 0.1;

    // нормализуем «заработанные» очки
    let normPts = r.totalAddedPoints;
    if (avgMatches) {
      const ratio = r.matchesPlayed / avgMatches;
      if (ratio > 1) {
        // сверх-активность: штраф квадратично
        normPts /= ratio * ratio;
      }
    }

    let score = base + normPts;
    if (r.matchesPlayed < avgMatches) score *= 0.9; // штраф за малую активность
    r.finalScore = score;
  });

  rows.sort((a, b) => b.finalScore - a.finalScore);
  rows.forEach((r, i) => (r.place = i + 1));
  return rows;
}

/* -------------------------------------------------------------------------- */
/*                                   PUBLIC                                   */
/* -------------------------------------------------------------------------- */

export async function finalizeSeason(roomId: string): Promise<void> {
  const summary = await collectStats(roomId);
  if (!summary.length) return;

  const roomRef = doc(db, "rooms", roomId);
  const roomSnap = await getDoc(roomRef);
  if (!roomSnap.exists()) return;
  const roomData = roomSnap.data();

  const entry = {
    dateFinished: getFinnishFormattedDate(),
    roomId,
    roomName: roomData.name ?? "",
    summary,
    type: "seasonFinish",
  };

  /* ---------- обновляем room.members (wins / losses / rating) ---------- */
  const updatedMembers = (roomData.members ?? []).map((m: any) => {
    const row = summary.find((r) => r.userId === m.userId);
    if (!row) return m;
    return {
      ...m,
      wins: row.wins,
      losses: row.losses,
      rating: statsSafely(row.userId, summary)?.roomRating ?? m.rating,
    };
  });

  await updateDoc(roomRef, {
    seasonHistory: arrayUnion(entry),
    members: updatedMembers,
  });

  /* ---------- достижения игрокам ---------- */
  for (const r of summary) {
    const uRef = doc(db, "users", r.userId);
    await updateDoc(uRef, {
      achievements: arrayUnion({
        type: "seasonFinish",
        roomId,
        roomName: roomData.name ?? "",
        dateFinished: entry.dateFinished,
        ...r,
      }),
    });
  }
}

/* helper для typescript */
function statsSafely(
  id: string,
  rows: SeasonRow[]
): { roomRating: number } | undefined {
  return (rows as any as Record<string, { roomRating: number }>)[id];
}