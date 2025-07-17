'use client';

import {
  Avatar,
  AvatarFallback,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  ScrollArea,
} from '@/components/ui';
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
  Info,
  Medal,
  PlayCircle,
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

const ROOMS = [
  'iS2q1soBUATEmNSqLmIo',
  'pPlqKgPGtTHfZXZHFF02',
  'iPJrIgLRSv6eFy5dK9a4',
  'P7Mef8YjHCM8F3nEdxEH',
  'UAd6HUKoE7Y5fv1rYcuC',
];

/* --- Types & Aggregator (без изменений) --- */
type AggPlayer = {
  name: string;
  wins: number;
  losses: number;
  pointsFor: number;
  pointsAgainst: number;
  streak: number;
  maxStreak: number;
  rivals: Set<string>;
  clutchWins: number;
  clutchGames: number;
};
type Extra = {
  maxPoints: number;
  maxMargin: number;
  busiestDay: { date: string; matches: number };
  globalMaxStreak: { name: string; len: number };
  mostRivals: { name: string; count: number };
  totalClutch: number;
  bestWinRate: { name: string; pct: number };
  mostPlayedMatchup: { pairNames: string[]; matches: number };
};
function aggregate(list: Match[]) {
  const byP: Record<string, AggPlayer> = {};
  const dateFreq: Record<string, number> = {};
  const matchupFreq: Record<string, number> = {};
  let games = 0,
    totalPts = 0,
    maxPts = 0,
    maxMargin = 0,
    totalClutch = 0,
    globalStreak = { id: '', len: 0 };
  for (const m of list) {
    const ts = parseFlexDate(m.timestamp ?? m.tsIso ?? '').getTime();
    if (isNaN(ts) || ts < PERIOD_START || ts >= PERIOD_END) continue;
    games++;
    const pts = m.player1.scores + m.player2.scores;
    totalPts += pts;
    if (pts > maxPts) maxPts = pts;
    const margin = Math.abs(m.player1.scores - m.player2.scores);
    if (margin > maxMargin) maxMargin = margin;
    const dayKey = (m.timestamp ?? '').split(' ')[0] ?? 'unknown';
    dateFreq[dayKey] = (dateFreq[dayKey] ?? 0) + 1;
    const decide =
      Math.max(m.player1.scores, m.player2.scores) === 11 &&
      Math.min(m.player1.scores, m.player2.scores) >= 10;
    if (decide) totalClutch++;
    const pairKey = [m.player1Id, m.player2Id].sort().join('×');
    matchupFreq[pairKey] = (matchupFreq[pairKey] ?? 0) + 1;
    const p1Win = m.player1.scores > m.player2.scores;
    [
      {
        id: m.player1Id,
        opp: m.player2Id,
        name: m.player1.name,
        win: p1Win,
        pf: m.player1.scores,
        pa: m.player2.scores,
      },
      {
        id: m.player2Id,
        opp: m.player1Id,
        name: m.player2.name,
        win: !p1Win,
        pf: m.player2.scores,
        pa: m.player1.scores,
      },
    ].forEach(({ id, opp, name, win, pf, pa }) => {
      if (!byP[id])
        byP[id] = {
          name,
          wins: 0,
          losses: 0,
          pointsFor: 0,
          pointsAgainst: 0,
          streak: 0,
          maxStreak: 0,
          rivals: new Set<string>(),
          clutchWins: 0,
          clutchGames: 0,
        };
      const rec = byP[id];
      win ? rec.wins++ : rec.losses++;
      rec.pointsFor += pf;
      rec.pointsAgainst += pa;
      rec.rivals.add(opp);
      if (win) {
        rec.streak++;
        if (rec.streak > rec.maxStreak) rec.maxStreak = rec.streak;
        if (rec.maxStreak > globalStreak.len)
          globalStreak = { id, len: rec.maxStreak };
      } else {
        rec.streak = 0;
      }
      if (decide) {
        rec.clutchGames++;
        if (win) rec.clutchWins++;
      }
    });
  }
  const players = Object.values(byP)
    .map((p) => {
      const mp = p.wins + p.losses;
      return {
        ...p,
        matches: mp,
        winRate: mp ? (p.wins / mp) * 100 : 0,
        pointsDiff: p.pointsFor - p.pointsAgainst,
        clutchRate: p.clutchGames ? (p.clutchWins / p.clutchGames) * 100 : 0,
      };
    })
    .sort((a, b) => b.wins - a.wins || a.losses - b.losses);
  const [busyDate, busyMatches] = Object.entries(dateFreq).sort(
    (a, b) => b[1] - a[1]
  )[0] ?? ['—', 0];
  const mostRivals = [...players].sort(
    (a, b) => b.rivals.size - a.rivals.size
  )[0] ?? { name: '—', rivals: new Set<string>() };
  const bestWR = players
    .filter((p) => p.matches >= 20)
    .sort((a, b) => b.winRate - a.winRate)[0] ?? { name: '—', winRate: 0 };
  const [pairKey, pairMatches] = Object.entries(matchupFreq).sort(
    (a, b) => b[1] - a[1]
  )[0] ?? ['—', 0];
  const mostMatchupNames =
    pairMatches === 0
      ? ['—']
      : pairKey.split('×').map((id) => byP[id]?.name ?? id);
  return {
    games,
    totalPts,
    players,
    extra: {
      maxPoints: maxPts,
      maxMargin,
      busiestDay: { date: busyDate, matches: busyMatches },
      globalMaxStreak: {
        name: byP[globalStreak.id]?.name ?? '—',
        len: globalStreak.len,
      },
      mostRivals: { name: mostRivals.name, count: mostRivals.rivals.size },
      totalClutch,
      bestWinRate: { name: bestWR.name, pct: bestWR.winRate },
      mostPlayedMatchup: { pairNames: mostMatchupNames, matches: pairMatches },
    } as Extra,
  };
}

