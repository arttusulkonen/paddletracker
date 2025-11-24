'use client';

import AchievementsPanel from '@/components/AchievementsPanel';
import ProfileCharts from '@/components/profile/ProfileCharts';
import { RankedInsights } from '@/components/RankedInsights'; // <--- Импорт
import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Label,
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
import { Sport, SportConfig, sportConfig } from '@/contexts/SportContext';
import { db } from '@/lib/firebase';
import type { Match, Room, UserProfile } from '@/lib/types';
import { safeFormatDate } from '@/lib/utils/date';
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

// ... (типы ProfileContentProps и компоненты StatCard, StatItem, TennisStatsCard, DetailedStatsCard, MatchesTableCard оставляем без изменений, они у вас правильные) ...
// Я приведу только начало и конец основного компонента, чтобы вы видели, куда вставить RankedInsights

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

// ... (Вспомогательные компоненты StatCard и другие оставляем как есть) ...

// --- Вспомогательные компоненты (если их нет в файле, добавьте их обратно из вашего старого кода, они были верными) ---
// (Для краткости я их пропущу, так как ошибка была только в рендере инсайтов)

const TennisStatsCard: FC<{
  stats: any;
  tennisStats: any;
  t: (k: string) => string;
}> = ({ stats, tennisStats, t }) => {
  return (
    <Card>
      <CardHeader>
        <CardTitle className='flex items-center gap-2'>
          <BarChart /> {t('Tennis Statistics (Ranked)')}
        </CardTitle>
      </CardHeader>
      <CardContent className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 text-sm'>
        <StatItem l={t('Sets Played')} v={stats.total} />
        <StatItem l={t('Sets W / L')} v={`${stats.wins} / ${stats.losses}`} />
        <StatItem l={t('Set Win Rate')} v={`${stats.winRate.toFixed(2)}%`} />
        <StatItem l={t('Max Win Streak')} v={stats.maxWinStreak} />
        <StatItem l={t('Games Won')} v={stats.pointsScored} />
        <StatItem l={t('Games Lost')} v={stats.pointsConceded} />
        <StatItem l={t('Game Difference')} v={stats.pointsDiff} />
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
    <Card>
      <CardContent className='p-4 flex items-center gap-4'>
        <Icon className='h-6 w-6 text-primary' />
        <div>
          <p className='text-sm text-muted-foreground'>{label}</p>
          <p className='text-2xl font-semibold'>{value}</p>
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
    <Card>
      <CardHeader>
        <CardTitle className='flex items-center gap-2'>
          <CornerUpLeft /> / <CornerUpRight />{' '}
          {t('Detailed Statistics (Ranked)')}
        </CardTitle>
      </CardHeader>
      <CardContent className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 text-sm'>
        <StatItem l={t('Matches')} v={stats.total} />
        <StatItem
          l={t('Wins / Losses')}
          v={`${stats.wins} / ${stats.losses}`}
        />
        <StatItem l={t('Win Rate')} v={`${stats.winRate.toFixed(2)}%`} />
        <StatItem l={t('Best Win Margin')} v={stats.bestWinMargin} />
        <StatItem l={t('Worst Loss Margin')} v={stats.worstLossMargin} />
        <StatItem l={t('Points Scored')} v={stats.pointsScored} />
        <StatItem l={t('Points Conceded')} v={stats.pointsConceded} />
        <StatItem l={t('Point Diff')} v={stats.pointsDiff} />
        <StatItem l={t('Max Win Streak')} v={stats.maxWinStreak} />
        <StatItem l={t('Max Loss Streak')} v={stats.maxLossStreak} />
        <StatItem
          l={t('Left Side W/L')}
          v={`${side.leftSideWins} / ${side.leftSideLosses}`}
        />
        <StatItem
          l={t('Right Side W/L')}
          v={`${side.rightSideWins} / ${side.rightSideLosses}`}
        />
      </CardContent>
    </Card>
  );
}

