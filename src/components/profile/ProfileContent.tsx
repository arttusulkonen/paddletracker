// src/components/profile/ProfileContent.tsx
'use client';

import AchievementsPanel from '@/components/AchievementsPanel';
import ProfileCharts from '@/components/profile/ProfileCharts';
import { RankedInsights } from '@/components/RankedInsights';
import {
	Badge,
	Card,
	CardContent,
	CardHeader,
	CardTitle,
	ScrollArea,
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '@/components/ui';
import { useAuth } from '@/contexts/AuthContext';
import { Sport, SportConfig } from '@/contexts/SportContext';
import { db } from '@/lib/firebase';
import type { Match, Room, UserProfile } from '@/lib/types';
import { parseFlexDate, safeFormatDate } from '@/lib/utils/date';
import {
	buildInsights,
	computeSideStats,
	computeStats,
	groupByMonth,
	opponentStats,
} from '@/lib/utils/profileUtils';
import { doc, getDoc } from 'firebase/firestore';
import {
	BarChart,
	CornerUpLeft,
	CornerUpRight,
	Flame,
	LineChart as LineChartIcon,
	ListOrdered,
	Lock,
	Percent,
	Trophy,
} from 'lucide-react';
import React, { FC, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

interface ProfileContentProps {
  canViewProfile: boolean;
  sport: Sport;
  playedSports: Sport[];
  onSportChange: (sport: Sport) => void;
  stats: any;
  sportProfile: any;
  sideStats: any;
  pieData: any[];
  sidePieData: any[];
  sidePieLossData: any[];
  insights: any[];
  perfData: any[];
  monthlyData: any[];
  opponents: { id: string; name: string }[];
  matches: Match[];
  loadingMatches: boolean;
  meUid: string;
  config: SportConfig;
  oppStats: any[];
  targetProfile: UserProfile;
  tennisStats: any | null;
  achievements: any[];
}

const TennisStatsCard: FC<{
  stats: any;
  tennisStats: any;
  t: (k: string) => string;
}> = ({ stats, tennisStats, t }) => {
  return (
    <Card className='border-0 rounded-[2rem] glass-panel shadow-lg overflow-hidden relative'>
      <div className='absolute inset-0 bg-gradient-to-br from-emerald-500/5 to-transparent mix-blend-overlay pointer-events-none' />
      <CardHeader className='px-8 pt-8 pb-4 relative z-10'>
        <CardTitle className='flex items-center gap-3 text-2xl font-extrabold tracking-tight'>
          <div className='bg-emerald-500/10 p-2.5 rounded-xl ring-1 ring-emerald-500/20 text-emerald-600 dark:text-emerald-400'>
            <BarChart className='w-6 h-6' />
          </div>
          {t('Tennis Statistics')}
        </CardTitle>
      </CardHeader>
      <CardContent className='grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-6 text-sm px-8 pb-8 relative z-10'>
        <StatItem l={t('Sets Played')} v={stats.total} />
        <StatItem
          l={t('Sets W / L')}
          v={<span className='text-emerald-500 font-bold'>{stats.wins}</span>}
          suffix={` / ${stats.losses}`}
        />
        <StatItem l={t('Set Win Rate')} v={`${stats.winRate.toFixed(1)}%`} />
        <StatItem
          l={t('Max Win Streak')}
          v={
            <span className='flex items-center gap-1 text-orange-500'>
              <Flame className='w-3.5 h-3.5' />
              {stats.maxWinStreak}
            </span>
          }
        />
        <StatItem
          l={t('Games Won')}
          v={<span className='text-emerald-500'>{stats.pointsScored}</span>}
        />
        <StatItem
          l={t('Games Lost')}
          v={<span className='text-red-500'>{stats.pointsConceded}</span>}
        />
        <StatItem
          l={t('Game Diff')}
          v={
            <span
              className={
                stats.pointsDiff > 0 ? 'text-emerald-500' : 'text-red-500'
              }
            >
              {stats.pointsDiff > 0 ? `+${stats.pointsDiff}` : stats.pointsDiff}
            </span>
          }
        />
        <StatItem l={t('Aces')} v={tennisStats.aces} />
        <StatItem l={t('Double Faults')} v={tennisStats.doubleFaults} />
        <StatItem l={t('Winners')} v={tennisStats.winners} />
      </CardContent>
    </Card>
  );
};

function StatCard({
  icon: Icon,
  label,
  value,
}: {
  icon: any;
  label: string;
  value: string | number;
}) {
  return (
    <Card className='border-0 rounded-3xl glass-panel shadow-sm hover:shadow-md transition-shadow relative overflow-hidden group'>
      <div className='absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300' />
      <CardContent className='p-6 flex items-center gap-5 relative z-10'>
        <div className='bg-primary/10 p-3.5 rounded-2xl ring-1 ring-primary/20 text-primary shadow-sm group-hover:scale-110 transition-transform duration-300 ease-out'>
          <Icon className='h-6 w-6' />
        </div>
        <div className='flex flex-col gap-1'>
          <p className='text-3xl font-black text-foreground tracking-tight leading-none'>
            {value}
          </p>
          <p className='text-[10px] font-bold text-muted-foreground uppercase tracking-widest'>
            {label}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function DetailedStatsCard({
  stats,
  side,
  t,
}: {
  stats: any;
  side: any;
  t: (key: string) => string;
}) {
  return (
    <Card className='border-0 rounded-[2rem] glass-panel shadow-lg overflow-hidden relative'>
      <div className='absolute inset-0 bg-gradient-to-br from-blue-500/5 to-transparent mix-blend-overlay pointer-events-none' />
      <CardHeader className='px-8 pt-8 pb-4 relative z-10'>
        <CardTitle className='flex items-center gap-3 text-2xl font-extrabold tracking-tight'>
          <div className='bg-blue-500/10 p-2.5 rounded-xl ring-1 ring-blue-500/20 text-blue-600 dark:text-blue-400 flex items-center gap-1'>
            <CornerUpLeft className='w-4 h-4' />{' '}
            <CornerUpRight className='w-4 h-4' />
          </div>
          {t('Detailed Statistics')}
        </CardTitle>
      </CardHeader>
      <CardContent className='grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6 px-8 pb-8 relative z-10'>
        <StatItem l={t('Matches')} v={stats.total} />
        <StatItem
          l={t('Wins / Losses')}
          v={<span className='text-emerald-500 font-bold'>{stats.wins}</span>}
          suffix={` / ${stats.losses}`}
        />
        <StatItem l={t('Win Rate')} v={`${stats.winRate.toFixed(1)}%`} />
        <StatItem
          l={t('Best Margin')}
          v={<span className='text-emerald-500'>+{stats.bestWinMargin}</span>}
        />
        <StatItem
          l={t('Worst Margin')}
          v={<span className='text-red-500'>-{stats.worstLossMargin}</span>}
        />
        <StatItem
          l={t('Points Scored')}
          v={<span className='text-emerald-500'>{stats.pointsScored}</span>}
        />
        <StatItem
          l={t('Points Lost')}
          v={<span className='text-red-500'>{stats.pointsConceded}</span>}
        />
        <StatItem
          l={t('Point Diff')}
          v={
            <span
              className={
                stats.pointsDiff > 0 ? 'text-emerald-500' : 'text-red-500'
              }
            >
              {stats.pointsDiff > 0 ? `+${stats.pointsDiff}` : stats.pointsDiff}
            </span>
          }
        />
        <StatItem
          l={t('Max Win Streak')}
          v={
            <span className='flex items-center gap-1 text-orange-500'>
              <Flame className='w-3.5 h-3.5' />
              {stats.maxWinStreak}
            </span>
          }
        />
        <StatItem
          l={t('Max Loss Streak')}
          v={<span className='text-red-500'>{stats.maxLossStreak}</span>}
        />
        <StatItem
          l={t('Left Side W/L')}
          v={
            <span className='text-emerald-500 font-bold'>
              {side.leftSideWins}
            </span>
          }
          suffix={` / ${side.leftSideLosses}`}
        />
        <StatItem
          l={t('Right Side W/L')}
          v={
            <span className='text-emerald-500 font-bold'>
              {side.rightSideWins}
            </span>
          }
          suffix={` / ${side.rightSideLosses}`}
        />
      </CardContent>
    </Card>
  );
}

function StatItem({
  l,
  v,
  suffix,
}: {
  l: string;
  v: React.ReactNode;
  suffix?: string;
}) {
  return (
    <div className='flex flex-col gap-1.5 p-3 bg-background/40 backdrop-blur-sm rounded-2xl ring-1 ring-black/5 dark:ring-white/5 shadow-sm hover:shadow-md transition-shadow'>
      <p className='text-[10px] font-bold text-muted-foreground uppercase tracking-widest leading-tight'>
        {l}
      </p>
      <div className='text-2xl font-black tracking-tight flex items-baseline gap-1'>
        {v}{' '}
        <span className='text-base font-medium text-muted-foreground'>
          {suffix}
        </span>
      </div>
    </div>
  );
}

function MatchesTableCard({
  title,
  matches,
  loading,
  meUid,
  t,
  config,
}: {
  title: string;
  matches: Match[];
  loading: boolean;
  meUid: string;
  t: (key: string) => string;
  config: SportConfig;
}) {
  const [roomData, setRoomData] = useState<Map<string, Room>>(new Map());
  const { userProfile: viewerProfile } = useAuth();

  useEffect(() => {
    const fetchRoomData = async () => {
      if (!config || !db || matches.length === 0) return;
      const regularMatches = matches.filter((m) => !m.isTournamentReward);
      const roomIds = [
        ...new Set(regularMatches.map((m) => m.roomId).filter(Boolean)),
      ];
      const newIdsToFetch = roomIds.filter((id) => !roomData.has(id!));
      if (newIdsToFetch.length === 0) return;
      const newRoomData = new Map(roomData);
      const roomsCollectionName = config.collections.rooms;
      for (const roomId of newIdsToFetch) {
        const roomSnap = await getDoc(doc(db, roomsCollectionName, roomId!));
        if (roomSnap.exists()) {
          newRoomData.set(roomId!, { id: roomId, ...roomSnap.data() } as Room);
        }
      }
      setRoomData(newRoomData);
    };
    fetchRoomData();
  }, [matches, config, roomData]);

  const visibleMatches = useMemo(() => {
    return matches.filter((m) => {
      if (m.isTournamentReward) return true;
      const room = roomData.get(m.roomId!);
      if (!room) return false;
      if (room.isPublic) return true;
      return room.memberIds.includes(viewerProfile?.uid ?? '');
    });
  }, [matches, roomData, viewerProfile]);

  return (
    <Card className='border-0 rounded-[2rem] glass-panel shadow-xl overflow-hidden mt-8'>
      <CardHeader className='px-8 pt-8 pb-4'>
        <CardTitle className='text-2xl font-extrabold tracking-tight'>
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className='px-0 sm:px-8 pb-8'>
        {loading ? (
          <div className='flex flex-col items-center justify-center py-12'>
            <div className='w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mb-4' />
            <div className='text-muted-foreground font-medium'>
              {t('Loading…')}
            </div>
          </div>
        ) : visibleMatches.length === 0 ? (
          <p className='text-center py-12 text-muted-foreground font-light'>
            {t('No visible matches found.')}
          </p>
        ) : (
          <ScrollArea className='h-[400px] w-full'>
            <Table>
              <TableHeader>
                <TableRow className='border-b-0 hover:bg-transparent'>
                  <TableHead className='text-[10px] uppercase font-bold tracking-widest text-muted-foreground'>
                    {t('Date')}
                  </TableHead>
                  <TableHead className='text-[10px] uppercase font-bold tracking-widest text-muted-foreground'>
                    {t('Opponent / Event')}
                  </TableHead>
                  <TableHead className='text-[10px] uppercase font-bold tracking-widest text-muted-foreground'>
                    {t('Room')}
                  </TableHead>
                  <TableHead className='text-[10px] uppercase font-bold tracking-widest text-muted-foreground text-center'>
                    {t('Score / Rank')}
                  </TableHead>
                  <TableHead className='text-[10px] uppercase font-bold tracking-widest text-muted-foreground text-center'>
                    {t('Result')}
                  </TableHead>
                  <TableHead className='text-[10px] uppercase font-bold tracking-widest text-muted-foreground text-center'>
                    {t('ELO Δ')}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleMatches.map((m) => {
                  if (m.isTournamentReward) {
                    const date = safeFormatDate(
                      m.tsIso ?? m.timestamp ?? m.createdAt,
                      'dd.MM.yyyy',
                    );
                    const eventName = m.player2?.name || t('Tournament');
                    const eloDelta = m.player1?.addedPoints || 0;
                    const placeMatch = eventName.match(/#(\d+)/);
                    const place = placeMatch ? placeMatch[1] : '?';

                    return (
                      <TableRow
                        key={m.id}
                        className='bg-amber-500/10 hover:bg-amber-500/20 border-b-black/5 dark:border-b-white/5 transition-colors'
                      >
                        <TableCell className='font-medium text-xs text-muted-foreground whitespace-nowrap'>
                          {date}
                        </TableCell>
                        <TableCell className='font-bold flex items-center gap-2'>
                          <Trophy className='h-4 w-4 text-amber-500' />
                          {eventName.replace(/\s\(#\d+\)/, '')}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant='secondary'
                            className='bg-amber-500/20 text-amber-700 dark:text-amber-400 border-0 uppercase tracking-widest text-[9px] font-bold'
                          >
                            Tournament
                          </Badge>
                        </TableCell>
                        <TableCell className='text-center font-black text-lg text-amber-600'>
                          #{place}
                        </TableCell>
                        <TableCell className='text-center text-amber-600 font-bold uppercase tracking-wider text-xs'>
                          {t('Award')}
                        </TableCell>
                        <TableCell className='text-center text-emerald-500 font-black text-base'>
                          +{eloDelta}
                        </TableCell>
                      </TableRow>
                    );
                  }
                  const room = roomData.get(m.roomId!);
                  const isP1 = m.player1Id === meUid;
                  const date = safeFormatDate(
                    m.tsIso ?? m.timestamp ?? m.createdAt ?? m.playedAt,
                    'MMM d, HH:mm',
                  );
                  const opp = isP1 ? m.player2.name : m.player1.name;
                  const myScore = isP1 ? m.player1.scores : m.player2.scores;
                  const theirScore = isP1 ? m.player2.scores : m.player1.scores;
                  const eloΔ = isP1
                    ? m.player1.addedPoints
                    : m.player2.addedPoints;
                  const win = myScore > theirScore;
                  const isRanked = m.isRanked !== false;
                  return (
                    <TableRow
                      key={m.id}
                      className='border-b-border/40 hover:bg-muted/30 transition-colors'
                    >
                      <TableCell className='text-xs font-medium text-muted-foreground whitespace-nowrap'>
                        {date}
                      </TableCell>
                      <TableCell className='font-semibold text-sm'>
                        {opp}
                      </TableCell>
                      <TableCell>
                        {room ? (
                          <Badge
                            variant='outline'
                            className='font-medium bg-background/50 border-0 ring-1 ring-black/5 dark:ring-white/10 px-2 py-0.5 rounded-md'
                          >
                            {room.name}
                          </Badge>
                        ) : (
                          <span className='text-muted-foreground/50 text-xs italic'>
                            N/A
                          </span>
                        )}
                      </TableCell>
                      <TableCell className='text-center font-mono font-bold text-base bg-muted/10'>
                        {myScore} <span className='opacity-30 px-1'>-</span>{' '}
                        {theirScore}
                      </TableCell>
                      <TableCell className='text-center'>
                        <Badge
                          variant='outline'
                          className={`border-0 uppercase tracking-widest text-[9px] font-bold px-2 py-0.5 ${win ? 'bg-emerald-500/10 text-emerald-600 ring-1 ring-emerald-500/30' : 'bg-red-500/10 text-red-600 ring-1 ring-red-500/30'}`}
                        >
                          {win ? t('Win') : t('Loss')}
                        </Badge>
                      </TableCell>
                      <TableCell
                        className={`text-center font-mono text-sm ${
                          !isRanked
                            ? 'text-muted-foreground'
                            : eloΔ >= 0
                              ? 'text-emerald-500 font-bold'
                              : 'text-red-500 font-bold'
                        }`}
                      >
                        {isRanked ? (eloΔ > 0 ? `+${eloΔ}` : eloΔ) : '–'}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}

export const ProfileContent: React.FC<ProfileContentProps> = ({
  canViewProfile,
  sport,
  stats,
  sportProfile,
  sideStats,
  matches,
  loadingMatches,
  meUid,
  config,
  tennisStats,
  achievements,
  opponents,
  perfData,
  monthlyData,
}) => {
  const { t } = useTranslation();
  const [oppFilter, setOppFilter] = useState('all');

  const filteredMatchesAll = useMemo(
    () =>
      oppFilter === 'all'
        ? matches
        : matches.filter(
            (m) =>
              (m.player1Id === meUid && m.player2Id === oppFilter) ||
              (m.player2Id === meUid && m.player1Id === oppFilter),
          ),
    [matches, oppFilter, meUid],
  );

  const realMatches = useMemo(
    () => filteredMatchesAll.filter((m) => !m.isTournamentReward),
    [filteredMatchesAll],
  );

  const filteredRanked = useMemo(
    () => realMatches.filter((m) => m.isRanked !== false),
    [realMatches],
  );

  const derivedInsights = useMemo(
    () =>
      buildInsights(filteredRanked, meUid, stats, sideStats, monthlyData, t),
    [filteredRanked, meUid, stats, sideStats, monthlyData, t],
  );

  const winRateTrend = useMemo(() => {
    if (oppFilter === 'all') return null;
    const chronological = [...filteredRanked].sort((a, b) => {
      const dateA = parseFlexDate(a.tsIso ?? a.timestamp).getTime();
      const dateB = parseFlexDate(b.tsIso ?? b.timestamp).getTime();
      return dateA - dateB;
    });

    if (chronological.length === 0) return null;

    let wins = 0;
    let total = 0;

    return chronological.map((m, i) => {
      const isP1 = m.player1Id === meUid;
      const myScore = isP1 ? m.player1.scores : m.player2.scores;
      const oppScore = isP1 ? m.player2.scores : m.player1.scores;

      if (myScore > oppScore) wins++;
      total++;

      const dateLabel = safeFormatDate(m.tsIso ?? m.timestamp, 'dd.MM');

      return {
        matchIndex: i + 1,
        label: dateLabel,
        date: safeFormatDate(m.tsIso ?? m.timestamp, 'dd.MM.yyyy'),
        winRate: (wins / total) * 100,
        wins,
        total,
      };
    });
  }, [filteredRanked, oppFilter, meUid]);

  const derivedStats = useMemo(
    () => computeStats(filteredRanked, meUid),
    [filteredRanked, meUid],
  );
  const derivedSideStats = useMemo(
    () =>
      sport === 'tennis'
        ? {
            leftSideWins: 0,
            leftSideLosses: 0,
            rightSideWins: 0,
            rightSideLosses: 0,
          }
        : computeSideStats(filteredRanked, meUid),
    [filteredRanked, meUid, sport],
  );
  const derivedPieData = useMemo(
    () => [
      {
        name: t('Wins'),
        value: derivedStats.wins,
        fill: 'hsl(var(--emerald-500))',
      },
      {
        name: t('Losses'),
        value: derivedStats.losses,
        fill: 'hsl(var(--red-500))',
      },
    ],
    [derivedStats, t],
  );
  const derivedSidePieData = useMemo(
    () => [
      {
        name: t('Left Wins'),
        value: derivedSideStats.leftSideWins,
        fill: 'hsl(var(--primary))',
      },
      {
        name: t('Right Wins'),
        value: derivedSideStats.rightSideWins,
        fill: 'hsl(var(--accent))',
      },
    ],
    [derivedSideStats, t],
  );
  const derivedSidePieLossData = useMemo(
    () => [
      {
        name: t('Left Losses'),
        value: derivedSideStats.leftSideLosses,
        fill: 'hsl(var(--destructive))',
      },
      {
        name: t('Right Losses'),
        value: derivedSideStats.rightSideLosses,
        fill: 'hsl(var(--muted))',
      },
    ],
    [derivedSideStats, t],
  );
  const derivedMonthly = useMemo(
    () => groupByMonth(filteredRanked, meUid),
    [filteredRanked, meUid],
  );
  const derivedOppStats = useMemo(
    () => opponentStats(filteredRanked, meUid),
    [filteredRanked, meUid],
  );

  const selectedOpponentName = opponents.find((o) => o.id === oppFilter)?.name;

  if (!canViewProfile) {
    return (
      <Card className='border-0 rounded-[2.5rem] glass-panel shadow-xl mt-8'>
        <CardContent className='py-20 flex flex-col items-center justify-center text-center'>
          <div className='bg-background/80 p-6 rounded-full mb-6 ring-1 ring-black/5 dark:ring-white/10 shadow-sm'>
            <Lock className='h-12 w-12 text-muted-foreground/50' />
          </div>
          <h3 className='text-3xl font-extrabold tracking-tight mb-2'>
            {t('This Profile is Private')}
          </h3>
          <p className='text-muted-foreground text-lg font-light'>
            {t('Add this player as a friend to view their stats.')}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className='space-y-8 mt-8'>
      <div className='grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6'>
        <StatCard
          icon={LineChartIcon}
          label={t('Current ELO')}
          value={sportProfile?.globalElo?.toFixed(0) ?? '1000'}
        />
        <StatCard
          icon={ListOrdered}
          label={t('Ranked Matches')}
          value={derivedStats.total}
        />
        <StatCard
          icon={Percent}
          label={t('Win Rate (Ranked)')}
          value={`${derivedStats.winRate.toFixed(1)}%`}
        />
        <StatCard
          icon={Flame}
          label={t('Max Streak (Ranked)')}
          value={derivedStats.maxWinStreak}
        />
      </div>

      <AchievementsPanel
        allAchievements={achievements}
        sport={sport}
        sportMatches={derivedStats.total}
        sportWins={derivedStats.wins}
        sportWinRate={derivedStats.winRate}
        sportMaxStreak={derivedStats.maxWinStreak}
      />

      <div className='flex flex-col sm:flex-row sm:items-center gap-4 bg-muted/30 p-4 rounded-2xl ring-1 ring-black/5 dark:ring-white/10 backdrop-blur-xl max-w-2xl'>
        <span className='font-bold text-xs uppercase tracking-widest text-muted-foreground ml-2'>
          {t('Filter by Opponent')}:
        </span>
        <Select value={oppFilter} onValueChange={setOppFilter}>
          <SelectTrigger className='w-full sm:w-64 h-12 rounded-xl bg-background border-0 ring-1 ring-black/5 dark:ring-white/10 shadow-sm font-semibold focus:ring-2 focus:ring-primary/40'>
            <SelectValue placeholder={t('All Opponents')} />
          </SelectTrigger>
          <SelectContent className='rounded-xl border-0 glass-panel shadow-xl'>
            <SelectItem
              value='all'
              className='font-semibold cursor-pointer rounded-lg'
            >
              {t('All Opponents')}
            </SelectItem>
            {opponents.map((o: any) => (
              <SelectItem
                key={o.id}
                value={o.id}
                className='cursor-pointer rounded-lg font-medium'
              >
                {o.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {(sport === 'pingpong' || sport === 'badminton') && (
        <DetailedStatsCard stats={derivedStats} side={derivedSideStats} t={t} />
      )}
      {sport === 'tennis' && tennisStats && (
        <TennisStatsCard stats={derivedStats} tennisStats={tennisStats} t={t} />
      )}

      <RankedInsights insights={derivedInsights} t={t} />

      <ProfileCharts
        t={t}
        pieData={derivedPieData}
        sidePieData={derivedSidePieData}
        sidePieLossData={derivedSidePieLossData}
        perfData={perfData as any}
        monthlyData={derivedMonthly as any}
        oppStats={derivedOppStats as any}
        compact={false}
        winRateTrend={winRateTrend}
        selectedOpponentName={selectedOpponentName}
      />

      <MatchesTableCard
        title={`${t('Matches')} (${filteredMatchesAll.length})`}
        matches={filteredMatchesAll}
        loading={loadingMatches}
        meUid={meUid}
        t={t}
        config={config}
      />
    </div>
  );
};