export default function Wrap2025() {
  const { t } = useTranslation();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [agg, setAgg] = useState<ReturnType<typeof aggregate> | null>(null);

  // 🛡️ Хук для защиты от гидратации
  const [hasMounted, setHasMounted] = useState(false);

  useEffect(() => {
    setHasMounted(true);

    (async () => {
      const q = query(collection(db, 'matches'), where('roomId', 'in', ROOMS));
      const snap = await getDocs(q);
      const rows: Match[] = [];
      snap.forEach((d) => rows.push({ id: d.id, ...(d.data() as any) }));
      setAgg(aggregate(rows));
      setLoading(false);
    })();
  }, []);

  const chartData = useMemo(
    () =>
      agg
        ? agg.players.map((p) => ({
            name: p.name,
            [t('Wins')]: p.wins,
            [t('Games')]: p.matches,
          }))
        : [],
    [agg, t]
  );

  // 🛡️ "Страж" гидратации объединен с проверкой загрузки
  if (!hasMounted || loading || !agg) {
    return (
      <div className='flex items-center justify-center min-h-screen'>
        <div className='animate-spin h-12 w-12 rounded-full border-b-4 border-primary' />
      </div>
    );
  }

  const avgPts = Math.round(agg.totalPts / agg.games || 0);

  return (
    <div className='container mx-auto py-8 px-4'>
      <Button
        variant='outline'
        className='mb-6'
        onClick={() => router.push('/')}
      >
        <ArrowLeft className='mr-2 h-4 w-4' /> {t('Back')}
      </Button>
      <Card className='mb-8 shadow-xl bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 text-white rounded-3xl'>
        <CardHeader className='text-center py-12'>
          <CardTitle className='text-4xl font-extrabold tracking-wide'>
            {t('🎉 Ping-Pong WRAP ’25')}
          </CardTitle>
          <CardDescription className='text-lg mt-2 text-white/80'>
            {t('A full-year look at real-room action')}
          </CardDescription>
        </CardHeader>
      </Card>
      <div className='grid grid-cols-2 md:grid-cols-4 gap-6 mb-10'>
        <Stat icon={PlayCircle} label={t('Matches')} value={agg.games} />
        <Stat
          icon={CircleDollarSign}
          label={t('Points')}
          value={agg.totalPts}
        />
        <Stat icon={Users2} label={t('Players')} value={agg.players.length} />
        <Stat icon={CircleDollarSign} label={t('Avg Pts')} value={avgPts} />
      </div>
      <div className='grid grid-cols-1 md:grid-cols-3 gap-6 mb-10'>
        <Stat
          icon={Medal}
          label={t('Most Points Match')}
          value={agg.extra.maxPoints}
        />
        <Stat
          icon={Award}
          label={t('Highest Margin')}
          value={agg.extra.maxMargin}
        />
        <Stat
          icon={Flame}
          label={t('Longest Streak')}
          value={`${agg.extra.globalMaxStreak.name} (${agg.extra.globalMaxStreak.len})`}
        />
        <Stat
          icon={Calendar}
          label={t('Busiest Day')}
          value={`${agg.extra.busiestDay.date} (${agg.extra.busiestDay.matches})`}
        />
        <Stat
          icon={CircleDollarSign}
          label={t('Pts / Win')}
          value={Math.round(
            agg.totalPts / (agg.players.reduce((s, p) => s + p.wins, 0) || 1)
          )}
        />
        <Stat
          icon={BarChartBig}
          label={t('Most Rivals')}
          value={`${agg.extra.mostRivals.name} (${agg.extra.mostRivals.count})`}
        />
        <Stat
          icon={BarChartBig}
          label={t('Total Clutch Games')}
          value={agg.extra.totalClutch}
        />
        <Stat
          icon={Medal}
          label={t('Best Win Rate*')}
          value={`${
            agg.extra.bestWinRate.name
          } (${agg.extra.bestWinRate.pct.toFixed(1)} %)`}
        />
        <Stat
          icon={Users2}
          label={t('Most Played Match-up')}
          value={`${agg.extra.mostPlayedMatchup.pairNames.join(
            ` ${t('vs')} `
          )} (${agg.extra.mostPlayedMatchup.matches})`}
        />
      </div>
      <Card className='shadow-md rounded-2xl mb-8'>
        <CardHeader>
          <CardTitle>{t('Win Leaderboard')}</CardTitle>
          <CardDescription>
            {t('Every player · period {{startYear}}-{{endYear}}', {
              startYear: new Date(PERIOD_START).getFullYear(),
              endYear: new Date(PERIOD_END).getFullYear(),
            })}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ScrollArea>
            <table className='w-full text-sm'>
              <thead>
                <tr className='border-b text-left'>
                  <th className='py-2 px-1'>#</th>
                  <th className='py-2 px-1'>{t('Player')}</th>
                  <th className='py-2 px-1 text-right'>{t('MP')}</th>
                  <th className='py-2 px-1 text-right'>{t('W')}</th>
                  <th className='py-2 px-1 text-right'>{t('L')}</th>
                  <th className='py-2 px-1 text-right'>{t('Win %')}</th>
                  <th className='py-2 px-1 text-right'>{t('PF')}</th>
                  <th className='py-2 px-1 text-right'>{t('PA')}</th>
                  <th className='py-2 px-1 text-right'>+/-</th>
                  <th className='py-2 px-1 text-right'>{t('Max Streak')}</th>
                  <th className='py-2 px-1 text-right'>{t('Rivals')}</th>
                </tr>
              </thead>
              <tbody>
                {agg.players.map((p, i) => (
                  <tr key={p.name} className='border-b last:border-0'>
                    <td className='py-1 px-1'>{i + 1}</td>
                    <td className='py-1 px-1 flex items-center gap-2'>
                      <Avatar className='h-6 w-6'>
                        <AvatarFallback>{p.name[0]}</AvatarFallback>
                      </Avatar>
                      {p.name}
                    </td>
                    <td className='py-1 px-1 text-right'>{p.matches}</td>
                    <td className='py-1 px-1 text-right'>{p.wins}</td>
                    <td className='py-1 px-1 text-right'>{p.losses}</td>
                    <td className='py-1 px-1 text-right'>
                      {p.winRate.toFixed(1)}%
                    </td>
                    <td className='py-1 px-1 text-right'>{p.pointsFor}</td>
                    <td className='py-1 px-1 text-right'>{p.pointsAgainst}</td>
                    <td className='py-1 px-1 text-right'>{p.pointsDiff}</td>
                    <td className='py-1 px-1 text-right'>{p.maxStreak}</td>
                    <td className='py-1 px-1 text-right'>{p.rivals.size}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollArea>
        </CardContent>
      </Card>
      <Card className='shadow-sm rounded-2xl mb-8'>
        <CardHeader>
          <CardTitle className='flex items-center gap-2'>
            <BarChartBig className='h-5 w-5' /> {t('Wins vs Matches')}
          </CardTitle>
          <CardDescription>{t('Top-20 players')}</CardDescription>
        </CardHeader>
        <CardContent style={{ height: 400 }}>
          <ResponsiveContainer width='100%' height='100%'>
            <BarChart data={chartData.slice(0, 20)}>
              <CartesianGrid strokeDasharray='3 3' />
              <XAxis
                dataKey='name'
                tick={{ fontSize: 11 }}
                angle={-30}
                textAnchor='end'
                height={80}
              />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey={t('Wins')} fill='hsl(var(--accent))' />
              <Bar dataKey={t('Games')} fill='hsl(var(--primary))' />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
      <Card className='shadow-sm rounded-2xl'>
        <CardHeader>
          <CardTitle className='flex items-center gap-2'>
            <Info className='h-5 w-5 text-primary' />{' '}
            {t('What do these numbers mean?')}
          </CardTitle>
        </CardHeader>
        <CardContent className='space-y-2 text-sm leading-relaxed'>
          <p>
            <strong>{t('Matches')}</strong> –{' '}
            {t(
              'total number of games inside the period and the five “real” rooms.'
            )}
          </p>
          <p>
            <strong>{t('Points')}</strong> –{' '}
            {t('sum of both players’ scores in every match.')}
          </p>
          <p>
            <strong>{t('Avg Pts')}</strong> –{' '}
            {t('average points per match (Points ÷ Matches).')}
          </p>
          <p>
            <strong>{t('Most Points Match')}</strong> –{' '}
            {t('highest combined score achieved in a single match.')}
          </p>
          <p>
            <strong>{t('Highest Margin')}</strong> –{' '}
            {t('widest gap between winner and loser.')}
          </p>
          <p>
            <strong>{t('Longest Streak')}</strong> –{' '}
            {t('longest consecutive-win run, with player’s name.')}
          </p>
          <p>
            <strong>{t('Busiest Day')}</strong> –{' '}
            {t('calendar day that hosted the most matches.')}
          </p>
          <p>
            <strong>{t('Pts / Win')}</strong> –{' '}
            {t('average points in matches the winner actually won.')}
          </p>
          <p>
            <strong>{t('Most Rivals')}</strong> –{' '}
            {t('player who faced the highest number of different opponents.')}
          </p>
          <p>
            <strong>{t('Best Win Rate*')}</strong> –{' '}
            {t('highest win-percentage among players with ≥ 20 matches.')}
          </p>
          <p>
            <strong>{t('Most Played Match-up')}</strong> –{' '}
            {t('pair of players who met the most times.')}
          </p>
          <hr />
          <p className='text-xs italic'>
            {t('*Players with fewer than 20 matches are ignored for fairness.')}
          </p>
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
    <div className='flex flex-col items-center rounded-xl bg-muted p-4'>
      <Icon className='h-6 w-6 text-primary mb-1' />
      <span className='text-2xl font-bold'>{value}</span>
      <span className='text-xs text-muted-foreground uppercase tracking-wider'>
        {label}
      </span>
    </div>
  );
}
