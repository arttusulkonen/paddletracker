// src/app/wrap/page.tsx
'use client';

import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui';
import { useAuth } from '@/contexts/AuthContext';
import type { Sport } from '@/contexts/SportContext';
import { useSport } from '@/contexts/SportContext';
import { useToast } from '@/hooks/use-toast';
import { db } from '@/lib/firebase';
import type { Match } from '@/lib/types';
import { safeFormatDate } from '@/lib/utils/date';
import { collection, getDocs, query, where } from 'firebase/firestore';
import {
  ArrowLeft,
  Award,
  BarChart3,
  BatteryCharging,
  Calendar,
  CalendarClock,
  Flame,
  LineChart as LineChartIcon,
  MousePointerClick,
  Share2,
  Snowflake,
  Swords,
  Target,
  TrendingDown,
  TrendingUp,
  Trophy,
} from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

// ──────────────────────────────────────────────────────────────
// CONFIG & HELPERS
// ──────────────────────────────────────────────────────────────

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
    let h = 0,
      min = 0,
      s = 0;
    const timeMatch = str.match(/(\d{1,2})\.(\d{1,2})(?:\.(\d{1,2}))?$/);
    if (timeMatch) {
      h = parseInt(timeMatch[1], 10) || 0;
      min = parseInt(timeMatch[2], 10) || 0;
      s = parseInt(timeMatch[3], 10) || 0;
    }
    const date = new Date(y, m, d, h, min, s);
    return date.getTime();
  }
  return NaN;
}

function formatDatePretty(ts: number): string {
  if (isNaN(ts)) return '—';
  const date = new Date(ts);
  const d = String(date.getDate()).padStart(2, '0');
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const y = date.getFullYear();
  return `${d}.${m}.${y}`;
}

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
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// --- Types ---

type UserStats = {
  wins: number;
  losses: number;
  matches: number;
  winRate: number;
  pointsFor: number;
  pointsAgainst: number;
  pointsDiff: number;
  streak: number;
  maxStreak: number;
  lossStreak: number;
  maxLossStreak: number;
  rivals: Map<
    string,
    { id: string; name: string; wins: number; losses: number; history: Match[] }
  >;
  aces?: number;
  doubleFaults?: number;
  winners?: number;
  dayStats: Map<number, { wins: number; losses: number }>;
};

type EloStats = {
  maxElo: number;
  maxEloDate: string;
  minElo: number;
  minEloDate: string;
  startElo: number;
  endElo: number;
  eloDiff: number;
};

type TimeStats = {
  matchesByMonth: number[];
  matchesByDay: number[];
  busiestMonthIndex: number;
  busiestMonthCount: number;
  quietestMonthIndex: number;
  quietestMonthCount: number;
  busiestDayIndex: number;
  busiestDayCount: number;
};

type AggregationResult = {
  totalMatches: number;
  totalPoints: number;
  favoriteOpponent: { name: string; matches: number };
  bestRivalry: { name: string; winRate: number };
  userStats: UserStats;
  eloStats: EloStats;
  timeStats: TimeStats;
};

// --- Aggregation Logic ---

