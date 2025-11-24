// src/app/wrap-2024/page.tsx
'use client';

import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui';
import { useAuth } from '@/contexts/AuthContext';
import type { Sport } from '@/contexts/SportContext';
import { useSport } from '@/contexts/SportContext';
import { db } from '@/lib/firebase';
import type { Match } from '@/lib/types';
import { collection, getDocs, query, where } from 'firebase/firestore';
import {
  ArrowLeft,
  Award,
  BarChart3,
  BatteryCharging,
  Calendar,
  CalendarClock,
  CircleDollarSign,
  Flame,
  Medal,
  PlayCircle,
  Snowflake,
  Swords,
  TrendingDown,
  TrendingUp,
  Trophy,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

// ──────────────────────────────────────────────────────────────
// КОНФИГУРАЦИЯ ПЕРИОДА
// ──────────────────────────────────────────────────────────────
export const PERIOD_START = new Date('2024-07-27T00:00:00Z').getTime();
export const PERIOD_END = new Date('2024-12-31T23:59:59Z').getTime();

// Надежный парсер дат (включая финский формат)
function parseDateSafe(input: any): number {
  if (!input) return NaN;
  if (typeof input === 'object' && input.toDate)
    return input.toDate().getTime();
  if (typeof input === 'number') return input;

  const str = String(input).trim();

  // ISO 8601
  if (str.includes('T') || str.includes('-')) {
    const ts = Date.parse(str);
    if (!isNaN(ts)) return ts;
  }

  // Finnish format: "16.08.2025 10.01.01" -> DD.MM.YYYY
  const match = str.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  if (match) {
    const d = parseInt(match[1], 10);
    const m = parseInt(match[2], 10) - 1;
    const y = parseInt(match[3], 10);
    // Пытаемся достать время
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
  rivals: Map<string, { name: string; wins: number; losses: number }>;
  aces?: number;
  doubleFaults?: number;
  winners?: number;
};

type EloStats = {
  maxElo: number;
  maxEloDate: string;
  minElo: number;
  minEloDate: string;
  startElo: number;
  endElo: number;
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

function aggregate(
  matches: Match[],
  userId: string,
  sport: Sport
): AggregationResult {
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
    ...(sport === 'tennis' && { aces: 0, doubleFaults: 0, winners: 0 }),
  };

  const eloStats: EloStats = {
    maxElo: -Infinity,
    maxEloDate: '—',
    minElo: Infinity,
    minEloDate: '—',
    startElo: 0,
    endElo: 0,
  };

  const matchesByMonth = new Array(12).fill(0);
  const matchesByDay = new Array(7).fill(0);

  // 1. Фильтрация по дате и сортировка
  const validMatches = matches
    .map((m) => ({
      ...m,
      _ts: parseDateSafe(m.tsIso ?? m.timestamp ?? m.createdAt),
    }))
    .filter(
      (m) => !isNaN(m._ts) && m._ts >= PERIOD_START && m._ts <= PERIOD_END
    )
    .sort((a, b) => a._ts - b._ts);

  validMatches.forEach((m, index) => {
    // Проверка на участие (критично!)
    const isP1 = m.player1Id === userId;
    const isP2 = m.player2Id === userId;

    if (!isP1 && !isP2) return; // Пропускаем чужие матчи

    const me = isP1 ? m.player1 : m.player2;
    const opp = isP1 ? m.player2 : m.player1;
    const oppId = isP1 ? m.player2Id : m.player1Id;

    // Счет
    const scoreMe = Number(me.scores) || 0;
    const scoreOpp = Number(opp.scores) || 0;
    const win = scoreMe > scoreOpp;

    // Stats
    userStats.matches++;
    win ? userStats.wins++ : userStats.losses++;
    userStats.pointsFor += scoreMe;
    userStats.pointsAgainst += scoreOpp;

    // Streak
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

    // Tennis
    if (sport === 'tennis') {
      userStats.aces! += Number((me as any).aces) || 0;
      userStats.doubleFaults! += Number((me as any).doubleFaults) || 0;
      userStats.winners! += Number((me as any).winners) || 0;
    }

    // Rivals
    if (oppId && opp.name) {
      if (!userStats.rivals.has(oppId)) {
        userStats.rivals.set(oppId, { name: opp.name, wins: 0, losses: 0 });
      }
      const rival = userStats.rivals.get(oppId)!;
      win ? rival.wins++ : rival.losses++;
    }

    // Elo Tracking
    const myRating = Number(me.newRating);
    if (!isNaN(myRating) && myRating > 0) {
      if (index === 0) eloStats.startElo = Number(me.oldRating) || 1000;
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

    // Time Tracking
    const dateObj = new Date(m._ts);
    matchesByMonth[dateObj.getMonth()]++;
    matchesByDay[dateObj.getDay()]++;
  });

  // Fallbacks
  if (eloStats.maxElo === -Infinity) eloStats.maxElo = 1000;
  if (eloStats.minElo === Infinity) eloStats.minElo = 1000;

  userStats.winRate =
    userStats.matches > 0 ? (userStats.wins / userStats.matches) * 100 : 0;
  userStats.pointsDiff = userStats.pointsFor - userStats.pointsAgainst;

  // Rivals analysis
  const rivalsArray = Array.from(userStats.rivals.values());
  const favoriteOpponent = rivalsArray.sort(
    (a, b) => b.wins + b.losses - (a.wins + a.losses)
  )[0] ?? { name: '—', matches: 0 };

  const bestRivalry = rivalsArray
    .filter((r) => r.wins + r.losses >= 3)
    .sort((a, b) => {
      const totalA = a.wins + a.losses;
      const totalB = b.wins + b.losses;
      // Closest to 50% winrate is "best" rivalry
      const ratioA = Math.abs(0.5 - a.wins / totalA);
      const ratioB = Math.abs(0.5 - b.wins / totalB);
      return ratioA - ratioB; // Ascending diff from 0.5
    })[0] ?? { name: '—', wins: 0, losses: 0 }; // fallback

  const bestRivalryWinRate =
    bestRivalry.wins + bestRivalry.losses > 0
      ? (bestRivalry.wins / (bestRivalry.wins + bestRivalry.losses)) * 100
      : 0;

  // Time analysis
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
  // If no quiet month found (all 0 or equal), default to -1 handling
  if (quietMIdx === -1 && userStats.matches > 0) {
    // If all months with games have same count, pick first
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
      matches: favoriteOpponent.wins + favoriteOpponent.losses, // fix access
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

export default function Wrap2025() {
  const { t } = useTranslation();
  const router = useRouter();
  const { user, userProfile } = useAuth();
  const { sport, config } = useSport();

  const [loading, setLoading] = useState(true);
  const [agg, setAgg] = useState<AggregationResult | null>(null);
  const [hasMounted, setHasMounted] = useState(false);

  useEffect(() => {
    setHasMounted(true);
  }, []);

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

        // Fetch ALL matches from these rooms to filter locally (more reliable for complex dates)
        // Firestore 'in' limit is 10, so we chunk
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

        const aggregatedData = aggregate(results, user.uid, sport);
        setAgg(aggregatedData);
      } catch (error) {
        console.error('Failed to fetch wrap data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [user, userProfile, hasMounted, sport, config]);

  const rivalChartData = useMemo(() => {
    if (!agg) return [];
    return Array.from(agg.userStats.rivals.entries())
      .map(([_, data]) => ({
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
      name: t(DAYS[idx]),
      count,
    }));
  }, [agg, t]);

  if (!hasMounted || loading) {
    return (
      <div className='flex items-center justify-center min-h-screen'>
        <div className='animate-spin h-12 w-12 rounded-full border-b-4 border-primary' />
      </div>
    );
  }

  if (!agg || agg.totalMatches === 0) {
    return (
      <div className='container mx-auto py-8 px-4 text-center'>
        <Button
          variant='outline'
          className='mb-6'
          onClick={() => router.push('/')}
        >
          <ArrowLeft className='mr-2 h-4 w-4' /> {t('Back')}
        </Button>
        <Card>
          <CardHeader>
            <CardTitle>{t("Not enough data for your WRAP '24")}</CardTitle>
            <CardDescription>
              {t(
                'Play some matches during the year to see your personal statistics here!'
              )}
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className='container mx-auto py-8 px-4'>
      <Button
        variant='outline'
        className='mb-6'
        onClick={() => router.push('/')}
      >
        <ArrowLeft className='mr-2 h-4 w-4' /> {t('Back')}
      </Button>

      {/* HERO HEADER */}
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
            {t('WRAP 2025')}
          </CardTitle>
          <CardDescription className='text-xl text-slate-800 font-medium'>
            {t('Your year in {{sport}}', { sport: t(config.name) })}
          </CardDescription>
          <div className='mt-6 inline-block px-5 py-1.5 text-sm font-mono font-semibold text-slate-900'>
            {agg.totalMatches} {t('matches played')}
          </div>
        </CardHeader>
      </Card>

      {/* ELO HIGHS AND LOWS */}
      <div className='grid grid-cols-1 md:grid-cols-2 gap-6 mb-8'>
        <Card className='bg-emerald-50 border-emerald-200 shadow-sm'>
          <CardHeader className='flex flex-row items-center justify-between pb-2'>
            <CardTitle className='text-lg font-bold text-emerald-800 flex items-center gap-2'>
              <TrendingUp size={22} /> {t('Peak Performance')}
            </CardTitle>
            <span className='text-xs font-bold text-emerald-700 bg-white/60 px-2 py-1 rounded-md'>
              {agg.eloStats.maxEloDate}
            </span>
          </CardHeader>
          <CardContent>
            <div className='text-5xl font-extrabold text-emerald-900'>
              {Math.round(agg.eloStats.maxElo)}
            </div>
            <p className='text-sm text-emerald-700 font-medium mt-1'>
              {t('Highest ELO achieved')}
            </p>
          </CardContent>
        </Card>

        <Card className='bg-rose-50 border-rose-200 shadow-sm'>
          <CardHeader className='flex flex-row items-center justify-between pb-2'>
            <CardTitle className='text-lg font-bold text-rose-800 flex items-center gap-2'>
              <TrendingDown size={22} /> {t('Tough Times')}
            </CardTitle>
            <span className='text-xs font-bold text-rose-700 bg-white/60 px-2 py-1 rounded-md'>
              {agg.eloStats.minEloDate}
            </span>
          </CardHeader>
          <CardContent>
            <div className='text-5xl font-extrabold text-rose-900'>
              {Math.round(agg.eloStats.minElo)}
            </div>
            <p className='text-sm text-rose-700 font-medium mt-1'>
              {t('Lowest ELO recorded')}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* ACTIVITY INSIGHTS */}
      <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8'>
        <StatCard
          icon={CalendarClock}
          title={t('Grind Month')}
          value={t(MONTHS[agg.timeStats.busiestMonthIndex] || '—')}
          highlight={`${agg.timeStats.busiestMonthCount} ${t('matches')}`}
          subtext={t('Most active month')}
          color='bg-blue-100 text-blue-700'
        />
        <StatCard
          icon={BatteryCharging}
          title={t('Chill Month')}
          value={t(MONTHS[agg.timeStats.quietestMonthIndex] || '—')}
          highlight={`${agg.timeStats.quietestMonthCount} ${t('matches')}`}
          subtext={t('Least active month')}
          color='bg-teal-100 text-teal-700'
        />
        <StatCard
          icon={Calendar}
          title={t('Favorite Day')}
          value={t(DAYS[agg.timeStats.busiestDayIndex] || '—')}
          highlight={`${agg.timeStats.busiestDayCount} ${t('matches')}`}
          subtext={t('You play most on this day')}
          color='bg-violet-100 text-violet-700'
        />
        <StatCard
          icon={Snowflake}
          title={t('Cold Streak')}
          value={agg.userStats.maxLossStreak}
          highlight={t('losses in a row')}
          subtext={t('It happens to the best of us')}
          color='bg-indigo-100 text-indigo-700'
        />
      </div>

      {/* MAIN STATS GRID */}
      <div className='grid grid-cols-2 md:grid-cols-4 gap-4 mb-8'>
        <div className='bg-card p-5 rounded-xl border shadow-sm flex flex-col items-center text-center hover:bg-accent/5 transition-colors'>
          <Award className='h-8 w-8 text-primary mb-2' />
          <div className='text-3xl font-bold'>{agg.userStats.wins}</div>
          <div className='text-xs font-bold uppercase tracking-wider text-muted-foreground mt-1'>
            {t('Wins')}
          </div>
        </div>
        <div className='bg-card p-5 rounded-xl border shadow-sm flex flex-col items-center text-center hover:bg-accent/5 transition-colors'>
          <Flame className='h-8 w-8 text-orange-500 mb-2' />
          <div className='text-3xl font-bold'>{agg.userStats.maxStreak}</div>
          <div className='text-xs font-bold uppercase tracking-wider text-muted-foreground mt-1'>
            {t('Best Streak')}
          </div>
        </div>
        <div className='bg-card p-5 rounded-xl border shadow-sm flex flex-col items-center text-center hover:bg-accent/5 transition-colors'>
          <Medal className='h-8 w-8 text-yellow-500 mb-2' />
          <div className='text-3xl font-bold'>
            {agg.userStats.winRate.toFixed(1)}%
          </div>
          <div className='text-xs font-bold uppercase tracking-wider text-muted-foreground mt-1'>
            {t('Win Rate')}
          </div>
        </div>
        <div className='bg-card p-5 rounded-xl border shadow-sm flex flex-col items-center text-center hover:bg-accent/5 transition-colors'>
          <CircleDollarSign className='h-8 w-8 text-green-600 mb-2' />
          <div className='text-3xl font-bold'>
            {agg.userStats.pointsDiff > 0 ? '+' : ''}
            {agg.userStats.pointsDiff}
          </div>
          <div className='text-xs font-bold uppercase tracking-wider text-muted-foreground mt-1'>
            {t('Point Diff')}
          </div>
        </div>
      </div>

      {/* CHARTS ROW */}
      <div className='grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8'>
        {/* Weekly Habits */}
        <Card className='shadow-md border-none'>
          <CardHeader>
            <CardTitle className='flex items-center gap-2'>
              <BarChart3 size={20} className='text-primary' />{' '}
              {t('Weekly Habits')}
            </CardTitle>
            <CardDescription>
              {t('Matches played by day of the week')}
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
                  contentStyle={{
                    borderRadius: '12px',
                    border: 'none',
                    boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1)',
                    padding: '12px',
                    fontWeight: 'bold',
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

        {/* Top Rivals */}
        <Card className='shadow-md border-none'>
          <CardHeader>
            <CardTitle className='flex items-center gap-2'>
              <Swords size={20} className='text-destructive' />{' '}
              {t('Top Rivals')}
            </CardTitle>
            <CardDescription>
              {t('Most frequent opponents this year')}
            </CardDescription>
          </CardHeader>
          <CardContent className='h-[320px] w-full'>
            <ResponsiveContainer width='100%' height='100%'>
              <BarChart data={rivalChartData} layout='vertical'>
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

      {/* FUN FACTS / CLOSER */}
      <div className='text-center py-16'>
        <h3 className='text-3xl font-extrabold mb-3 text-slate-900 dark:text-white'>
          {t('See you in 2026! 🚀')}
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
