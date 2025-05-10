import { db } from "@/lib/firebase";
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
    : v.toDate()

type RawMatch = any

type Stat = {
  userId: string
  name: string
  wins: number
  losses: number
  totalAddedPoints: number
  matches: { w: boolean; t: Date }[]
  rating: number
}

type SeasonRow = {
  userId: string
  name: string
  place: number
  matchesPlayed: number
  wins: number
  losses: number
  totalAddedPoints: number
  finalScore: number
  longestWinStreak: number
}

async function gatherStats(roomId: string): Promise<SeasonRow[]> {
  const q = query(collection(db, "matches"), where("roomId", "==", roomId))
  const snap = await getDocs(q)
  if (snap.empty) return []

  const stats: Record<string, Stat> = {}

  snap.forEach(d => {
    const m = d.data() as RawMatch
    const players = [
      { id: m.player1Id, info: m.player1 },
      { id: m.player2Id, info: m.player2 },
    ] as const

    players.forEach(({ id, info }) => {
      if (!stats[id]) {
        stats[id] = {
          userId: id,
          name: info.name ?? "Unknown",
          wins: 0,
          losses: 0,
          totalAddedPoints: 0,
          matches: [],
          rating: info.rating ?? 1000,
        }
      }
      const s = stats[id]
      const win = m.winner === info.name
      win ? (s.wins += 1) : (s.losses += 1)
      s.totalAddedPoints += info.addedPoints ?? 0
      s.matches.push({ w: win, t: toDate(m.timestamp ?? m.playedAt) })
    })
  })

  const rows: SeasonRow[] = Object.values(stats).map(s => {
    const sorted = [...s.matches].sort((a, b) => a.t.getTime() - b.t.getTime())
    let cur = 0
    let max = 0
    sorted.forEach(m => {
      if (m.w) {
        cur += 1
        if (cur > max) max = cur
      } else cur = 0
    })
    return {
      userId: s.userId,
      name: s.name,
      place: 0,
      matchesPlayed: s.wins + s.losses,
      wins: s.wins,
      losses: s.losses,
      totalAddedPoints: s.totalAddedPoints,
      finalScore: 0,
      longestWinStreak: max,
    }
  })

  const avgMatches =
    rows.length > 0 ? rows.reduce((a, r) => a + r.matchesPlayed, 0) / rows.length : 0

  rows.forEach(r => {
    const baseScore = r.wins * 2 + (stats[r.userId].rating ?? 1000) * 0.1
    let normAdded = r.totalAddedPoints
    if (r.matchesPlayed > avgMatches && avgMatches !== 0) {
      normAdded /= r.matchesPlayed / avgMatches
    }
    let final = baseScore + normAdded
    if (r.matchesPlayed < avgMatches) final *= 0.9
    r.finalScore = final
  })

  rows.sort((a, b) => b.finalScore - a.finalScore)
  rows.forEach((r, i) => (r.place = i + 1))
  return rows
}

export async function finalizeSeason(roomId: string): Promise<void> {
  const summary = await gatherStats(roomId)
  if (!summary.length) return

  const roomRef = doc(db, "rooms", roomId)
  const roomSnap = await getDoc(roomRef)
  if (!roomSnap.exists()) return
  const roomData = roomSnap.data()

  const entry = {
    dateFinished: new Date().toLocaleString("fi-FI"),
    roomId,
    roomName: roomData.name ?? "",
    summary,
    type: "seasonFinish",
  }

  const updatedMembers = (roomData.members ?? []).map((m: any) => {
    const row = summary.find(r => r.userId === m.userId)
    if (!row) return m
    return { ...m, wins: row.wins, losses: row.losses }
  })

  await updateDoc(roomRef, {
    seasonHistory: arrayUnion(entry),
    members: updatedMembers,
  })

  for (const r of summary) {
    const uRef = doc(db, "users", r.userId)
    await updateDoc(uRef, {
      achievements: arrayUnion({
        type: "seasonFinish",
        roomId,
        roomName: roomData.name ?? "",
        dateFinished: entry.dateFinished,
        ...r,
      }),
    })
  }
}