function aggregate(
  matches: Match[],
  userId: string,
  sport: Sport,
  year: number
): AggregationResult {
  const PERIOD_START = new Date(`${year}-01-01T00:00:00Z`).getTime();
  const PERIOD_END = new Date(`${year}-12-31T23:59:59Z`).getTime();

  const userStats: UserStats = {
    wins: 0,
    losses: 0,
    matches: 0,
    winRate: 0,
    pointsFor: 0,
    pointsAgainst: 0,
    pointsDiff: 0,
    streak: 0,
    maxStreak: 0,
    lossStreak: 0,
    maxLossStreak: 0,
    rivals: new Map(),
    dayStats: new Map(),
    ...(sport === 'tennis' && { aces: 0, doubleFaults: 0, winners: 0 }),
  };

  const eloStats: EloStats = {
    maxElo: -Infinity,
    maxEloDate: '—',
    minElo: Infinity,
    minEloDate: '—',
    startElo: 0,
    endElo: 0,
    eloDiff: 0,
  };

  const matchesByMonth = new Array(12).fill(0);
  const matchesByDay = new Array(7).fill(0);

  // Filter & Sort Chronologically
  const periodMatches = matches
    .map((m) => ({
      ...m,
      _ts: parseDateSafe(m.tsIso ?? m.timestamp ?? m.createdAt),
    }))
    .filter(
      (m) => !isNaN(m._ts) && m._ts >= PERIOD_START && m._ts <= PERIOD_END
    )
    .sort((a, b) => a._ts - b._ts);

  periodMatches.forEach((m, index) => {
    const isP1 = m.player1Id === userId;
    const isP2 = m.player2Id === userId;
    if (!isP1 && !isP2) return;

    const me = isP1 ? m.player1 : m.player2;
    const opp = isP1 ? m.player2 : m.player1;
    const oppId = isP1 ? m.player2Id : m.player1Id;

    const scoreMe = Number(me.scores) || 0;
    const scoreOpp = Number(opp.scores) || 0;
    const win = scoreMe > scoreOpp;
    const myRating = Number(me.newRating);
    const myOldRating = Number(me.oldRating);

    // General Stats
    userStats.matches++;
    win ? userStats.wins++ : userStats.losses++;
    userStats.pointsFor += scoreMe;
    userStats.pointsAgainst += scoreOpp;

    // Streaks
    if (win) {
      userStats.streak++;
      userStats.lossStreak = 0;
      if (userStats.streak > userStats.maxStreak)
        userStats.maxStreak = userStats.streak;
    } else {
      userStats.lossStreak++;
      userStats.streak = 0;
      if (userStats.lossStreak > userStats.maxLossStreak)
        userStats.maxLossStreak = userStats.lossStreak;
    }

    // Tennis specifics
    if (sport === 'tennis') {
      userStats.aces! += Number((me as any).aces) || 0;
      userStats.doubleFaults! += Number((me as any).doubleFaults) || 0;
      userStats.winners! += Number((me as any).winners) || 0;
    }

    // Rivals Analysis
    if (oppId && opp.name) {
      if (!userStats.rivals.has(oppId)) {
        userStats.rivals.set(oppId, {
          id: oppId,
          name: opp.name,
          wins: 0,
          losses: 0,
          history: [],
        });
      }
      const rival = userStats.rivals.get(oppId)!;
      win ? rival.wins++ : rival.losses++;
      rival.history.push(m);
    }

    // ELO Tracking
    if (!isNaN(myRating) && myRating > 0) {
      // Первый матч года? Фиксируем стартовый рейтинг
      if (userStats.matches === 1) eloStats.startElo = myOldRating || 1000;

      // Обновляем конечный рейтинг
      eloStats.endElo = myRating;

      const dateStr = formatDatePretty(m._ts);
      if (myRating > eloStats.maxElo) {
        eloStats.maxElo = myRating;
        eloStats.maxEloDate = dateStr;
      }
      if (myRating < eloStats.minElo) {
        eloStats.minElo = myRating;
        eloStats.minEloDate = dateStr;
      }
    }

    // Time Tracking & Day Stats
    const dateObj = new Date(m._ts);
    const dayIdx = dateObj.getDay();

    matchesByMonth[dateObj.getMonth()]++;
    matchesByDay[dayIdx]++;

    if (!userStats.dayStats.has(dayIdx)) {
      userStats.dayStats.set(dayIdx, { wins: 0, losses: 0 });
    }
    const ds = userStats.dayStats.get(dayIdx)!;
    win ? ds.wins++ : ds.losses++;
  });

  // Fallbacks
  if (eloStats.maxElo === -Infinity) eloStats.maxElo = 1000;
  if (eloStats.minElo === Infinity) eloStats.minElo = 1000;

  // Считаем разницу ELO (если были матчи)
  eloStats.eloDiff =
    userStats.matches > 0 ? eloStats.endElo - eloStats.startElo : 0;

  userStats.winRate =
    userStats.matches > 0 ? (userStats.wins / userStats.matches) * 100 : 0;
  userStats.pointsDiff = userStats.pointsFor - userStats.pointsAgainst;

  const rivalsArray = Array.from(userStats.rivals.values());
  const favoriteOpponent = rivalsArray.sort(
    (a, b) => b.wins + b.losses - (a.wins + a.losses)
  )[0] ?? { name: '—', matches: 0 };

  const bestRivalry = rivalsArray
    .filter((r) => r.wins + r.losses >= 3)
    .sort((a, b) => {
      const ratioA = Math.abs(0.5 - a.wins / (a.wins + a.losses));
      const ratioB = Math.abs(0.5 - b.wins / (b.wins + b.losses));
      return ratioA - ratioB;
    })[0] ?? { name: '—', wins: 0, losses: 0 };

  const bestRivalryWinRate =
    bestRivalry.wins + bestRivalry.losses > 0
      ? (bestRivalry.wins / (bestRivalry.wins + bestRivalry.losses)) * 100
      : 0;

  let maxM = 0,
    minM = Infinity,
    busyMIdx = -1,
    quietMIdx = -1;
  matchesByMonth.forEach((count, idx) => {
    if (count > maxM) {
      maxM = count;
      busyMIdx = idx;
    }
    if (count > 0 && count < minM) {
      minM = count;
      quietMIdx = idx;
    }
  });
  if (quietMIdx === -1 && userStats.matches > 0) {
    quietMIdx = matchesByMonth.findIndex((c) => c > 0);
    minM = matchesByMonth[quietMIdx];
  }

  const busiestDayCount = Math.max(...matchesByDay);
  const busiestDayIndex = matchesByDay.indexOf(busiestDayCount);

  return {
    totalMatches: userStats.matches,
    totalPoints: userStats.pointsFor + userStats.pointsAgainst,
    favoriteOpponent: {
      name: favoriteOpponent.name,
      matches: favoriteOpponent.wins + favoriteOpponent.losses,
    },
    bestRivalry: {
      name: bestRivalry.name,
      winRate: bestRivalryWinRate,
    },
    userStats,
    eloStats,
    timeStats: {
      matchesByMonth,
      matchesByDay,
      busiestMonthIndex: busyMIdx,
      busiestMonthCount: maxM,
      quietestMonthIndex: quietMIdx,
      quietestMonthCount: minM === Infinity ? 0 : minM,
      busiestDayIndex,
      busiestDayCount,
    },
  };
}

