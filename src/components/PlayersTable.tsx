
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
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/lib/firebase';
import {
  collection,
  getDocs,
  query,
  where,
  Timestamp, // Import Timestamp for type checking
} from 'firebase/firestore';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Settings2 } from 'lucide-react'; // For sort icon

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
  globalElo: number; // Added for display
}

const TIME_FRAMES = [
  { label: 'All Time', value: 'all', info: 'Includes every match in rooms you are part of' },
  { label: 'Last 365 days', value: '365', info: 'Matches from the last year' },
  { label: 'Last 180 days', value: '180', info: 'Matches from the last 6 months' },
  { label: 'Last 90 days', value: '90', info: 'Matches from the last 3 months' },
  { label: 'Last 30 days', value: '30', info: 'Matches from the last month' },
  { label: 'Last 7 days', value: '7', info: 'Matches from the last week' },
] as const;

type SortKey =
  | 'rank'
  | 'name'
  | 'matchesPlayed'
  | 'wins'
  | 'losses'
  | 'winRate'
  | 'totalAddedPoints'
  | 'longestWinStreak'
  | 'globalElo'; // Added globalElo for sorting

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
    key: 'globalElo', // Default sort by ELO descending
    dir: 'desc',
  });

  /* ---------------------------------------------------------------------- */
  /*  Helpers                                                                */
  /* ---------------------------------------------------------------------- */
  const parseTimestamp = (tsInput: string | Timestamp): Date => {
    if (typeof tsInput === 'string') {
      const [datePart, timePart] = tsInput.split(' ');
      if (!datePart || !timePart) return new Date(0); // Invalid string format
      const [dd, MM, yyyy] = datePart.split('.').map(Number);
      const [hh, mm, ss] = timePart.split('.').map(Number);
      if (isNaN(dd) || isNaN(MM) || isNaN(yyyy) || isNaN(hh) || isNaN(mm) || isNaN(ss)) {
        return new Date(0); // Invalid numbers after split
      }
      return new Date(yyyy, MM - 1, dd, hh, mm, ss);
    } else if (tsInput && typeof tsInput.toDate === 'function') {
      // Handle Firestore Timestamp
      return tsInput.toDate();
    }
    return new Date(0); // Fallback for other invalid inputs
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

  const safeName = (n: string | undefined | null) => n ?? ''; // Handle potential null/undefined

  /* ---------------------------------------------------------------------- */
  /*  Fetch players + matches                                                */
  /* ---------------------------------------------------------------------- */
  const loadData = useCallback(async () => {
    if (!user) {
      setLoading(false); // Ensure loading stops if no user
      return;
    }
    setLoading(true); // Start loading

    /* 1. Rooms with the current user */
    const roomSnap = await getDocs(
      query(collection(db, 'rooms'), where('memberIds', 'array-contains', user.uid))
    );
    const myRoomIds = roomSnap.docs.map((d) => d.id);

    if (myRoomIds.length === 0) {
      setPlayers([]);
      setMatches([]);
      setLoading(false);
      return;
    }

    /* 2. Set of all member uids from these rooms */
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
      .filter((doc) => membersSet.has(doc.id)) // Only members of relevant rooms
      .map((doc) => {
        const data = doc.data();
        return {
          id: doc.id,
          name:
            data.displayName ??
            data.name ??
            data.email ??
            'Unknown',
          globalElo: data.globalElo ?? 1000, // Include globalElo
          ...data,
        };
      });
    setPlayers(pl);

    /* 4. Matches from those rooms */
    const matchSnap = await getDocs(query(collection(db, 'matches'), where('roomId', 'in', myRoomIds)));
    const ms = matchSnap.docs
      .map((d) => {
        const data = d.data();
        return { id: d.id, ...data, timestamp: parseTimestamp(data.timestamp) };
      })
      .filter( // Ensure matches are between known players from the selected rooms
        (m) =>
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
    if (loading || players.length === 0) return []; // Handle empty players early

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
        finalScore: 0, // Initialize final score
        winRate: 0,
        rank: 0, // Initialize rank
        globalElo: p.globalElo, // Use fetched globalElo
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

    const list = Object.values(base).filter(p => p.matchesPlayed > 0 || timeFrame === 'all'); // Filter out inactive unless 'All Time'

    const avgMatches = list.length > 0 ? list.reduce((acc, p) => acc + p.matchesPlayed, 0) / list.length : 0;


    for (const p of list) {
      p.winRate = p.matchesPlayed > 0 ? (p.wins / p.matchesPlayed) * 100 : 0;
      p.longestWinStreak = longestStreak(p.id, relMatches);
      
      // Revised finalScore calculation: ELO is primary, then tie-breakers
      // This uses globalElo as the main score component now.
      // Tie-breakers: win rate, then matches played, then points diff.
      let score = p.globalElo * 10000; // Heavily weight ELO
      score += p.winRate * 100;
      score += p.matchesPlayed;
      score += p.totalAddedPoints;
      // Low participation penalty might not be needed if ELO is the main factor.
      // If still desired: if (p.matchesPlayed < avgMatches && avgMatches > 0) score *= 0.95; 
      p.finalScore = score;
    }

    list.sort(
      (a, b) =>
        b.finalScore - a.finalScore || // Primary sort by calculated finalScore
        safeName(a.name).localeCompare(safeName(b.name)) // Alphabetical tie-breaker
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
      
      const valA = (a as any)[key];
      const valB = (b as any)[key];

      if (typeof valA === 'number' && typeof valB === 'number') {
        const diff = valA - valB;
        if (diff !== 0) return diff * mult;
      }
      // Fallback to ELO descending for ties, then name ascending
      if (b.globalElo !== a.globalElo) return (b.globalElo - a.globalElo);
      return safeName(a.name).localeCompare(safeName(b.name));
    });
    
    // Re-rank based on the current sort order if not sorting by rank itself
    if (key !== 'rank') {
        arr.forEach((p, i) => (p.rank = i + 1));
    } else { // If sorting by rank, ensure original rank logic is preserved for ties
         arr.sort((a, b) => (a.rank - b.rank) * mult || safeName(a.name).localeCompare(safeName(b.name)));
    }


    return arr;
  }, [stats, sort]);

  const toggleSort = (k: SortKey) =>
    setSort((s) => ({
      key: k,
      dir: s.key === k && s.dir === 'desc' ? 'asc' : 'desc', // Default to desc for most numerical, asc for name
    }));

  const header = (k: SortKey, label: string, tip: string, defaultDir: 'asc' | 'desc' = 'desc') => (
    <TableHead
      key={k}
      onClick={() => toggleSort(k)}
      className="py-2 sm:py-3 px-2 sm:px-4 bg-muted text-left text-xs font-medium uppercase tracking-wide cursor-pointer select-none whitespace-nowrap"
    >
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger className="flex items-center gap-1">
            {label} {sort.key === k ? (sort.dir === 'asc' ? '↑' : '↓') : <Settings2 className="h-3 w-3 opacity-30"/>}
          </TooltipTrigger>
          <TooltipContent>{tip}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </TableHead>
  );

  if (loading && !user) { // Only show full loader if user exists but data is loading
    return (
      <div className="flex justify-center py-12 sm:py-16">
        <div className="animate-spin h-10 w-10 sm:h-12 sm:w-12 rounded-full border-b-2 border-primary" />
      </div>
    );
  }
  if (!user) { // If no user, don't show the table or loader
    return null;
  }


  /* ---------------------------------------------------------------------- */
  /*  UI                                                                     */
  /* ---------------------------------------------------------------------- */
  return (
    <>
      <Card className="mt-8 sm:mt-12 md:mt-16 shadow-lg">
        <CardHeader className="p-4 sm:p-6">
          <CardTitle className="text-xl sm:text-2xl">Global Leaderboard</CardTitle>
          <CardDescription className="text-xs sm:text-sm">Players from rooms you are part of. Default sort by Global ELO.</CardDescription>
        </CardHeader>

        <CardContent className="space-y-4 sm:space-y-6 p-2 sm:p-4 md:p-6">
          <div className="block sm:hidden mb-3">
            <Label htmlFor="timeFrameSelectMobile" className="text-xs">Time Frame</Label>
            <Select value={timeFrame} onValueChange={(value) => setTimeFrame(value as typeof timeFrame)}>
              <SelectTrigger id="timeFrameSelectMobile" className="w-full h-9 text-xs">
                <SelectValue placeholder="Select time frame" />
              </SelectTrigger>
              <SelectContent>
                {TIME_FRAMES.map(t => (
                  <SelectItem key={t.value} value={t.value} className="text-xs">{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="hidden sm:flex flex-wrap gap-1 sm:gap-2">
            {TIME_FRAMES.map((t) => (
              <TooltipProvider key={t.value}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="xs"
                      sm={{ size: "sm" }}
                      variant={timeFrame === t.value ? 'default' : 'outline'}
                      onClick={() => setTimeFrame(t.value)}
                      className="text-xs whitespace-nowrap"
                    >
                      {t.label}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{t.info}</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            ))}
          </div>

          {loading ? (
             <div className="flex justify-center py-12 sm:py-16">
                <div className="animate-spin h-10 w-10 sm:h-12 sm:w-12 rounded-full border-b-2 border-primary" />
             </div>
          ) : sortedStats.length === 0 ? (
            <p className="text-center text-muted-foreground py-8 text-sm sm:text-base">No player data available for the selected time frame or you are not in any rooms yet.</p>
          ) : (
            <ScrollArea className="h-[400px] sm:h-[500px] w-full overflow-auto border rounded-md">
              <Table className="min-w-[700px] sm:min-w-full"> {/* Min width for horizontal scroll on small screens */}
                <TableHeader>
                  <TableRow>
                    {header('rank', '#', 'Overall Rank', 'asc')}
                    {header('name', 'Name', 'Player Name', 'asc')}
                    {header('globalElo', 'ELO', 'Global ELO Rating', 'desc')}
                    {header('matchesPlayed', 'MP', 'Matches Played', 'desc')}
                    {header('wins', 'W', 'Matches Won', 'desc')}
                    {header('losses', 'L', 'Matches Lost', 'desc')}
                    {header('winRate', 'Win %', 'Win Percentage', 'desc')}
                    {header('totalAddedPoints', '+Pts', 'Net ELO Change in Period', 'desc')}
                    {header('longestWinStreak', 'WS', 'Longest Win Streak', 'desc')}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedStats.map((p) => (
                    <TableRow key={p.id} className="hover:bg-muted/50 text-xs sm:text-sm">
                      <TableCell className="font-medium py-2 px-2 sm:px-4">{p.rank}</TableCell>
                      <TableCell className="py-2 px-2 sm:px-4">
                        <Link
                          href={`/profile/${p.id}`}
                          className="text-primary hover:underline font-medium"
                        >
                          {p.name}
                        </Link>
                      </TableCell>
                      <TableCell className="font-semibold py-2 px-2 sm:px-4">{p.globalElo}</TableCell>
                      <TableCell className="py-2 px-2 sm:px-4">{p.matchesPlayed}</TableCell>
                      <TableCell className="py-2 px-2 sm:px-4">{p.wins}</TableCell>
                      <TableCell className="py-2 px-2 sm:px-4">{p.losses}</TableCell>
                      <TableCell className="py-2 px-2 sm:px-4">{p.winRate.toFixed(1)}%</TableCell>
                      <TableCell className={`py-2 px-2 sm:px-4 ${p.totalAddedPoints >= 0 ? 'text-accent' : 'text-destructive'}`}>{p.totalAddedPoints > 0 ? `+${p.totalAddedPoints}` : p.totalAddedPoints}</TableCell>
                      <TableCell className="py-2 px-2 sm:px-4">{p.longestWinStreak}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      <Card className="mt-4 sm:mt-6 bg-muted/30 dark:bg-muted/20">
        <CardHeader className="p-3 sm:p-4">
          <CardTitle className="text-sm sm:text-base">Leaderboard Notes</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-xs sm:text-sm p-3 sm:p-4 pt-0">
          <p>
            This leaderboard shows players from all rooms you are currently a member of.
          </p>
          <ul className="list-disc list-inside space-y-1 text-muted-foreground">
            <li><strong>ELO:</strong> Current Global ELO. This is the primary sorting factor by default.</li>
            <li><strong>MP:</strong> Matches Played in the selected time frame.</li>
            <li><strong>+Pts:</strong> Net ELO points gained/lost from matches in the selected time frame.</li>
            <li><strong>WS:</strong> Longest Win Streak in the selected time frame.</li>
            <li>Rank (#) is recalculated based on the current sort criteria.</li>
          </ul>
        </CardContent>
      </Card>
    </>
  );
}

