/*
  Global leaderboard table – shows players who share a room with the current user.
  Allows time-frame filtering (all / 365 / 180 / 90 / 30 / 7 days) and column sorting.
*/

"use client";

import {
  Button,
  Card, CardContent, CardDescription, CardHeader, CardTitle,
  ScrollArea, Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui";
import { useAuth } from "@/contexts/AuthContext";
import { db } from "@/lib/firebase";
import { collection, doc, getDoc, getDocs } from "firebase/firestore";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

interface PlayerStats {
  id: string;
  name: string;
  matchesPlayed: number;
  wins: number;
  losses: number;
  totalAddedPoints: number;
  longestWinStreak: number;
  finalScore: number;
  winRate: number;
  rank: number;
}

const TIME_FRAMES = [
  { label: "All Time", value: "all", info: "Includes every match" },
  { label: "365 days", value: "365", info: "Matches from the last year" },
  { label: "180 days", value: "180", info: "Matches from the last 6 months" },
  { label: "90 days",  value: "90",  info: "Matches from the last 3 months" },
  { label: "30 days",  value: "30",  info: "Matches from the last month" },
  { label: "7 days",   value: "7",   info: "Matches from the last week" },
] as const;

type SortKey =
  | "rank"
  | "name"
  | "matchesPlayed"
  | "wins"
  | "losses"
  | "winRate"
  | "totalAddedPoints"
  | "longestWinStreak";

export default function PlayersTable() {
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [players, setPlayers] = useState<any[]>([]);
  const [matches, setMatches] = useState<any[]>([]);

  const [timeFrame, setTimeFrame] =
    useState<(typeof TIME_FRAMES)[number]["value"]>("all");
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({
    key: "rank",
    dir: "asc",
  });

  /* ---------- helpers -------------------------------------------------- */
  const parseTimestamp = (ts: string): Date => {
    const [datePart, timePart] = ts.split(" ");
    if (!datePart || !timePart) return new Date(0);
    const [dd, MM, yyyy] = datePart.split(".").map(Number);
    const [hh, mm, ss] = timePart.split(".").map(Number);
    return new Date(yyyy, MM - 1, dd, hh, mm, ss);
  };

  const longestStreak = (
    userId: string,
    userName: string,
    list: any[]
  ): number => {
    const ordered = [...list].sort(
      (a, b) => a.timestamp.getTime() - b.timestamp.getTime()
    );
    let cur = 0,
      best = 0;
    for (const m of ordered) {
      const win =
        (m.player1Id === userId && m.winner === m.player1.name) ||
        (m.player2Id === userId && m.winner === m.player2.name);
      if (win) {
        cur += 1;
        best = Math.max(best, cur);
      } else cur = 0;
    }
    return best;
  };

  /* ---------- fetch ---------------------------------------------------- */
  const fetchPlayers = useCallback(async () => {
    if (!user) return;
    const mySnap = await getDoc(doc(db, "users", user.uid));
    const myRooms: string[] = mySnap.exists() ? mySnap.data().rooms || [] : [];
    if (!myRooms.length) return setPlayers([]);

    const plSnap = await getDocs(collection(db, "users"));
    const list = plSnap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((p: any) => (p.rooms || []).some((r: string) => myRooms.includes(r)));
    setPlayers(list);
  }, [user]);

  const fetchMatches = useCallback(async () => {
    const mSnap = await getDocs(collection(db, "matches"));
    setMatches(
      mSnap.docs.map((d) => {
        const data = d.data();
        return { id: d.id, ...data, timestamp: parseTimestamp(data.timestamp) };
      })
    );
  }, []);

  useEffect(() => {
    const loadAll = async () => {
      await Promise.all([fetchPlayers(), fetchMatches()]);
      setLoading(false);
    };
    loadAll();
  }, [fetchPlayers, fetchMatches]);

  /* ---------- statistics ---------------------------------------------- */
  const stats: PlayerStats[] = useMemo(() => {
    const now = new Date();
    const cutoff =
      timeFrame === "all"
        ? null
        : new Date(now.getTime() - Number(timeFrame) * 86_400_000);

    const relMatches = cutoff
      ? matches.filter((m) => m.timestamp >= cutoff && m.timestamp <= now)
      : matches;

    const base: Record<string, PlayerStats> = {};
    for (const p of players) {
      base[p.id] = {
        id: p.id,
        name: p.name,
        matchesPlayed: 0,
        wins: 0,
        losses: 0,
        totalAddedPoints: 0,
        longestWinStreak: 0,
        finalScore: 0,
        winRate: 0,
        rank: 0,
      };
    }

    /* accumulate */
    for (const m of relMatches) {
      const { player1, player2, winner, player1Id, player2Id } = m;
      if (base[player1Id]) {
        base[player1Id].matchesPlayed += 1;
        winner === player1.name
          ? base[player1Id].wins++
          : base[player1Id].losses++;
        base[player1Id].totalAddedPoints += player1.addedPoints ?? 0;
      }
      if (base[player2Id]) {
        base[player2Id].matchesPlayed += 1;
        winner === player2.name
          ? base[player2Id].wins++
          : base[player2Id].losses++;
        base[player2Id].totalAddedPoints += player2.addedPoints ?? 0;
      }
    }

    const list = Object.values(base);

    /* final calculations */
    const avgMatches =
      list.reduce((acc, p) => acc + p.matchesPlayed, 0) / (list.length || 1);

    for (const p of list) {
      p.longestWinStreak = longestStreak(p.id, p.name, relMatches);
      const rawScore =
        p.wins * 2 + p.totalAddedPoints + p.longestWinStreak * 2;
      p.winRate = p.matchesPlayed ? (p.wins / p.matchesPlayed) * 100 : 0;

      if (p.matchesPlayed === 0) {
        p.finalScore = -1;
      } else if (p.matchesPlayed < avgMatches) {
        p.finalScore = rawScore * 0.9;
      } else {
        p.finalScore = rawScore;
      }
    }

    /* first—игроки с матчами, потом без */
    const withMatches = list.filter((p) => p.matchesPlayed > 0);
    const noMatches   = list.filter((p) => p.matchesPlayed === 0);

    withMatches.sort(
      (a, b) => b.finalScore - a.finalScore || a.name.localeCompare(b.name)
    );
    noMatches.sort((a, b) => a.name.localeCompare(b.name));

    const ordered = [...withMatches, ...noMatches];
    ordered.forEach((p, i) => (p.rank = i + 1));
    return ordered;
  }, [players, matches, timeFrame]);

  /* ---------- sorting -------------------------------------------------- */
  const sortedStats = useMemo(() => {
    const arr = [...stats];
    const { key, dir } = sort;
    const mult = dir === "asc" ? 1 : -1;

    arr.sort((a, b) => {
      if (key === "name") return a.name.localeCompare(b.name) * mult;
      if (key === "rank") {
        return (a.rank - b.rank) * mult || a.name.localeCompare(b.name);
      }
      const diff = a[key] - b[key];
      return diff === 0 ? a.name.localeCompare(b.name) : diff * mult;
    });

    if (key !== "rank") {
      arr.forEach((p, i) => (p.rank = i + 1));
    }
    return arr;
  }, [stats, sort]);

  const toggleSort = (k: SortKey) =>
    setSort((s) => ({
      key: k,
      dir: s.key === k && s.dir === "asc" ? "desc" : "asc",
    }));

  /* ---------- render helpers ------------------------------------------ */
  const header = (
    k: SortKey,
    label: string,
    tooltip: string
  ): JSX.Element => (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <th
            onClick={() => toggleSort(k)}
            className="py-3 px-4 bg-muted text-left text-xs font-medium uppercase tracking-wide cursor-pointer select-none"
          >
            {label} {sort.key === k ? (sort.dir === "asc" ? "↑" : "↓") : "↕"}
          </th>
        </TooltipTrigger>
        <TooltipContent>{tooltip}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );

  /* ---------- UI ------------------------------------------------------- */
  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <div className="animate-spin h-12 w-12 rounded-full border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <Card className="mt-16">
      <CardHeader>
        <CardTitle className="text-2xl">Leaderboard</CardTitle>
        <CardDescription>Players who share a room with you</CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        <div className="flex flex-wrap gap-2">
          {TIME_FRAMES.map((t) => (
            <TooltipProvider key={t.value}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="sm"
                    variant={timeFrame === t.value ? "default" : "outline"}
                    onClick={() => setTimeFrame(t.value)}
                  >
                    {t.label}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{t.info}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ))}
        </div>

        <ScrollArea className="h-[500px] overflow-auto border rounded-md">
          <Table>
            <TableHeader>
              <TableRow>
                {header("rank", "Rank", "Calculated by final score")}
                {header("name", "Name", "Player")}
                {header("matchesPlayed", "Matches", "Total matches")}
                {header("wins", "Wins", "Matches won")}
                {header("losses", "Losses", "Matches lost")}
                {header("winRate", "Win %", "Win percentage")}
                {header("totalAddedPoints", "+Pts", "Total added points")}
                {header("longestWinStreak", "Longest WS", "Longest win streak")}
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedStats.map((p) => (
                <TableRow key={p.id} className="hover:bg-muted/50">
                  <TableCell>{p.rank}</TableCell>
                  <TableCell>
                    <Link
                      href={`/profile/${p.id}`}
                      className="text-primary hover:underline"
                    >
                      {p.name}
                    </Link>
                  </TableCell>
                  <TableCell>{p.matchesPlayed}</TableCell>
                  <TableCell>{p.wins}</TableCell>
                  <TableCell>{p.losses}</TableCell>
                  <TableCell>{p.winRate.toFixed(2)}%</TableCell>
                  <TableCell>{p.totalAddedPoints}</TableCell>
                  <TableCell>{p.longestWinStreak}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}