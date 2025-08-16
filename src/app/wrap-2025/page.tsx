// src/app/wrap-2025/page.tsx
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
import { parseFlexDate } from '@/lib/utils/date';
import { collection, getDocs, query, where } from 'firebase/firestore';
import {
  ArrowLeft,
  Award,
  BarChartBig,
  Calendar,
  CircleDollarSign,
  Flame,
  Medal,
  PlayCircle,
  Swords,
  Users2,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

/* ────────────────────────────────────────────────────────────── */
/* 🎯 CONFIG – edit ONLY these two lines for the next wrap page  */
/* ────────────────────────────────────────────────────────────── */
export const PERIOD_START = new Date('2024-07-30T00:00:00Z').getTime();
export const PERIOD_END = new Date('2025-07-30T00:00:00Z').getTime();
/* ────────────────────────────────────────────────────────────── */

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
  rivals: Map<string, { name: string; wins: number; losses: number }>;
  aces?: number;
  doubleFaults?: number;
  winners?: number;
};

type AggregationResult = {
  totalMatches: number;
  totalPoints: number;
  busiestDay: { date: string; matches: number };
  favoriteOpponent: { name: string; matches: number };
  bestRivalry: { name: string; winRate: number };
  userStats: UserStats;
};

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
    rivals: new Map(),
    ...(sport === 'tennis' && { aces: 0, doubleFaults: 0, winners: 0 }),
  };

  const dateFreq: Record<string, number> = {};

  const periodMatches = matches.filter((m) => {
    const ts = parseFlexDate(
      m.tsIso ?? m.timestamp ?? m.createdAt ?? m.playedAt
    ).getTime();
    return !isNaN(ts) && ts >= PERIOD_START && ts < PERIOD_END;
  });

  periodMatches.forEach((m) => {
    const isP1 = m.player1Id === userId;
    const me = isP1 ? m.player1 : m.player2;
    const opp = isP1 ? m.player2 : m.player1;
    const oppId = isP1 ? m.player2Id : m.player1Id;

    const win = me.scores > opp.scores;

    userStats.matches++;
    win ? userStats.wins++ : userStats.losses++;
    userStats.pointsFor += Number(me.scores) || 0;
    userStats.pointsAgainst += Number(opp.scores) || 0;

    if (win) {
      userStats.streak++;
      if (userStats.streak > userStats.maxStreak)
        userStats.maxStreak = userStats.streak;
    } else {
      userStats.streak = 0;
    }

    if (sport === 'tennis') {
      userStats.aces! += Number(me.aces) || 0;
      userStats.doubleFaults! += Number(me.doubleFaults) || 0;
      userStats.winners! += Number(me.winners) || 0;
    }

    if (!userStats.rivals.has(oppId)) {
      userStats.rivals.set(oppId, { name: opp.name, wins: 0, losses: 0 });
    }
    const rival = userStats.rivals.get(oppId)!;
    win ? rival.wins++ : rival.losses++;

    const dayMs = parseFlexDate(
      m.tsIso ?? m.timestamp ?? m.createdAt ?? ''
    ).getTime();
    const dayKey = isNaN(dayMs)
      ? '—'
      : new Date(dayMs).toISOString().slice(0, 10);
    dateFreq[dayKey] = (dateFreq[dayKey] ?? 0) + 1;
  });

  userStats.winRate =
    userStats.matches > 0 ? (userStats.wins / userStats.matches) * 100 : 0;
  userStats.pointsDiff = userStats.pointsFor - userStats.pointsAgainst;

  const [busyDate, busyMatches] = Object.entries(dateFreq).sort(
    (a, b) => b[1] - a[1]
  )[0] ?? ['—', 0];

  const rivalsArray = Array.from(userStats.rivals.values());
  const favoriteOpponent = rivalsArray.sort(
    (a, b) => b.wins + b.losses - (a.wins + a.losses)
  )[0] ?? { name: '—', wins: 0, losses: 0 };

  const bestRivalry = rivalsArray
    .filter((r) => r.wins + r.losses >= 5)
    .sort(
      (a, b) =>
        b.wins / Math.max(1, b.wins + b.losses) -
        a.wins / Math.max(1, a.wins + a.losses)
    )[0] ?? { name: '—', wins: 0, losses: 0 };

  return {
    totalMatches: userStats.matches,
    totalPoints: userStats.pointsFor + userStats.pointsAgainst,
    busiestDay: { date: busyDate, matches: busyMatches },
    favoriteOpponent: {
      name: favoriteOpponent.name,
      matches: favoriteOpponent.wins + favoriteOpponent.losses,
    },
    bestRivalry: {
      name: bestRivalry.name,
      winRate:
        bestRivalry.wins + bestRivalry.losses > 0
          ? (bestRivalry.wins / (bestRivalry.wins + bestRivalry.losses)) * 100
          : 0,
    },
    userStats,
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
      .slice(0, 15);
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
            <CardTitle>{t("Not enough data for your WRAP '25")}</CardTitle>
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
      <Card
        className={`mb-8 shadow-xl bg-gradient-to-r ${config.theme.gradientFrom} ${config.theme.gradientTo}  rounded-3xl`}
      >
        <CardHeader className='text-center py-12'>
          <CardTitle className='text-4xl font-extrabold tracking-wide'>
            {t(`🎉 ${config.name} WRAP ’25`)}
          </CardTitle>
          <CardDescription className='text-lg mt-2'>
            {t('Your personal year in review')}
          </CardDescription>
        </CardHeader>
      </Card>

      <div className='grid grid-cols-2 md:grid-cols-4 gap-6 mb-10'>
        <Stat
          icon={PlayCircle}
          label={t('Matches Played')}
          value={agg.totalMatches}
        />
        <Stat icon={Award} label={t('Wins')} value={agg.userStats.wins} />
        <Stat
          icon={Medal}
          label={t('Win Rate')}
          value={`${agg.userStats.winRate.toFixed(1)}%`}
        />
        <Stat
          icon={Flame}
          label={t('Best Streak')}
          value={agg.userStats.maxStreak}
        />
      </div>

      <div className='grid grid-cols-1 md:grid-cols-3 gap-6 mb-10'>
        <Stat
          icon={Calendar}
          label={t('Busiest Day')}
          value={`${agg.busiestDay.date} (${agg.busiestDay.matches})`}
        />
        <Stat
          icon={Users2}
          label={t('Favorite Opponent')}
          value={`${agg.favoriteOpponent.name} (${agg.favoriteOpponent.matches})`}
        />
        <Stat
          icon={Swords}
          label={t('Best Rivalry (5+ games)')}
          value={`${agg.bestRivalry.name} (${agg.bestRivalry.winRate.toFixed(
            0
          )}%)`}
        />

        {sport === 'tennis' ? (
          <>
            <Stat
              icon={BarChartBig}
              label={t('Aces')}
              value={agg.userStats.aces!}
            />
            <Stat
              icon={BarChartBig}
              label={t('Double Faults')}
              value={agg.userStats.doubleFaults!}
            />
            <Stat
              icon={BarChartBig}
              label={t('Winners')}
              value={agg.userStats.winners!}
            />
          </>
        ) : (
          <>
            <Stat
              icon={CircleDollarSign}
              label={t('Points Scored')}
              value={agg.userStats.pointsFor}
            />
            <Stat
              icon={CircleDollarSign}
              label={t('Points Conceded')}
              value={agg.userStats.pointsAgainst}
            />
            <Stat
              icon={CircleDollarSign}
              label={t('Point Differential')}
              value={
                agg.userStats.pointsDiff > 0
                  ? `+${agg.userStats.pointsDiff}`
                  : agg.userStats.pointsDiff
              }
            />
          </>
        )}
      </div>

      <Card className='shadow-md rounded-2xl mb-8'>
        <CardHeader>
          <CardTitle>{t('Your Rivalries')}</CardTitle>
          <CardDescription>
            {t('Your win/loss record against top opponents this year')}
          </CardDescription>
        </CardHeader>
        <CardContent style={{ height: 400 }}>
          <ResponsiveContainer width='100%' height='100%'>
            <BarChart data={rivalChartData} layout='vertical'>
              <CartesianGrid strokeDasharray='3 3' />
              <XAxis type='number' />
              <YAxis
                type='category'
                dataKey='name'
                width={80}
                tick={{ fontSize: 12 }}
              />
              <Tooltip />
              <Legend />
              <Bar dataKey={t('Wins')} stackId='a' fill='hsl(var(--primary))' />
              <Bar
                dataKey={t('Losses')}
                stackId='a'
                fill='hsl(var(--destructive))'
              />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
}: {
  icon: any;
  label: string;
  value: string | number;
}) {
  return (
    <div className='flex flex-col items-center text-center rounded-xl bg-muted p-4'>
      <Icon className='h-6 w-6 text-primary mb-1' />
      <span className='text-2xl font-bold'>{value}</span>
      <span className='text-xs text-muted-foreground uppercase tracking-wider'>
        {label}
      </span>
    </div>
  );
}
