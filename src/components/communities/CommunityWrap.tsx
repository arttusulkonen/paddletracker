// src/components/communities/CommunityWrap.tsx
'use client';

import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui';
import { useSport } from '@/contexts/SportContext';
import { db } from '@/lib/firebase';
import type { Community, Match } from '@/lib/types';
import {
	collection,
	documentId,
	getDocs,
	query,
	where,
} from 'firebase/firestore';
import {
	ArrowDown,
	ArrowUp,
	Award,
	Calendar,
	Flame,
	Globe,
	LineChart as LineChartIcon,
	Swords,
	TrendingUp,
	Trophy,
	Zap,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
	Bar,
	BarChart,
	CartesianGrid,
	ResponsiveContainer,
	Tooltip,
	XAxis,
} from 'recharts';

interface CommunityWrapProps {
  community: Community;
}

function parseDateSafe(input: any): number {
  if (!input) return NaN;
  if (typeof input === 'object' && input.toDate)
    return input.toDate().getTime();
  if (typeof input === 'number') return input;

  const str = String(input).trim();
  if (str.includes('T') || str.includes('-')) {
    const ts = Date.parse(str);
    if (!isNaN(ts)) return ts;
  }
  const match = str.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  if (match) {
    const d = parseInt(match[1], 10);
    const m = parseInt(match[2], 10) - 1;
    const y = parseInt(match[3], 10);
    const date = new Date(y, m, d);
    return date.getTime();
  }
  return NaN;
}

