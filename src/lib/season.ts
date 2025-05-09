import { db } from "@/lib/firebase";
import {
  Timestamp,
  addDoc,
  arrayUnion,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";

export const toDate = (v: string | Timestamp) =>
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

type RawMatch = any; // из коллекции matches

export type SeasonResultRow = {
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

/** Считает очки, места, streak’и и возвращает отсортированный массив */
export async function calcSeason(roomId: string): Promise<SeasonResultRow[]> {
  const q = query(collection(db, "matches"), where("roomId", "==", roomId));
  const snap = await getDocs(q);
  if (snap.empty) return [];

  const stats: Record<string, Omit<SeasonResultRow, "place"> & { matches: { w: boolean; t: Date }[] }> = {};

  snap.forEach((d) => {
    const m = d.data() as RawMatch;
    const p = [
      { id: m.player1Id, info: m.player1 },
      { id: m.player2Id, info: m.player2 },
    ] as const;

    p.forEach(({ id, info }) => {
      if (!stats[id])
        stats[id] = {
          userId: id,
          name: info.name ?? "Unknown",
          matchesPlayed: 0,
          wins: 0,
          losses: 0,
          totalAddedPoints: 0,
          finalScore: 0,
          longestWinStreak: 0,
          matches: [],
        };

      const s = stats[id];
      const isWin = m.winner === info.name;
      s.matchesPlayed += 1;
      isWin ? (s.wins += 1) : (s.losses += 1);
      s.totalAddedPoints += info.addedPoints ?? 0;
      s.matches.push({ w: isWin, t: toDate(m.timestamp ?? m.playedAt) });
    });
  });

  // streak + финальный балл
  const arr: SeasonResultRow[] = Object.values(stats).map((s) => {
    // streak
    const sorted = s.matches.sort((a, b) => a.t.getTime() - b.t.getTime());
    let cur = 0,
      max = 0;
    sorted.forEach(({ w }) => {
      if (w) {
        cur += 1;
        if (cur > max) max = cur;
      } else cur = 0;
    });

    const base = s.wins * 2; // победа =2 о.
    const final = base + s.totalAddedPoints;

    return {
      userId: s.userId,
      name: s.name,
      place: 0, // добавим ниже
      matchesPlayed: s.matchesPlayed,
      wins: s.wins,
      losses: s.losses,
      totalAddedPoints: s.totalAddedPoints,
      finalScore: final,
      longestWinStreak: max,
    };
  });

  // сортировка и места
  arr.sort((a, b) => b.finalScore - a.finalScore);
  arr.forEach((p, i) => (p.place = i + 1));
  return arr;
}

/** Записывает историю сезона и обновляет achievements пользователей */
export async function finalizeSeason(roomId: string) {
  const res = await calcSeason(roomId);
  if (!res.length) return;

  const roomRef = doc(db, "rooms", roomId);
  const roomSnap = await getDoc(roomRef);
  if (!roomSnap.exists()) return;
  const roomData = roomSnap.data();

  const seasonEntry = {
    dateFinished: new Date().toLocaleString("fi-FI"),
    roomId,
    roomName: roomData.name ?? "",
    summary: res,
    type: "seasonFinish",
  };

  // 1) append to seasonHistory
  await updateDoc(roomRef, {
    seasonHistory: arrayUnion(seasonEntry),
    members: res.map((m) => ({
      ...roomData.members.find((x: any) => x.userId === m.userId),
      rating: m.finalScore, // можно другой алгоритм
      wins: m.wins,
      losses: m.losses,
    })),
  });

  // 2) write achievements (batch for эффективности)
  const batch = writeBatch(db);
  res.forEach((p) => {
    const uRef = doc(db, "users", p.userId);
    batch.update(uRef, {
      achievements: arrayUnion({
        type: "seasonFinish",
        roomId,
        roomName: roomData.name ?? "",
        dateFinished: seasonEntry.dateFinished,
        ...p,
      }),
    });
  });
  await batch.commit();
}