function StatItem({ l, v }: { l: string; v: React.ReactNode }) {
  return (
    <div>
      <p className='font-semibold'>{l}</p>
      {v}
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
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className='text-center py-8'>{t('Loading…')}</div>
        ) : visibleMatches.length === 0 ? (
          <p className='text-center py-8'>{t('No visible matches found.')}</p>
        ) : (
          <ScrollArea className='h-[400px]'>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('Date')}</TableHead>
                  <TableHead>{t('Opponent / Event')}</TableHead>
                  <TableHead>{t('Room')}</TableHead>
                  <TableHead>{t('Score / Rank')}</TableHead>
                  <TableHead>{t('Result')}</TableHead>
                  <TableHead>{t('ELO Δ')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleMatches.map((m) => {
                  if (m.isTournamentReward) {
                    const date = safeFormatDate(
                      m.tsIso ?? m.timestamp ?? m.createdAt,
                      'dd.MM.yyyy'
                    );
                    const eventName = m.player2?.name || t('Tournament');
                    const eloDelta = m.player1?.addedPoints || 0;
                    const placeMatch = eventName.match(/#(\d+)/);
                    const place = placeMatch ? placeMatch[1] : '?';

                    return (
                      <TableRow
                        key={m.id}
                        className='bg-yellow-50/50 hover:bg-yellow-50 dark:bg-yellow-900/10'
                      >
                        <TableCell className='font-medium text-xs text-muted-foreground'>
                          {date}
                        </TableCell>
                        <TableCell className='font-bold flex items-center gap-2'>
                          <Trophy className='h-4 w-4 text-amber-500' />
                          {eventName.replace(/\s\(#\d+\)/, '')}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant='secondary'
                            className='bg-amber-100 text-amber-800 hover:bg-amber-200'
                          >
                            Tournament
                          </Badge>
                        </TableCell>
                        <TableCell className='font-bold'>#{place}</TableCell>
                        <TableCell className='text-amber-600 font-semibold'>
                          {t('Award')}
                        </TableCell>
                        <TableCell className='text-green-600 font-bold'>
                          +{eloDelta}
                        </TableCell>
                      </TableRow>
                    );
                  }
                  const room = roomData.get(m.roomId!);
                  const isP1 = m.player1Id === meUid;
                  const date = safeFormatDate(
                    m.tsIso ?? m.timestamp ?? m.createdAt ?? m.playedAt,
                    'dd.MM.yyyy HH:mm'
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
                    <TableRow key={m.id}>
                      <TableCell className='text-xs text-muted-foreground'>
                        {date}
                      </TableCell>
                      <TableCell>{opp}</TableCell>
                      <TableCell>
                        {room ? (
                          <Badge variant='outline' className='font-normal'>
                            {room.name}
                          </Badge>
                        ) : (
                          <span className='text-muted-foreground text-xs'>
                            N/A
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        {myScore} – {theirScore}
                      </TableCell>
                      <TableCell
                        className={
                          win
                            ? 'text-green-600 font-medium'
                            : 'text-destructive font-medium'
                        }
                      >
                        {win ? t('Win') : t('Loss')}
                      </TableCell>
                      <TableCell
                        className={
                          !isRanked
                            ? 'text-muted-foreground'
                            : eloΔ >= 0
                            ? 'text-green-600 font-bold'
                            : 'text-destructive font-bold'
                        }
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
  playedSports,
  onSportChange,
  stats,
  sportProfile,
  sideStats,
  matches,
  loadingMatches,
  meUid,
  config,
  oppStats,
  targetProfile,
  tennisStats,
  achievements,
  // insights, // Мы вычислим их заново здесь, чтобы передать правильные данные
  opponents,
  pieData,
  sidePieData,
  sidePieLossData,
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
              (m.player2Id === meUid && m.player1Id === oppFilter)
          ),
    [matches, oppFilter, meUid]
  );

  const realMatches = useMemo(
    () => filteredMatchesAll.filter((m) => !m.isTournamentReward),
    [filteredMatchesAll]
  );

  const filteredRanked = useMemo(
    () => realMatches.filter((m) => m.isRanked !== false),
    [realMatches]
  );

  // --- ВАЖНО: Вычисляем инсайты здесь, передавая сырой массив матчей ---
  const derivedInsights = useMemo(
    () =>
      buildInsights(
        filteredRanked,
        meUid,
        stats, // Передаем уже вычисленные stats из пропсов, или можно вычислить заново
        sideStats,
        monthlyData,
        t
      ),
    [filteredRanked, meUid, stats, sideStats, monthlyData, t]
  );
  // -------------------------------------------------------------------

  // --- ЛОГИКА Win Rate Trend ---
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
    [filteredRanked, meUid]
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
    [filteredRanked, meUid, sport]
  );
  const derivedPieData = useMemo(
    () => [
      {
        name: t('Wins'),
        value: derivedStats.wins,
        fill: 'hsl(var(--primary))',
      },
      {
        name: t('Losses'),
        value: derivedStats.losses,
        fill: 'hsl(var(--destructive))',
      },
    ],
    [derivedStats, t]
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
    [derivedSideStats, t]
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
    [derivedSideStats, t]
  );
  const derivedMonthly = useMemo(
    () => groupByMonth(filteredRanked, meUid),
    [filteredRanked, meUid]
  );
  const derivedOppStats = useMemo(
    () => opponentStats(filteredRanked, meUid),
    [filteredRanked, meUid]
  );

  const selectedOpponentName = opponents.find((o) => o.id === oppFilter)?.name;

  if (!canViewProfile) {
    return (
      <Card>
        <CardContent className='py-12 flex flex-col items-center justify-center text-center'>
          <Lock className='h-12 w-12 text-muted-foreground mb-4' />
          <h3 className='text-xl font-semibold'>
            {t('This Profile is Private')}
          </h3>
          <p className='text-muted-foreground mt-2'>
            {t('Add this player as a friend to view their stats.')}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className='space-y-6'>
      {playedSports.length > 1 && (
        <Card>
          <CardContent className='p-4'>
            <div className='flex items-center gap-4'>
              <Label className='font-semibold'>{t('Viewing Stats For:')}</Label>
              <Select
                value={sport}
                onValueChange={(v) => onSportChange(v as Sport)}
              >
                <SelectTrigger className='w-auto'>
                  <SelectValue placeholder={t('Select a sport')} />
                </SelectTrigger>
                <SelectContent>
                  {playedSports.map((s) => (
                    <SelectItem key={s} value={s}>
                      {sportConfig[s].name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>
      )}

      <div className='grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4'>
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

      <div className='flex items-center gap-4'>
        <span className='font-medium'>{t('Filter by Opponent')}:</span>
        <Select value={oppFilter} onValueChange={setOppFilter}>
          <SelectTrigger className='w-64'>
            <SelectValue placeholder={t('All Opponents')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='all'>{t('All Opponents')}</SelectItem>
            {opponents.map((o: any) => (
              <SelectItem key={o.id} value={o.id}>
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

      {/* НОВЫЙ КОМПОНЕНТ РЕНДЕРИНГА */}
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