function formatShortDate(ts: number): string {
  if (!ts) return '';
  const d = new Date(ts);
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

type PlayerStat = {
  id: string;
  name: string;
  matches: number;
  wins: number;
  winRate: number;
  longestStreak: number;
  streakPeriod: string;
  // ELO
  startElo: number;
  endElo: number;
  eloDiff: number;
};

type RivalryStat = {
  p1: string;
  p2: string;
  count: number;
  p1Wins: number;
  p2Wins: number;
};

type UpsetStat = {
  winner: string;
  loser: string;
  diff: number;
  score: string;
  date: string;
};

type CommunityStats = {
  totalMatches: number;
  totalPlayers: number;

  topPlayers: PlayerStat[]; // Most active
  bestPlayers: PlayerStat[]; // Best winrate
  topImprovers: PlayerStat[]; // Best ELO growth
  topRanked: PlayerStat[]; // Highest absolute ELO

  topRivalries: RivalryStat[];
  longestStreakPlayer: PlayerStat | null;
  biggestUpset: UpsetStat | null;
  busiestMonthIndex: number;
  matchesByMonth: number[];
  matchesByDay: number[];
};

export function CommunityWrap({ community }: CommunityWrapProps) {
  const { t } = useTranslation();
  const { config } = useSport();

  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<CommunityStats | null>(null);
  const [availableYears, setAvailableYears] = useState<number[]>([currentYear]);

  // 1. Determine available years
  useEffect(() => {
    const calculateYears = async () => {
      if (!community.roomIds || community.roomIds.length === 0) return;

      try {
        let startYear = currentYear;
        const chunk = <T,>(arr: T[], size: number) =>
          Array.from({ length: Math.ceil(arr.length / size) }, (_, i) =>
            arr.slice(i * size, i * size + size)
          );
        const roomChunks = chunk(community.roomIds, 10);

        for (const ids of roomChunks) {
          const q = query(
            collection(db!, config.collections.rooms),
            where(documentId(), 'in', ids)
          );
          const snap = await getDocs(q);
          snap.forEach((doc) => {
            const data = doc.data();
            const ts = parseDateSafe(data.createdAt || data.roomCreated);
            if (!isNaN(ts)) {
              const y = new Date(ts).getFullYear();
              if (y < startYear) startYear = y;
            }
          });
        }
        const years = [];
        for (let y = currentYear; y >= startYear; y--) {
          years.push(y);
        }
        setAvailableYears(years);
      } catch (e) {
        console.error(e);
      }
    };
    calculateYears();
  }, [community, currentYear, config.collections.rooms]);

  // 2. Fetch Stats
  useEffect(() => {
    const fetchStats = async () => {
      if (!community.roomIds || community.roomIds.length === 0) {
        setStats(null);
        return;
      }

      setLoading(true);
      try {
        const chunk = <T,>(arr: T[], size: number) =>
          Array.from({ length: Math.ceil(arr.length / size) }, (_, i) =>
            arr.slice(i * size, i * size + size)
          );

        const roomChunks = chunk(community.roomIds, 10);
        const allMatches: Match[] = [];

        for (const ids of roomChunks) {
          const q = query(
            collection(db!, config.collections.matches),
            where('roomId', 'in', ids)
          );
          const snap = await getDocs(q);
          snap.forEach((doc) =>
            allMatches.push({ id: doc.id, ...doc.data() } as Match)
          );
        }

        // Sort chronologically
        allMatches.sort((a, b) => {
          const ta = parseDateSafe(a.tsIso || a.timestamp);
          const tb = parseDateSafe(b.tsIso || b.timestamp);
          return ta - tb;
        });

        const start = new Date(year, 0, 1).getTime();
        const end = new Date(year, 11, 31, 23, 59, 59).getTime();

        const yearMatches = allMatches.filter((m) => {
          const ts = parseDateSafe(m.tsIso || m.timestamp || m.createdAt);
          return ts >= start && ts <= end;
        });

        const playerMap = new Map<
          string,
          {
            name: string;
            wins: number;
            matches: number;
            losses: number;
            currentStreak: number;
            currentStreakStart: number;
            maxStreak: number;
            maxStreakStart: number;
            maxStreakEnd: number;
            startElo: number | null;
            endElo: number;
          }
        >();

        const rivalryMap = new Map<string, RivalryStat>();
        const matchesByMonth = new Array(12).fill(0);
        const matchesByDay = new Array(7).fill(0);

        let biggestUpset: UpsetStat | null = null;

        yearMatches.forEach((m) => {
          const ts = parseDateSafe(m.tsIso || m.timestamp || m.createdAt);
          if (!isNaN(ts)) {
            const d = new Date(ts);
            matchesByMonth[d.getMonth()]++;
            matchesByDay[d.getDay()]++;
          }

          const p1Id = m.player1Id;
          const p2Id = m.player2Id;
          if (!p1Id || !p2Id) return;

          const p1Name = m.player1?.name || 'Unknown';
          const p2Name = m.player2?.name || 'Unknown';
          const s1 = Number(m.player1.scores);
          const s2 = Number(m.player2.scores);

          const p1Win = s1 > s2;
          const p1Old = m.player1.oldRating;
          const p1New = m.player1.newRating;
          const p2Old = m.player2.oldRating;
          const p2New = m.player2.newRating;

          // Init players
          [p1Id, p2Id].forEach((pid, idx) => {
            if (!playerMap.has(pid)) {
              playerMap.set(pid, {
                name: idx === 0 ? p1Name : p2Name,
                wins: 0,
                matches: 0,
                losses: 0,
                currentStreak: 0,
                currentStreakStart: 0,
                maxStreak: 0,
                maxStreakStart: 0,
                maxStreakEnd: 0,
                startElo: null,
                endElo: 1000, // Fallback
              });
            }
          });

          const stats1 = playerMap.get(p1Id)!;
          const stats2 = playerMap.get(p2Id)!;

          // Set start ELO from FIRST match of year
          if (stats1.startElo === null && p1Old) stats1.startElo = p1Old;
          if (stats2.startElo === null && p2Old) stats2.startElo = p2Old;

          // Update end ELO on EVERY match
          if (p1New) stats1.endElo = p1New;
          if (p2New) stats2.endElo = p2New;

          if (stats1.name === 'Unknown' && p1Name !== 'Unknown')
            stats1.name = p1Name;
          if (stats2.name === 'Unknown' && p2Name !== 'Unknown')
            stats2.name = p2Name;

          stats1.matches++;
          stats2.matches++;

          if (p1Win) {
            stats1.wins++;
            stats2.losses++;
            stats1.currentStreak++;
            if (stats1.currentStreak === 1) stats1.currentStreakStart = ts;

            if (stats1.currentStreak > stats1.maxStreak) {
              stats1.maxStreak = stats1.currentStreak;
              stats1.maxStreakStart = stats1.currentStreakStart;
              stats1.maxStreakEnd = ts;
            }
            stats2.currentStreak = 0;
          } else {
            stats2.wins++;
            stats1.losses++;
            stats2.currentStreak++;
            if (stats2.currentStreak === 1) stats2.currentStreakStart = ts;

            if (stats2.currentStreak > stats2.maxStreak) {
              stats2.maxStreak = stats2.currentStreak;
              stats2.maxStreakStart = stats2.currentStreakStart;
              stats2.maxStreakEnd = ts;
            }
            stats1.currentStreak = 0;
          }

          // Rivalries
          const pairKey = [p1Id, p2Id].sort().join('_');
          const [sortedId1] = pairKey.split('_');
          const sortedP1Name = sortedId1 === p1Id ? p1Name : p2Name;
          const sortedP2Name = sortedId1 === p1Id ? p2Name : p1Name;

          if (!rivalryMap.has(pairKey)) {
            rivalryMap.set(pairKey, {
              p1: sortedP1Name,
              p2: sortedP2Name,
              count: 0,
              p1Wins: 0,
              p2Wins: 0,
            });
          }
          const rival = rivalryMap.get(pairKey)!;
          rival.count++;
          rival.p1 = sortedP1Name;
          rival.p2 = sortedP2Name;

          if ((sortedId1 === p1Id && p1Win) || (sortedId1 === p2Id && !p1Win)) {
            rival.p1Wins++;
          } else {
            rival.p2Wins++;
          }

          // Upset
          if (p1Old && p2Old) {
            const diff = Math.abs(p1Old - p2Old);
            const isUpset =
              (p1Win && p1Old < p2Old) || (!p1Win && p2Old < p1Old);
            if (isUpset) {
              if (diff > 50 && (!biggestUpset || diff > biggestUpset.diff)) {
                biggestUpset = {
                  winner: p1Win ? p1Name : p2Name,
                  loser: p1Win ? p2Name : p1Name,
                  diff,
                  score: `${s1}-${s2}`,
                  date: new Date(ts).toLocaleDateString(),
                };
              }
            }
          }
        });

        const playersArray: PlayerStat[] = Array.from(playerMap.entries()).map(
          ([id, val]) => ({
            id,
            name: val.name,
            matches: val.matches,
            wins: val.wins,
            losses: val.losses,
            winRate: val.matches > 0 ? (val.wins / val.matches) * 100 : 0,
            longestStreak: val.maxStreak,
            streakPeriod:
              val.maxStreak > 1
                ? `${formatShortDate(val.maxStreakStart)} - ${formatShortDate(
                    val.maxStreakEnd
                  )}`
                : '',
            startElo: val.startElo || 1000,
            endElo: val.endElo,
            eloDiff: val.endElo - (val.startElo || 1000),
          })
        );

        // --- SORTING LISTS ---

        // 1. Most Active
        const topActive = [...playersArray]
          .sort((a, b) => b.matches - a.matches)
          .slice(0, 10);

        // 2. Best Win Rate (10+ games)
        const topSkill = [...playersArray]
          .filter((p) => p.matches >= 10)
          .sort((a, b) => b.winRate - a.winRate)
          .slice(0, 10);

        // 3. Top Improvers (ELO Gain)
        const topImprovers = [...playersArray]
          .filter((p) => p.matches > 0)
          .sort((a, b) => b.eloDiff - a.eloDiff)
          .slice(0, 10);

        // 4. Global Ranking (Highest ELO at end of year)
        const topRanked = [...playersArray]
          .filter((p) => p.matches > 0)
          .sort((a, b) => b.endElo - a.endElo)
          .slice(0, 10);

        const topRivalries = Array.from(rivalryMap.values())
          .sort((a, b) => b.count - a.count)
          .slice(0, 5);

        const longestStreakPlayer =
          [...playersArray].sort(
            (a, b) => b.longestStreak - a.longestStreak
          )[0] || null;

        const busiestMonthIndex = matchesByMonth.indexOf(
          Math.max(...matchesByMonth)
        );

        setStats({
          totalMatches: yearMatches.length,
          totalPlayers: playersArray.length,
          topPlayers: topActive,
          bestPlayers: topSkill,
          topImprovers,
          topRanked,
          topRivalries,
          longestStreakPlayer,
          biggestUpset,
          matchesByMonth,
          matchesByDay,
          busiestMonthIndex,
        });
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, [community.roomIds, year, config.collections.matches]);

  const monthData = useMemo(() => {
    if (!stats) return [];
    const MONTHS = [
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec',
    ];
    return stats.matchesByMonth.map((count, i) => ({
      name: t(MONTHS[i]),
      count,
    }));
  }, [stats, t]);

  const dayData = useMemo(() => {
    if (!stats) return [];
    const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    return stats.matchesByDay.map((count, i) => ({
      name: t(DAYS[i]),
      count,
    }));
  }, [stats, t]);

  if (loading) {
    return (
      <div className='p-10 text-center text-muted-foreground'>
        {t('Crunching numbers...')}
      </div>
    );
  }

  if (!stats || stats.totalMatches === 0) {
    return (
      <div className='p-8 text-center border rounded-lg border-dashed bg-muted/10'>
        <div className='flex justify-center mb-4'>
          <Select
            value={String(year)}
            onValueChange={(v) => setYear(Number(v))}
          >
            <SelectTrigger className='w-[120px]'>
              <SelectValue placeholder={t('Year')} />
            </SelectTrigger>
            <SelectContent>
              {availableYears.map((y) => (
                <SelectItem key={y} value={String(y)}>
                  {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <p>{t('No matches found for this year.')}</p>
      </div>
    );
  }

  return (
    <div className='space-y-8 animate-in fade-in duration-500'>
      <div className='flex justify-between items-center'>
        <h2 className='text-2xl font-bold flex items-center gap-2'>
          <Trophy className='text-amber-500' />
          {t('Community Wrap')}
        </h2>
        <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
          <SelectTrigger className='w-[100px]'>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {availableYears.map((y) => (
              <SelectItem key={y} value={String(y)}>
                {y}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* HERO STATS */}
      <div className='grid grid-cols-1 md:grid-cols-3 gap-4'>
        <Card className='bg-primary/5 border-primary/20'>
          <CardHeader className='pb-2'>
            <CardTitle className='text-4xl font-black text-primary'>
              {stats.totalMatches}
            </CardTitle>
            <CardDescription className='uppercase font-bold tracking-wider'>
              {t('Total Matches')}
            </CardDescription>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className='pb-2'>
            <CardTitle className='text-4xl font-bold'>
              {stats.totalPlayers}
            </CardTitle>
            <CardDescription className='uppercase font-bold tracking-wider'>
              {t('Active Players')}
            </CardDescription>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className='pb-2'>
            <CardTitle className='text-lg font-bold flex items-center gap-2'>
              <Calendar className='h-5 w-5 text-blue-500' />
              {t('Peak Month')}
            </CardTitle>
            <CardDescription>
              {monthData[stats.busiestMonthIndex]?.name} (
              {stats.matchesByMonth[stats.busiestMonthIndex]} {t('games')})
            </CardDescription>
          </CardHeader>
        </Card>
      </div>

      {/* SPECIAL AWARDS */}
      <div className='grid grid-cols-1 md:grid-cols-2 gap-6'>
        {stats.longestStreakPlayer &&
          stats.longestStreakPlayer.longestStreak > 2 && (
            <Card className='bg-orange-50 dark:bg-orange-950/20 border-orange-200 dark:border-orange-900'>
              <CardHeader className='flex flex-row items-center gap-4'>
                <div className='p-3 bg-white dark:bg-orange-900 rounded-full shadow-sm'>
                  <Flame className='w-8 h-8 text-orange-500' />
                </div>
                <div>
                  <CardTitle className='text-xl'>
                    {t('Unstoppable Force')}
                  </CardTitle>
                  <CardDescription className='text-orange-700 dark:text-orange-400'>
                    {t('Longest winning streak of the year')}
                  </CardDescription>
                </div>
              </CardHeader>
              <CardContent>
                <div className='text-3xl font-black'>
                  {stats.longestStreakPlayer.name}
                </div>
                <div className='text-sm font-medium opacity-80 mt-1'>
                  {stats.longestStreakPlayer.longestStreak} {t('wins in a row')}
                </div>
                <div className='text-xs text-muted-foreground mt-1'>
                  ({stats.longestStreakPlayer.streakPeriod})
                </div>
              </CardContent>
            </Card>
          )}

        {stats.biggestUpset && (
          <Card className='bg-purple-50 dark:bg-purple-950/20 border-purple-200 dark:border-purple-900'>
            <CardHeader className='flex flex-row items-center gap-4'>
              <div className='p-3 bg-white dark:bg-purple-900 rounded-full shadow-sm'>
                <Zap className='w-8 h-8 text-purple-500' />
              </div>
              <div>
                <CardTitle className='text-xl'>{t('Giant Slayer')}</CardTitle>
                <CardDescription className='text-purple-700 dark:text-purple-400'>
                  {t('Biggest rating upset')}
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <div className='text-3xl font-black'>
                {stats.biggestUpset.winner}
              </div>
              <div className='text-sm font-medium opacity-80 mt-1'>
                {t('Defeated')} {stats.biggestUpset.loser}
              </div>
              <div className='flex items-center gap-2 mt-2 text-xs font-medium text-muted-foreground bg-white/50 dark:bg-black/20 p-2 rounded-lg w-fit'>
                <span className='text-purple-700 dark:text-purple-400'>
                  {t('Rating Diff')}: {Math.round(stats.biggestUpset.diff)}
                </span>
                <span className='opacity-50'>|</span>
                <span>{stats.biggestUpset.score}</span>
                <span className='opacity-50'>|</span>
                <span>{stats.biggestUpset.date}</span>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* RIVALRIES & CHARTS */}
      <div className='grid grid-cols-1 lg:grid-cols-2 gap-6'>
        <Card>
          <CardHeader>
            <CardTitle className='flex items-center gap-2'>
              <Swords className='h-5 w-5' /> {t('Top Rivalries')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className='space-y-4'>
              {stats.topRivalries.map((r, i) => (
                <div
                  key={i}
                  className='flex items-center justify-between p-3 bg-muted/30 rounded-lg'
                >
                  <div className='flex flex-col min-w-0'>
                    <span className='font-bold text-sm truncate'>
                      {r.p1} ({r.p1Wins}){' '}
                      <span className='text-muted-foreground text-xs font-normal'>
                        vs
                      </span>{' '}
                      {r.p2} ({r.p2Wins})
                    </span>
                    <div className='w-full bg-slate-200 dark:bg-slate-700 h-2 rounded-full mt-2 overflow-hidden flex'>
                      <div
                        className='bg-green-500 h-full'
                        style={{ width: `${(r.p1Wins / r.count) * 100}%` }}
                      ></div>
                      <div
                        className='bg-blue-500 h-full'
                        style={{ width: `${(r.p2Wins / r.count) * 100}%` }}
                      ></div>
                    </div>
                  </div>
                  <div className='text-xl font-black pl-4 border-l ml-4'>
                    {r.count}
                  </div>
                </div>
              ))}
              {stats.topRivalries.length === 0 && (
                <div className='text-center text-muted-foreground text-sm py-4'>
                  {t('Not enough data for rivalries.')}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* ACTIVITY CHARTS (MONTH & DAY) */}
        <div className='space-y-6'>
          <Card>
            <CardHeader>
              <CardTitle className='flex items-center gap-2'>
                <LineChartIcon className='h-5 w-5' /> {t('Monthly Activity')}
              </CardTitle>
            </CardHeader>
            <CardContent className='h-[200px]'>
              <ResponsiveContainer width='100%' height='100%'>
                <BarChart data={monthData}>
                  <CartesianGrid strokeDasharray='3 3' vertical={false} />
                  <XAxis
                    dataKey='name'
                    tick={{ fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    cursor={{ fill: 'transparent' }}
                    contentStyle={{ borderRadius: '8px' }}
                  />
                  <Bar
                    dataKey='count'
                    fill='hsl(var(--primary))'
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className='flex items-center gap-2'>
                <Calendar className='h-5 w-5' /> {t('Daily Habits')}
              </CardTitle>
            </CardHeader>
            <CardContent className='h-[200px]'>
              <ResponsiveContainer width='100%' height='100%'>
                <BarChart data={dayData}>
                  <CartesianGrid strokeDasharray='3 3' vertical={false} />
                  <XAxis
                    dataKey='name'
                    tick={{ fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    cursor={{ fill: 'transparent' }}
                    contentStyle={{ borderRadius: '8px' }}
                  />
                  <Bar dataKey='count' fill='#8884d8' radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* TOP LISTS GRID (2x2) */}
      <div className='grid grid-cols-1 sm:grid-cols-2 gap-4'>
        {/* 1. MOST ACTIVE */}
        <Card className='h-full'>
          <CardHeader className='pb-2'>
            <CardTitle className='text-base flex items-center gap-2'>
              <Flame className='h-4 w-4 text-orange-500' /> {t('Most Active')}
            </CardTitle>
          </CardHeader>
          <CardContent className='pt-2'>
            <div className='space-y-3'>
              {stats.topPlayers.map((p, i) => (
                <div
                  key={p.id}
                  className='flex justify-between items-center text-sm'
                >
                  <div className='flex items-center gap-2'>
                    <span className='font-mono text-muted-foreground w-4'>
                      {i + 1}
                    </span>
                    <span className='font-medium truncate max-w-[100px]'>
                      {p.name}
                    </span>
                  </div>
                  <span className='font-bold'>{p.matches}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* 2. BEST WIN RATE */}
        <Card className='h-full'>
          <CardHeader className='pb-2'>
            <CardTitle className='text-base flex items-center gap-2'>
              <Award className='h-4 w-4 text-yellow-500' /> {t('Best Win Rate')}
              <span className='text-[10px] font-normal text-muted-foreground ml-auto'>
                (10+ {t('games')})
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className='pt-2'>
            <div className='space-y-3'>
              {stats.bestPlayers.map((p, i) => (
                <div
                  key={p.id}
                  className='flex justify-between items-center text-sm'
                >
                  <div className='flex items-center gap-2'>
                    <span className='font-mono text-muted-foreground w-4'>
                      {i + 1}
                    </span>
                    <span className='font-medium truncate max-w-[100px]'>
                      {p.name}
                    </span>
                  </div>
                  <span className='font-bold text-green-600'>
                    {p.winRate.toFixed(0)}%
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* 3. TOP IMPROVERS (ELO GROWTH) */}
        <Card className='h-full'>
          <CardHeader className='pb-2'>
            <CardTitle className='text-base flex items-center gap-2'>
              <TrendingUp className='h-4 w-4 text-green-500' />{' '}
              {t('Yearly Progress')}
            </CardTitle>
            <CardDescription className='text-xs'>
              {t('Net ELO gained this year')}
            </CardDescription>
          </CardHeader>
          <CardContent className='pt-2'>
            <div className='space-y-3'>
              {stats.topImprovers.map((p, i) => (
                <div
                  key={p.id}
                  className='flex justify-between items-center text-sm'
                >
                  <div className='flex items-center gap-2'>
                    <span className='font-mono text-muted-foreground w-4'>
                      {i + 1}
                    </span>
                    <span className='font-medium truncate max-w-[100px]'>
                      {p.name}
                    </span>
                  </div>
                  <div className='flex items-center gap-1'>
                    {p.eloDiff > 0 ? (
                      <ArrowUp className='w-3 h-3 text-green-500' />
                    ) : (
                      <ArrowDown className='w-3 h-3 text-red-500' />
                    )}
                    <span
                      className={`font-bold ${
                        p.eloDiff > 0 ? 'text-green-600' : 'text-red-600'
                      }`}
                    >
                      {Math.abs(Math.round(p.eloDiff))}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* 4. GLOBAL RANKING (ABSOLUTE ELO) */}
        <Card className='h-full'>
          <CardHeader className='pb-2'>
            <CardTitle className='text-base flex items-center gap-2'>
              <Globe className='h-4 w-4 text-blue-500' /> {t('Global Ranking')}
            </CardTitle>
            <CardDescription className='text-xs'>
              {t('Highest rating at year end')}
            </CardDescription>
          </CardHeader>
          <CardContent className='pt-2'>
            <div className='space-y-3'>
              {stats.topRanked.map((p, i) => (
                <div
                  key={p.id}
                  className='flex justify-between items-center text-sm'
                >
                  <div className='flex items-center gap-2'>
                    <span className='font-mono text-muted-foreground w-4'>
                      {i + 1}
                    </span>
                    <span className='font-medium truncate max-w-[100px]'>
                      {p.name}
                    </span>
                  </div>
                  <span className='font-bold text-blue-600 dark:text-blue-400'>
                    {Math.round(p.endElo)}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