// ──────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ──────────────────────────────────────────────────────────────

export default function WrapPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, userProfile } = useAuth();
  const { sport, config } = useSport();
  const { toast } = useToast();

  const initialYear =
    Number(searchParams.get('year')) || new Date().getFullYear();
  const [year, setYear] = useState<number>(initialYear);
  const [loading, setLoading] = useState(true);
  const [agg, setAgg] = useState<AggregationResult | null>(null);
  const [hasMounted, setHasMounted] = useState(false);

  // Modal states
  const [selectedRivalId, setSelectedRivalId] = useState<string | null>(null);
  const [selectedDayIndex, setSelectedDayIndex] = useState<number | null>(null);

  useEffect(() => {
    setHasMounted(true);
  }, []);

  const handleYearChange = (val: string) => {
    const newYear = Number(val);
    setYear(newYear);
    router.push(`/wrap?year=${newYear}`);
  };

  // Fetch Data
  useEffect(() => {
    if (!user || !userProfile || !hasMounted) return;

    const fetchData = async () => {
      setLoading(true);
      try {
        const roomsQuery = query(
          collection(db, config.collections.rooms),
          where('memberIds', 'array-contains', user.uid)
        );
        const roomsSnap = await getDocs(roomsQuery);
        const roomIds = roomsSnap.docs.map((doc) => doc.id);

        if (roomIds.length === 0) {
          setAgg(null);
          setLoading(false);
          return;
        }

        const chunk = <T,>(arr: T[], size: number) =>
          Array.from({ length: Math.ceil(arr.length / size) }, (_, i) =>
            arr.slice(i * size, i * size + size)
          );
        const roomChunks = chunk(roomIds, 10);

        const results: Match[] = [];
        for (const ids of roomChunks) {
          const matchesQuery = query(
            collection(db, config.collections.matches),
            where('roomId', 'in', ids)
          );
          const matchesSnap = await getDocs(matchesQuery);
          results.push(
            ...matchesSnap.docs.map((d) => ({ id: d.id, ...d.data() } as Match))
          );
        }

        const aggregatedData = aggregate(results, user.uid, sport, year);
        setAgg(aggregatedData);
      } catch (error) {
        console.error('Failed to fetch wrap data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [user, userProfile, hasMounted, sport, config, year]);

  // Chart Data Preparation
  const rivalChartData = useMemo(() => {
    if (!agg) return [];
    return Array.from(agg.userStats.rivals.entries())
      .map(([id, data]) => ({
        id,
        name: data.name,
        [t('Wins')]: data.wins,
        [t('Losses')]: data.losses,
      }))
      .sort(
        (a, b) =>
          b[t('Wins')] + b[t('Losses')] - (a[t('Wins')] + a[t('Losses')])
      )
      .slice(0, 10);
  }, [agg, t]);

  const daysChartData = useMemo(() => {
    if (!agg) return [];
    return agg.timeStats.matchesByDay.map((count, idx) => ({
      dayIndex: idx,
      name: t(DAYS[idx]),
      count,
    }));
  }, [agg, t]);

  // --- Playstyle Logic ---
  const playstyle = useMemo(() => {
    if (!agg || agg.totalMatches < 5) return null;
    const { winRate, matches, maxStreak } = agg.userStats;

    if (winRate >= 75 && matches > 15)
      return {
        title: t('The Dominator'),
        icon: '👑',
        desc: t('You crushed everyone in your path. A true champion.'),
      };
    if (maxStreak >= 8)
      return {
        title: t('Unstoppable Force'),
        icon: '🔥',
        desc: t('Once you catch fire, nothing can stop you.'),
      };
    if (matches >= 50)
      return {
        title: t('The Grinder'),
        icon: '⚙️',
        desc: t('Dedication is your middle name. You just keep playing.'),
      };
    if (winRate >= 60)
      return {
        title: t('Silent Assassin'),
        icon: '🥷',
        desc: t('Efficient and deadly. You win when it counts.'),
      };
    return {
      title: t('Rising Star'),
      icon: '🌟',
      desc: t('Great potential shown this year. Keep pushing!'),
    };
  }, [agg, t]);

  const handleShare = () => {
    if (!agg) return;
    const text =
      `My ${year} in PaddleTracker 🏓\n` +
      `🏆 ${agg.userStats.wins} Wins\n` +
      `🔥 ${agg.userStats.maxStreak} Max Streak\n` +
      `📈 ELO Change: ${agg.eloStats.eloDiff > 0 ? '+' : ''}${
        agg.eloStats.eloDiff
      }\n` +
      `Playstyle: ${playstyle?.title || 'Player'}`;

    navigator.clipboard.writeText(text);
    toast({
      title: t('Copied to clipboard!'),
      description: t('Share it with your friends.'),
    });
  };

  // --- Derived Data for Modals ---

  const selectedRivalData = useMemo(() => {
    if (!agg || !selectedRivalId) return null;
    const rival = agg.userStats.rivals.get(selectedRivalId);
    if (!rival) return null;

    let cumulativeWins = 0;
    let cumulativePointsFor = 0;
    let cumulativePointsAgainst = 0;

    const trendData = rival.history.map((m, i) => {
      const isP1 = m.player1Id === user?.uid;
      const myScore = Number(isP1 ? m.player1.scores : m.player2.scores) || 0;
      const oppScore = Number(isP1 ? m.player2.scores : m.player1.scores) || 0;

      const isWin = myScore > oppScore;
      if (isWin) cumulativeWins++;

      cumulativePointsFor += myScore;
      cumulativePointsAgainst += oppScore;

      const totalPoints = cumulativePointsFor + cumulativePointsAgainst;
      const pointsWinRate =
        totalPoints > 0 ? (cumulativePointsFor / totalPoints) * 100 : 0;

      return {
        game: i + 1,
        date: safeFormatDate(m.tsIso ?? m.timestamp, 'dd.MM.yyyy'),
        winRate: (cumulativeWins / (i + 1)) * 100,
        score: `${myScore} - ${oppScore}`,
        result: isWin ? 'Win' : 'Loss',
        pointsWinRate: pointsWinRate,
        totalPointsStr: `${cumulativePointsFor} : ${cumulativePointsAgainst}`,
      };
    });

    return {
      name: rival.name,
      wins: rival.wins,
      losses: rival.losses,
      total: rival.wins + rival.losses,
      trendData,
    };
  }, [agg, selectedRivalId, user?.uid]);

  const selectedDayData = useMemo(() => {
    if (!agg || selectedDayIndex === null) return null;
    const dayName = t(DAYS[selectedDayIndex]);
    const stats = agg.userStats.dayStats.get(selectedDayIndex) || {
      wins: 0,
      losses: 0,
    };
    const total = stats.wins + stats.losses;
    const winRate = total > 0 ? (stats.wins / total) * 100 : 0;

    return {
      name: dayName,
      total,
      wins: stats.wins,
      losses: stats.losses,
      winRate,
    };
  }, [agg, selectedDayIndex, t]);

  if (!hasMounted || loading) {
    return (
      <div className='flex items-center justify-center min-h-screen'>
        <div className='animate-spin h-12 w-12 rounded-full border-b-4 border-primary' />
      </div>
    );
  }

  const currentYear = new Date().getFullYear();
  const years = Array.from(
    { length: currentYear - 2024 + 1 },
    (_, i) => 2024 + i
  );

  if (!agg || agg.totalMatches === 0) {
    return (
      <div className='container mx-auto py-8 px-4 text-center'>
        <div className='flex justify-between items-center mb-6'>
          <Button variant='outline' onClick={() => router.push('/')}>
            <ArrowLeft className='mr-2 h-4 w-4' /> {t('Back')}
          </Button>
          <Select value={String(year)} onValueChange={handleYearChange}>
            <SelectTrigger className='w-[120px]'>
              <SelectValue placeholder={t('Year')} />
            </SelectTrigger>
            <SelectContent>
              {years.map((y) => (
                <SelectItem key={y} value={String(y)}>
                  {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>{t('No data for {{year}}', { year })}</CardTitle>
            <CardDescription>
              {t('Play some matches to see your personal statistics!')}
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className='container mx-auto py-8 px-4'>
      {/* 1. DIALOG: Rival Details */}
      <Dialog
        open={!!selectedRivalId}
        onOpenChange={(open) => !open && setSelectedRivalId(null)}
      >
        <DialogContent className='sm:max-w-[600px]'>
          <DialogHeader>
            <DialogTitle>
              {t('Vs')} {selectedRivalData?.name}
            </DialogTitle>
            <DialogDescription>
              {t('Head-to-head performance throughout the year.')}
            </DialogDescription>
          </DialogHeader>
          {selectedRivalData && (
            <div className='space-y-6'>
              <div className='flex justify-around text-center'>
                <div>
                  <div className='text-2xl font-bold text-green-600'>
                    {selectedRivalData.wins}
                  </div>
                  <div className='text-xs text-muted-foreground uppercase'>
                    {t('Wins')}
                  </div>
                </div>
                <div>
                  <div className='text-2xl font-bold'>
                    {selectedRivalData.total}
                  </div>
                  <div className='text-xs text-muted-foreground uppercase'>
                    {t('Matches')}
                  </div>
                </div>
                <div>
                  <div className='text-2xl font-bold text-red-600'>
                    {selectedRivalData.losses}
                  </div>
                  <div className='text-xs text-muted-foreground uppercase'>
                    {t('Losses')}
                  </div>
                </div>
              </div>
              <div className='h-[300px] w-full border rounded-lg p-2'>
                <h4 className='text-sm font-medium text-center mb-2'>
                  {t('Win Rate Trend (%)')}
                </h4>
                <ResponsiveContainer width='100%' height='100%'>
                  <LineChart data={selectedRivalData.trendData}>
                    <CartesianGrid strokeDasharray='3 3' vertical={false} />
                    <XAxis
                      dataKey='game'
                      label={{
                        value: t('Matches'),
                        position: 'insideBottom',
                        offset: -5,
                      }}
                      tick={{ fontSize: 10 }}
                    />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} />
                    <Tooltip
                      cursor={{
                        stroke: 'hsl(var(--primary))',
                        strokeWidth: 1,
                        strokeDasharray: '4 4',
                      }}
                      content={({ active, payload, label }) => {
                        if (active && payload && payload.length) {
                          const data = payload[0].payload;
                          return (
                            <div className='bg-popover text-popover-foreground p-3 border rounded-xl shadow-xl text-xs min-w-[180px]'>
                              <div className='mb-2 pb-2 border-b border-border font-medium flex justify-between items-center'>
                                <span>
                                  {t('Match')} {label}
                                </span>
                                <span className='text-muted-foreground'>
                                  {data.date}
                                </span>
                              </div>
                              <div className='grid grid-cols-2 gap-x-4 gap-y-1 mb-3'>
                                <span className='text-muted-foreground'>
                                  {t('Result')}:
                                </span>
                                <span
                                  className={`font-bold uppercase ${
                                    data.result === 'Win'
                                      ? 'text-green-600'
                                      : 'text-red-600'
                                  }`}
                                >
                                  {t(data.result)}
                                </span>
                                <span className='text-muted-foreground'>
                                  {t('Score')}:
                                </span>
                                <span className='font-bold font-mono'>
                                  {data.score}
                                </span>
                              </div>
                              <div className='space-y-1 pt-1 bg-muted/30 -mx-3 px-3 pb-1'>
                                <div className='flex justify-between items-center'>
                                  <span className='text-muted-foreground'>
                                    {t('Win Rate')}:
                                  </span>
                                  <span className='font-bold text-primary'>
                                    {data.winRate.toFixed(0)}%
                                  </span>
                                </div>
                                <div className='flex justify-between items-center gap-2'>
                                  <span className='text-muted-foreground'>
                                    {t('Total Points')}:
                                  </span>
                                  <span className='font-bold text-blue-600 dark:text-blue-400 font-mono'>
                                    {data.totalPointsStr}{' '}
                                    <span className='text-[10px] opacity-70 ml-1'>
                                      ({data.pointsWinRate.toFixed(1)}%)
                                    </span>
                                  </span>
                                </div>
                              </div>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    <ReferenceLine
                      y={50}
                      stroke='red'
                      strokeDasharray='3 3'
                      opacity={0.5}
                    />
                    <Line
                      type='monotone'
                      dataKey='winRate'
                      stroke='hsl(var(--primary))'
                      strokeWidth={3}
                      dot={false}
                      activeDot={{ r: 6, strokeWidth: 0 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* 2. DIALOG: Day Details */}
      <Dialog
        open={selectedDayIndex !== null}
        onOpenChange={(open) => !open && setSelectedDayIndex(null)}
      >
        <DialogContent className='sm:max-w-[400px]'>
          <DialogHeader>
            <DialogTitle className='flex items-center gap-2'>
              <Calendar size={20} className='text-primary' />
              {selectedDayData?.name} {t('Stats')}
            </DialogTitle>
          </DialogHeader>
          {selectedDayData && (
            <div className='space-y-6 text-center'>
              <div className='text-4xl font-black text-primary'>
                {selectedDayData.winRate.toFixed(0)}%
              </div>
              <div className='text-sm text-muted-foreground uppercase font-bold tracking-wide -mt-4 mb-4'>
                {t('Win Rate')}
              </div>

              <div className='grid grid-cols-3 gap-2'>
                <div className='bg-muted/30 p-2 rounded'>
                  <div className='text-xl font-bold'>
                    {selectedDayData.total}
                  </div>
                  <div className='text-[10px] uppercase text-muted-foreground'>
                    {t('Games')}
                  </div>
                </div>
                <div className='bg-green-50 dark:bg-green-900/20 p-2 rounded border border-green-100 dark:border-green-900'>
                  <div className='text-xl font-bold text-green-700 dark:text-green-400'>
                    {selectedDayData.wins}
                  </div>
                  <div className='text-[10px] uppercase text-green-600 dark:text-green-500'>
                    {t('Wins')}
                  </div>
                </div>
                <div className='bg-red-50 dark:bg-red-900/20 p-2 rounded border border-red-100 dark:border-red-900'>
                  <div className='text-xl font-bold text-red-700 dark:text-red-400'>
                    {selectedDayData.losses}
                  </div>
                  <div className='text-[10px] uppercase text-red-600 dark:text-red-500'>
                    {t('Losses')}
                  </div>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* MAIN CONTENT */}
      <div className='flex justify-between items-center mb-6'>
        <Button variant='outline' onClick={() => router.push('/')}>
          <ArrowLeft className='mr-2 h-4 w-4' /> {t('Back')}
        </Button>

        <div className='flex items-center gap-2'>
          <Button
            onClick={handleShare}
            variant='outline'
            size='icon'
            title={t('Share results')}
          >
            <Share2 className='h-4 w-4' />
          </Button>
          <Select value={String(year)} onValueChange={handleYearChange}>
            <SelectTrigger className='w-[120px] shadow-sm'>
              <SelectValue placeholder={t('Year')} />
            </SelectTrigger>
            <SelectContent>
              {years.map((y) => (
                <SelectItem key={y} value={String(y)}>
                  {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <Card
        className={`mb-8 shadow-xl bg-gradient-to-r ${config.theme.gradientFrom} ${config.theme.gradientTo} rounded-3xl border-none overflow-hidden relative`}
      >
        <div className='absolute top-0 right-0 w-64 h-64 bg-white/20 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none' />
        <div className='absolute bottom-0 left-0 w-48 h-48 bg-black/5 rounded-full blur-2xl -ml-10 -mb-10 pointer-events-none' />
        <CardHeader className='text-center py-16 relative z-10'>
          <div className='inline-flex items-center justify-center p-3 '>
            <Trophy size={32} className='text-slate-900' />
          </div>
          <CardTitle className='text-5xl font-extrabold tracking-tight mb-2 text-slate-900'>
            {t('WRAP {{year}}', { year })}
          </CardTitle>
          <CardDescription className='text-xl text-slate-800 font-medium'>
            {t('Your year in {{sport}}', { sport: t(config.name) })}
          </CardDescription>
          <div className='mt-6 inline-block px-5 py-1.5 text-sm font-mono font-semibold text-slate-900'>
            {agg.totalMatches} {t('matches played')}
          </div>
        </CardHeader>
      </Card>

      {/* PLAYSTYLE BADGE */}
      {playstyle && (
        <Card className='mb-8 bg-primary/5 border-primary/10 border-l-4 border-l-primary'>
          <CardContent className='flex flex-col sm:flex-row items-center gap-6 p-6 text-center sm:text-left'>
            <div className='text-6xl filter drop-shadow-md'>
              {playstyle.icon}
            </div>
            <div>
              <div className='text-sm font-bold text-primary uppercase tracking-wider mb-1'>
                {t('Your Playstyle')}
              </div>
              <div className='text-3xl font-black mb-2 tracking-tight'>
                {playstyle.title}
              </div>
              <p className='text-muted-foreground'>{playstyle.desc}</p>
            </div>
          </CardContent>
        </Card>
      )}

      <div className='grid grid-cols-1 md:grid-cols-2 gap-6 mb-8'>
        <Card className='bg-emerald-50 dark:bg-emerald-900/10 border-emerald-200 dark:border-emerald-900 shadow-sm'>
          <CardHeader className='flex flex-row items-center justify-between pb-2'>
            <CardTitle className='text-lg font-bold text-emerald-800 dark:text-emerald-400 flex items-center gap-2'>
              <TrendingUp size={22} /> {t('Peak Performance')}
            </CardTitle>
            <span className='text-xs font-bold text-emerald-700 bg-white/60 dark:bg-black/30 px-2 py-1 rounded-md'>
              {agg.eloStats.maxEloDate}
            </span>
          </CardHeader>
          <CardContent>
            <div className='text-5xl font-extrabold text-emerald-900 dark:text-emerald-100'>
              {Math.round(agg.eloStats.maxElo)}
            </div>
            <p className='text-sm text-emerald-700 dark:text-emerald-500 font-medium mt-1'>
              {t('Highest ELO achieved')}
            </p>
          </CardContent>
        </Card>
        <Card className='bg-rose-50 dark:bg-rose-900/10 border-rose-200 dark:border-rose-900 shadow-sm'>
          <CardHeader className='flex flex-row items-center justify-between pb-2'>
            <CardTitle className='text-lg font-bold text-rose-800 dark:text-rose-400 flex items-center gap-2'>
              <TrendingDown size={22} /> {t('Tough Times')}
            </CardTitle>
            <span className='text-xs font-bold text-rose-700 bg-white/60 dark:bg-black/30 px-2 py-1 rounded-md'>
              {agg.eloStats.minEloDate}
            </span>
          </CardHeader>
          <CardContent>
            <div className='text-5xl font-extrabold text-rose-900 dark:text-rose-100'>
              {Math.round(agg.eloStats.minElo)}
            </div>
            <p className='text-sm text-rose-700 dark:text-rose-500 font-medium mt-1'>
              {t('Lowest ELO recorded')}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8'>
        <StatCard
          icon={CalendarClock}
          title={t('Grind Month')}
          value={t(MONTHS[agg.timeStats.busiestMonthIndex] || '—')}
          highlight={`${agg.timeStats.busiestMonthCount} ${t('matches')}`}
          subtext={t('Most active month')}
          color='bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300'
        />
        <StatCard
          icon={BatteryCharging}
          title={t('Chill Month')}
          value={t(MONTHS[agg.timeStats.quietestMonthIndex] || '—')}
          highlight={`${agg.timeStats.quietestMonthCount} ${t('matches')}`}
          subtext={t('Least active month')}
          color='bg-teal-100 text-teal-700 dark:bg-teal-900 dark:text-teal-300'
        />
        <StatCard
          icon={Calendar}
          title={t('Favorite Day')}
          value={t(DAYS[agg.timeStats.busiestDayIndex] || '—')}
          highlight={`${agg.timeStats.busiestDayCount} ${t('matches')}`}
          subtext={t('You play most on this day')}
          color='bg-violet-100 text-violet-700 dark:bg-violet-900 dark:text-violet-300'
        />
        <StatCard
          icon={Snowflake}
          title={t('Cold Streak')}
          value={agg.userStats.maxLossStreak}
          highlight={t('losses in a row')}
          subtext={t('It happens to the best of us')}
          color='bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300'
        />
      </div>

      {/* IMPROVED STAT CARDS */}
      <div className='grid grid-cols-2 md:grid-cols-4 gap-4 mb-8'>
        {/* 1. MATCH RECORD */}
        <div className='bg-card p-5 rounded-xl border shadow-sm flex flex-col items-center text-center hover:bg-accent/5 transition-colors'>
          <Award className='h-8 w-8 text-primary mb-2' />
          <div className='text-3xl font-bold'>{agg.userStats.wins}</div>
          <div className='text-xs font-bold uppercase tracking-wider text-muted-foreground mt-1'>
            {t('Wins')}
          </div>
          <div className='text-[10px] text-muted-foreground mt-1 bg-muted px-2 py-0.5 rounded-full'>
            {agg.userStats.losses} {t('Losses')}
          </div>
        </div>

        {/* 2. BEST STREAK */}
        <div className='bg-card p-5 rounded-xl border shadow-sm flex flex-col items-center text-center hover:bg-accent/5 transition-colors'>
          <Flame className='h-8 w-8 text-orange-500 mb-2' />
          <div className='text-3xl font-bold'>{agg.userStats.maxStreak}</div>
          <div className='text-xs font-bold uppercase tracking-wider text-muted-foreground mt-1'>
            {t('Best Streak')}
          </div>
          <div className='text-[10px] text-muted-foreground mt-1 bg-muted px-2 py-0.5 rounded-full'>
            {t('Wins in a row')}
          </div>
        </div>

        {/* 3. ELO JOURNEY (NEW) */}
        <div className='bg-card p-5 rounded-xl border shadow-sm flex flex-col items-center text-center hover:bg-accent/5 transition-colors'>
          <LineChartIcon
            className={`h-8 w-8 mb-2 ${
              agg.eloStats.eloDiff >= 0 ? 'text-green-600' : 'text-red-600'
            }`}
          />
          <div
            className={`text-3xl font-bold ${
              agg.eloStats.eloDiff >= 0 ? 'text-green-600' : 'text-red-600'
            }`}
          >
            {agg.eloStats.eloDiff > 0 ? '+' : ''}
            {Math.round(agg.eloStats.eloDiff)}
          </div>
          <div className='text-xs font-bold uppercase tracking-wider text-muted-foreground mt-1'>
            {t('ELO Change')}
          </div>
          <div className='text-[10px] text-muted-foreground mt-1 bg-muted px-2 py-0.5 rounded-full whitespace-nowrap'>
            {Math.round(agg.eloStats.startElo)} ➔{' '}
            {Math.round(agg.eloStats.endElo)}
          </div>
        </div>

        {/* 4. NET SCORE (CLARIFIED) */}
        <div className='bg-card p-5 rounded-xl border shadow-sm flex flex-col items-center text-center hover:bg-accent/5 transition-colors'>
          <Target className='h-8 w-8 text-blue-600 mb-2' />
          <div className='text-3xl font-bold'>
            {agg.userStats.pointsDiff > 0 ? '+' : ''}
            {agg.userStats.pointsDiff}
          </div>
          <div className='text-xs font-bold uppercase tracking-wider text-muted-foreground mt-1'>
            {t('Net Score')}
          </div>
          <div className='text-[10px] text-muted-foreground mt-1 bg-muted px-2 py-0.5 rounded-full whitespace-nowrap'>
            {agg.userStats.pointsFor} - {agg.userStats.pointsAgainst}
          </div>
        </div>
      </div>

      <div className='grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8'>
        <Card className='shadow-md border-none'>
          <CardHeader>
            <CardTitle className='flex items-center gap-2'>
              <BarChart3 size={20} className='text-primary' />{' '}
              {t('Weekly Habits')}
            </CardTitle>
            {/* FIXED TEXT HERE */}
            <CardDescription className='flex items-center gap-1'>
              {t('Hover over a bar to see win rate details')}{' '}
              <MousePointerClick size={14} />
            </CardDescription>
          </CardHeader>
          <CardContent className='h-[320px] w-full'>
            <ResponsiveContainer width='100%' height='100%'>
              <BarChart data={daysChartData}>
                <CartesianGrid
                  strokeDasharray='3 3'
                  vertical={false}
                  stroke='#e5e7eb'
                />
                <XAxis
                  dataKey='name'
                  tick={{ fontSize: 12, fill: '#64748b' }}
                  axisLine={false}
                  tickLine={false}
                  dy={10}
                />
                <Tooltip
                  cursor={{ fill: 'transparent' }}
                  content={({ active, payload }) => {
                    if (!active || !payload || !payload[0]) return null;
                    const dayIndex = payload[0].payload.dayIndex;
                    const dayName = t(DAYS[dayIndex]);
                    const stats = agg.userStats.dayStats.get(dayIndex) || {
                      wins: 0,
                      losses: 0,
                    };
                    const total = stats.wins + stats.losses;
                    const winRate = total > 0 ? (stats.wins / total) * 100 : 0;
                    return (
                      <div className='bg-popover text-popover-foreground p-3 rounded-xl shadow-xl border font-bold min-w-[120px]'>
                        <div className='text-sm mb-1'>{dayName}</div>
                        <div className='text-lg font-black text-primary'>
                          {winRate.toFixed(0)}%
                        </div>
                        <div className='text-xs text-muted-foreground mb-2'>
                          {t('Win Rate')}
                        </div>
                        <div className='text-xs grid grid-cols-2 gap-2'>
                          <span className='text-green-600'>
                            {t('Wins')}: {stats.wins}
                          </span>
                          <span className='text-red-600'>
                            {t('Losses')}: {stats.losses}
                          </span>
                        </div>
                      </div>
                    );
                  }}
                />
                <Bar dataKey='count' radius={[6, 6, 0, 0]}>
                  {daysChartData.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={
                        index === agg.timeStats.busiestDayIndex
                          ? 'hsl(var(--primary))'
                          : '#cbd5e1'
                      }
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className='shadow-md border-none'>
          <CardHeader>
            <CardTitle className='flex items-center gap-2'>
              <Swords size={20} className='text-destructive' />{' '}
              {t('Top Rivals')}
            </CardTitle>
            <CardDescription className='flex items-center gap-1'>
              {t('Click a bar to see matchup trend')}{' '}
              <MousePointerClick size={14} />
            </CardDescription>
          </CardHeader>
          <CardContent className='h-[320px] w-full'>
            <ResponsiveContainer width='100%' height='100%'>
              <BarChart
                data={rivalChartData}
                layout='vertical'
                onClick={(data) => {
                  if (data?.activePayload?.[0]?.payload) {
                    setSelectedRivalId(data.activePayload[0].payload.id);
                  }
                }}
              >
                <CartesianGrid
                  strokeDasharray='3 3'
                  horizontal={false}
                  stroke='#e5e7eb'
                />
                <XAxis type='number' hide />
                <YAxis
                  type='category'
                  dataKey='name'
                  width={90}
                  tick={{ fontSize: 12, fill: '#64748b' }}
                  interval={0}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  cursor={{ fill: 'transparent' }}
                  contentStyle={{
                    borderRadius: '12px',
                    border: 'none',
                    boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1)',
                    padding: '12px',
                  }}
                />
                <Bar
                  dataKey={t('Wins')}
                  stackId='a'
                  fill='hsl(var(--primary))'
                  radius={[0, 4, 4, 0]}
                  barSize={20}
                />
                <Bar
                  dataKey={t('Losses')}
                  stackId='a'
                  fill='#e2e8f0'
                  radius={[0, 4, 4, 0]}
                  barSize={20}
                />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <div className='text-center py-16'>
        <h3 className='text-3xl font-extrabold mb-3 text-slate-900 dark:text-white'>
          {t('See you in {{year}}! 🚀', { year: year + 1 })}
        </h3>
        <p className='text-lg text-muted-foreground'>
          {t('Keep smashing and climbing the leaderboard.')}
        </p>
      </div>
    </div>
  );
}

function StatCard({
  icon: Icon,
  title,
  value,
  highlight,
  subtext,
  color,
}: {
  icon: any;
  title: string;
  value: string | number;
  highlight: string | number;
  subtext: string;
  color: string;
}) {
  return (
    <Card className='border-none shadow-md bg-white dark:bg-slate-900 hover:shadow-lg transition-shadow duration-200'>
      <CardContent className='pt-6 flex flex-col items-center text-center h-full justify-center'>
        <div className={`p-3 rounded-full mb-4 ${color}`}>
          <Icon size={28} />
        </div>
        <div className='text-sm font-bold text-muted-foreground mb-1 uppercase tracking-wide'>
          {title}
        </div>
        <div className='text-3xl font-black mb-1 text-slate-800 dark:text-slate-100'>
          {value}
        </div>
        <div className='text-sm font-semibold text-primary mb-2'>
          {highlight}
        </div>
        <div className='text-xs text-muted-foreground/70 font-medium'>
          {subtext}
        </div>
      </CardContent>
    </Card>
  );
}
