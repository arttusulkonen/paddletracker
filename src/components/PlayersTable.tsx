'use client';

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
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
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/lib/firebase';
import { UserProfile } from '@/lib/types';
import {
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  where,
} from 'firebase/firestore';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

// Типы для двух разных представлений
type GlobalPlayerRank = UserProfile & { rankNum: number };
interface CirclePlayerStats {
  id: string;
  name: string;
  photoURL?: string | null;
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

export default function PlayersTable() {
  const { t } = useTranslation();
  const { user } = useAuth();

  const [view, setView] = useState<'global' | 'circle'>(
    user ? 'circle' : 'global'
  );
  const [loading, setLoading] = useState(true);

  // Состояния для каждого вида
  const [globalPlayers, setGlobalPlayers] = useState<GlobalPlayerRank[]>([]);
  const [circlePlayers, setCirclePlayers] = useState<any[]>([]);
  const [circleMatches, setCircleMatches] = useState<any[]>([]);

  // Состояния для фильтров "My Circles"
  const [timeFrame, setTimeFrame] =
    useState<(typeof TIME_FRAMES)[number]['value']>('all');
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({
    key: 'rank',
    dir: 'asc',
  });

  // --- Логика для "Global Ranking" ---
  const fetchGlobalData = useCallback(async () => {
    setLoading(true);
    try {
      if (!db) throw new Error('Firestore not initialized');
      const usersQuery = query(
        collection(db, 'users'),
        where('isPublic', '==', true),
        where('isDeleted', '!=', true),
        orderBy('globalElo', 'desc'),
        limit(100)
      );
      const usersSnap = await getDocs(usersQuery);
      const rankedPlayers = usersSnap.docs.map((doc, index) => ({
        ...(doc.data() as UserProfile),
        uid: doc.id,
        rankNum: index + 1,
      }));
      setGlobalPlayers(rankedPlayers);
    } catch (error) {
      console.error('Error fetching global players:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  // --- Логика для "My Circles" (ваш оригинальный код) ---
  const parseTimestamp = (ts: string): Date => {
    if (!ts) return new Date(0);
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

  const fetchCircleData = useCallback(async () => {
    if (!user || !db) {
      setCirclePlayers([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const roomSnap = await getDocs(
        query(
          collection(db, 'rooms'),
          where('memberIds', 'array-contains', user.uid)
        )
      );
      const myRoomIds = roomSnap.docs.map((d) => d.id);
      const membersSet = new Set<string>();
      roomSnap.docs.forEach((d) => {
        const memberIds: string[] = d.data().memberIds ?? [];
        memberIds.forEach((id) => membersSet.add(id));
      });

      if (membersSet.size === 0) {
        setCirclePlayers([]);
        setLoading(false);
        return;
      }

      const usersSnap = await getDocs(collection(db, 'users'));
      const pl = usersSnap.docs
        .filter((doc) => membersSet.has(doc.id) && !doc.data().isDeleted)
        .map((doc) => {
          const data = doc.data();
          return {
            id: doc.id,
            name: data.displayName ?? data.name ?? data.email ?? t('Unknown'),
            ...data,
          };
        });
      setCirclePlayers(pl);

      const matchSnap = await getDocs(collection(db, 'matches'));
      const ms = matchSnap.docs
        .map((d) => {
          const data = d.data();
          return {
            id: d.id,
            ...data,
            timestamp: parseTimestamp(data.timestamp),
          };
        })
        .filter(
          (m) =>
            myRoomIds.includes(m.roomId) &&
            membersSet.has(m.player1Id) &&
            membersSet.has(m.player2Id)
        );
      setCircleMatches(ms);
    } catch (error) {
      console.error('Error fetching circle data:', error);
    } finally {
      setLoading(false);
    }
  }, [user, t]);

  useEffect(() => {
    if (view === 'global') {
      fetchGlobalData();
    } else {
      fetchCircleData();
    }
  }, [view, fetchGlobalData, fetchCircleData]);

  const circleStats: CirclePlayerStats[] = useMemo(() => {
    if (loading || view !== 'circle') return [];

    const now = new Date();
    const cutoff =
      timeFrame === 'all'
        ? null
        : new Date(now.getTime() - Number(timeFrame) * 86_400_000);

    const relMatches = cutoff
      ? circleMatches.filter((m) => m.timestamp >= cutoff && m.timestamp <= now)
      : circleMatches;

    const base: Record<string, CirclePlayerStats> = {};
    for (const p of circlePlayers) {
      base[p.id] = {
        id: p.id,
        name: p.name,
        photoURL: p.photoURL,
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
  }, [circlePlayers, circleMatches, timeFrame, loading, view]);

  const sortedCircleStats = useMemo(() => {
    const arr = [...circleStats];
    const { key, dir } = sort;
    const mult = dir === 'asc' ? 1 : -1;

    arr.sort((a, b) => {
      if (key === 'name')
        return safeName(a.name).localeCompare(safeName(b.name)) * mult;
      if (key === 'rank')
        return (
          (a.rank - b.rank) * mult ||
          safeName(a.name).localeCompare(safeName(b.name))
        );
      const diff = (a as any)[key] - (b as any)[key];
      return diff === 0
        ? safeName(a.name).localeCompare(safeName(b.name))
        : diff * mult;
    });

    if (key !== 'rank') arr.forEach((p, i) => (p.rank = i + 1));
    return arr;
  }, [circleStats, sort]);

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
            className='py-3 px-4 bg-muted text-left text-xs font-medium uppercase tracking-wide cursor-pointer select-none'
          >
            {label} {sort.key === k ? (sort.dir === 'asc' ? '↑' : '↓') : '↕'}
          </th>
        </TooltipTrigger>
        <TooltipContent>{tip}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className='text-2xl'>{t('Leaderboard')}</CardTitle>
        <CardDescription>
          {view === 'global'
            ? t('Global ranking of all public players.')
            : t('Ranking based on performance in rooms you are part of.')}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs
          value={view}
          onValueChange={(value) => setView(value as 'global' | 'circle')}
        >
          <TabsList className='grid w-full grid-cols-2'>
            <TabsTrigger value='global'>{t('Global Ranking')}</TabsTrigger>
            <TabsTrigger value='circle'>{t('My Circles')}</TabsTrigger>
          </TabsList>

          <TabsContent value='global' className='mt-4'>
            {loading ? (
              <div className='flex justify-center py-16'>
                <div className='animate-spin h-12 w-12 rounded-full border-b-2 border-primary' />
              </div>
            ) : (
              <ScrollArea className='h-[600px]'>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className='w-[50px]'>#</TableHead>
                      <TableHead>{t('Player')}</TableHead>
                      <TableHead className='text-right'>
                        {t('Global ELO')}
                      </TableHead>
                      <TableHead className='text-right'>{t('W / L')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {globalPlayers.map((p) => (
                      <TableRow key={p.uid}>
                        <TableCell className='font-medium'>
                          {p.rankNum}
                        </TableCell>
                        <TableCell>
                          <div className='flex items-center gap-3'>
                            <Avatar className='h-9 w-9'>
                              <AvatarImage src={p.photoURL ?? undefined} />
                              <AvatarFallback>
                                {p.name?.[0] ?? '?'}
                              </AvatarFallback>
                            </Avatar>
                            <Link
                              href={`/profile/${p.uid}`}
                              className='font-medium hover:underline'
                            >
                              {p.name ?? t('Unknown Player')}
                            </Link>
                          </div>
                        </TableCell>
                        <TableCell className='text-right font-bold text-primary'>
                          {p.globalElo?.toFixed(0) ?? '1000'}
                        </TableCell>
                        <TableCell className='text-right text-muted-foreground'>
                          {p.wins ?? 0} / {p.losses ?? 0}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>
            )}
          </TabsContent>

          <TabsContent value='circle' className='mt-4'>
            {loading ? (
              <div className='flex justify-center py-16'>
                <div className='animate-spin h-12 w-12 rounded-full border-b-2 border-primary' />
              </div>
            ) : (
              <>
                <div className='flex flex-wrap gap-2 mb-4'>
                  {TIME_FRAMES.map((tf) => (
                    <TooltipProvider key={tf.value}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            size='sm'
                            variant={
                              timeFrame === tf.value ? 'default' : 'outline'
                            }
                            onClick={() => setTimeFrame(tf.value)}
                          >
                            {t(tf.label)}
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>{t(tf.info)}</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  ))}
                </div>
                <ScrollArea className='h-[520px]'>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        {header('rank', t('#'), t('Calculated by final score'))}
                        {header('name', t('Name'), t('Player'))}
                        {header(
                          'matchesPlayed',
                          t('Matches'),
                          t('Total matches')
                        )}
                        {header('wins', t('Wins'), t('Matches won'))}
                        {header('losses', t('Losses'), t('Matches lost'))}
                        {header('winRate', t('Win %'), t('Win percentage'))}
                        {header(
                          'totalAddedPoints',
                          t('+Pts'),
                          t('Total added points')
                        )}
                        {header(
                          'longestWinStreak',
                          t('Longest WS'),
                          t('Longest win streak')
                        )}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sortedCircleStats.map((p) => (
                        <TableRow key={p.id} className='hover:bg-muted/50'>
                          <TableCell>{p.rank}</TableCell>
                          <TableCell>
                            <div className='flex items-center gap-3'>
                              <Avatar className='h-9 w-9'>
                                <AvatarImage src={p.photoURL ?? undefined} />
                                <AvatarFallback>
                                  {p.name?.[0] ?? '?'}
                                </AvatarFallback>
                              </Avatar>
                              <Link
                                href={`/profile/${p.id}`}
                                className='text-primary hover:underline'
                              >
                                {p.name}
                              </Link>
                            </div>
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
              </>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
