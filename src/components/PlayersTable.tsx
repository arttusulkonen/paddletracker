'use client';

import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  ScrollArea,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/lib/firebase';
import {
  collection,
  getDocs,
  query,
  where,
} from 'firebase/firestore';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';

/* -------------------------------------------------------------------------- */
/*  Types                                                                     */
/* -------------------------------------------------------------------------- */
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
  { label: 'All Time', value: 'all', info: 'Includes every match' },
  { label: '365 days', value: '365', info: 'Matches from the last year' },
  { label: '180 days', value: '180', info: 'Matches from the last 6 months' },
  { label: '90 days', value: '90', info: 'Matches from the last 3 months' },
  { label: '30 days', value: '30', info: 'Matches from the last month' },
  { label: '7 days', value: '7', info: 'Matches from the last week' },
] as const;

type SortKey =
  | 'rank'
  | 'name'
  | 'matchesPlayed'
  | 'wins'
  | 'losses'
  | 'winRate'
  | 'totalAddedPoints'
  | 'longestWinStreak';

/* -------------------------------------------------------------------------- */
/*  Component                                                                 */
/* -------------------------------------------------------------------------- */
export default function PlayersTable() {
  const { user } = useAuth();

  /* ---------------- state ---------------- */
  const [loading, setLoading] = useState(true);
  const [players, setPlayers] = useState<any[]>([]);
  const [matches, setMatches] = useState<any[]>([]);

  const [timeFrame, setTimeFrame] =
    useState<(typeof TIME_FRAMES)[number]['value']>('all');
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({
    key: 'rank',
    dir: 'asc',
  });

  /* ---------------------------------------------------------------------- */
  /*  Helpers                                                                */
  /* ---------------------------------------------------------------------- */
  const parseTimestamp = (ts: string): Date => {
    const [datePart, timePart] = ts.split(' ');
    if (!datePart || !timePart) return new Date(0);
    const [dd, MM, yyyy] = datePart.split('.').map(Number);
    const [hh, mm, ss] = timePart.split('.').map(Number);
    return new Date(yyyy, MM - 1, dd, hh, mm, ss);
  };

  const longestStreak = (uid: string, list: any[]): number => {
    const ordered = list
      .slice()
      .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    let cur = 0,
      best = 0;
    for (const m of ordered) {
      const win =
        (m.player1Id === uid && m.winner === m.player1.name) ||
        (m.player2Id === uid && m.winner === m.player2.name);
      win ? (best = Math.max(best, ++cur)) : (cur = 0);
    }
    return best;
  };

  const safeName = (n: string) => n ?? '';

  /* ---------------------------------------------------------------------- */
  /*  Fetch players + matches                                                */
  /* ---------------------------------------------------------------------- */
  const loadData = useCallback(async () => {
    if (!user) return;

    /* 1. Rooms with the current user */
    const roomSnap = await getDocs(
      query(collection(db, 'rooms'), where('memberIds', 'array-contains', user.uid))
    );
    const myRoomIds = roomSnap.docs.map((d) => d.id);

    /* 2. Set of all member uids */
    const membersSet = new Set<string>();
    roomSnap.docs.forEach((d) => {
      const memberIds: string[] =
        d.data().memberIds ??
        (d.data().members || []).map((m: any) => m.userId);
      memberIds.forEach((id) => membersSet.add(id));
    });

    /* 3. Users */
    const usersSnap = await getDocs(collection(db, 'users'));
    const pl = usersSnap.docs
      .filter((doc) => membersSet.has(doc.id))
      .map((doc) => {
        const data = doc.data();
        return {
          id: doc.id,
          name:
            data.displayName ??
            data.name ??
            data.email ??
            'Unknown',
          ...data,
        };
      });
    setPlayers(pl);

    /* 4. Matches from those rooms */
    const matchSnap = await getDocs(collection(db, 'matches'));
    const ms = matchSnap.docs
      .map((d) => {
        const data = d.data();
        return { id: d.id, ...data, timestamp: parseTimestamp(data.timestamp) };
      })
      .filter(
        (m) =>
          myRoomIds.includes(m.roomId) &&
          membersSet.has(m.player1Id) &&
          membersSet.has(m.player2Id)
      );
    setMatches(ms);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  /* ---------------------------------------------------------------------- */
  /*  Statistics                                                             */
  /* ---------------------------------------------------------------------- */
  const stats: PlayerStats[] = useMemo(() => {
    if (loading) return [];

    const now = new Date();
    const cutoff =
      timeFrame === 'all'
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
        finalScore: -Infinity,
        winRate: 0,
        rank: 0,
      };
    }

    for (const m of relMatches) {
      const { player1, player2, winner, player1Id, player2Id } = m;
      if (base[player1Id]) {
        base[player1Id].matchesPlayed++;
        winner === player1.name
          ? base[player1Id].wins++
          : base[player1Id].losses++;
        base[player1Id].totalAddedPoints += player1.addedPoints ?? 0;
      }
      if (base[player2Id]) {
        base[player2Id].matchesPlayed++;
        winner === player2.name
          ? base[player2Id].wins++
          : base[player2Id].losses++;
        base[player2Id].totalAddedPoints += player2.addedPoints ?? 0;
      }
    }

    const list = Object.values(base);

    const avgMatches =
      list.reduce((acc, p) => acc + p.matchesPlayed, 0) / (list.length || 1);

    for (const p of list) {
      if (p.matchesPlayed === 0) continue;
      p.longestWinStreak = longestStreak(p.id, relMatches);
      const raw = p.wins * 2 + p.totalAddedPoints + p.longestWinStreak * 2;
      p.winRate = (p.wins / p.matchesPlayed) * 100;
      p.finalScore = p.matchesPlayed < avgMatches ? raw * 0.9 : raw;
    }

    list.sort(
      (a, b) =>
        b.finalScore - a.finalScore ||
        safeName(a.name).localeCompare(safeName(b.name))
    );

    list.forEach((p, i) => (p.rank = i + 1));
    return list;
  }, [players, matches, timeFrame, loading]);

  /* ---------------------------------------------------------------------- */
  /*  Sorting UI                                                             */
  /* ---------------------------------------------------------------------- */
  const sortedStats = useMemo(() => {
    const arr = [...stats];
    const { key, dir } = sort;
    const mult = dir === 'asc' ? 1 : -1;

    arr.sort((a, b) => {
      if (key === 'name')
        return safeName(a.name).localeCompare(safeName(b.name)) * mult;
      if (key === 'rank')
        return (a.rank - b.rank) * mult ||
          safeName(a.name).localeCompare(safeName(b.name));
      const diff = (a as any)[key] - (b as any)[key];
      return diff === 0
        ? safeName(a.name).localeCompare(safeName(b.name))
        : diff * mult;
    });

    if (key !== 'rank') arr.forEach((p, i) => (p.rank = i + 1));
    return arr;
  }, [stats, sort]);

  const toggleSort = (k: SortKey) =>
    setSort((s) => ({
      key: k,
      dir: s.key === k && s.dir === 'asc' ? 'desc' : 'asc',
    }));

  const header = (k: SortKey, label: string, tip: string) => (
    <TooltipProvider key={k}>
      <Tooltip>
        <TooltipTrigger asChild>
          <th
            onClick={() => toggleSort(k)}
            className="py-3 px-4 bg-muted text-left text-xs font-medium uppercase tracking-wide cursor-pointer select-none"
          >
            {label} {sort.key === k ? (sort.dir === 'asc' ? '↑' : '↓') : '↕'}
          </th>
        </TooltipTrigger>
        <TooltipContent>{tip}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <div className="animate-spin h-12 w-12 rounded-full border-b-2 border-primary" />
      </div>
    );
  }

  /* ---------------------------------------------------------------------- */
  /*  UI                                                                     */
  /* ---------------------------------------------------------------------- */
  return (
    <>
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
                      variant={timeFrame === t.value ? 'default' : 'outline'}
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
                  {header('rank', '#', 'Calculated by final score')}
                  {header('name', 'Name', 'Player')}
                  {header('matchesPlayed', 'Matches', 'Total matches')}
                  {header('wins', 'Wins', 'Matches won')}
                  {header('losses', 'Losses', 'Matches lost')}
                  {header('winRate', 'Win %', 'Win percentage')}
                  {header('totalAddedPoints', '+Pts', 'Total added points')}
                  {header('longestWinStreak', 'Longest WS', 'Longest win streak')}
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

      <Card className="mt-6 bg-muted/50">
        <CardHeader>
          <CardTitle className="text-lg">How rankings are calculated</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <p>
            The <strong>final score</strong> for each player is calculated as
            follows:
          </p>
          <ul className="list-disc list-inside space-y-1">
            <li>
              <strong>Wins:</strong> every win gives <strong>+2 pts</strong>.
            </li>
            <li>
              <strong>Total Added Points:</strong> bonus points earned in
              matches are added in full.
            </li>
            <li>
              <strong>Longest Win Streak:</strong> each win in your longest
              streak adds <strong>+2 pts</strong>.
            </li>
            <li>
              <strong>Low participation penalty:</strong> if you played fewer
              matches than the room average, the raw score is reduced by{' '}
              <strong>10 %</strong>.
            </li>
          </ul>
          <p>
            Players are sorted by the final score (higher → better). Ties are
            resolved alphabetically.
          </p>
        </CardContent>
      </Card>
    </>
  );
}