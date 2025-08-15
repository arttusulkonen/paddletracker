// src/components/profile/ProfileContent.tsx
'use client';

import AchievementsPanel from '@/components/AchievementsPanel';
import {
  Badge,
  Card,
  CardContent,
  CardDescription,
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

// ✅ ОБНОВЛЕННЫЙ КОМПОНЕНТ СТАТИСТИКИ ТЕННИСА
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
        {/* Статистика по сетам */}
        <StatItem l={t('Sets Played')} v={stats.total} />
        <StatItem l={t('Sets W / L')} v={`${stats.wins} / ${stats.losses}`} />
        <StatItem l={t('Set Win Rate')} v={`${stats.winRate.toFixed(2)}%`} />
        <StatItem l={t('Max Win Streak')} v={stats.maxWinStreak} />
        {/* Статистика по геймам */}
        <StatItem l={t('Games Won')} v={stats.pointsScored} />
        <StatItem l={t('Games Lost')} v={stats.pointsConceded} />
        <StatItem l={t('Game Difference')} v={stats.pointsDiff} />
        {/* Специфичная для тенниса статистика */}
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
      const roomIds = [
        ...new Set(matches.map((m) => m.roomId).filter(Boolean)),
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
                  <TableHead>{t('Opponent')}</TableHead>
                  <TableHead>{t('Room')}</TableHead>
                  <TableHead>{t('Score')}</TableHead>
                  <TableHead>{t('Result')}</TableHead>
                  <TableHead>{t('ELO Δ')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleMatches.map((m) => {
                  const room = roomData.get(m.roomId!);
                  const isP1 = m.player1Id === meUid;
                  const date = safeFormatDate(
                    m.tsIso ?? m.timestamp ?? m.createdAt ?? m.playedAt,
                    'dd.MM.yyyy HH:mm:ss'
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
                      <TableCell>{date}</TableCell>
                      <TableCell>{opp}</TableCell>
                      <TableCell>
                        {room && <Badge variant='outline'>{room.name}</Badge>}
                      </TableCell>
                      <TableCell>
                        {myScore} – {theirScore}
                      </TableCell>
                      <TableCell
                        className={win ? 'text-green-600' : 'text-destructive'}
                      >
                        {win ? t('Win') : t('Loss')}
                      </TableCell>
                      <TableCell
                        className={
                          !isRanked
                            ? 'text-muted-foreground'
                            : eloΔ >= 0
                            ? 'text-green-600'
                            : 'text-destructive'
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
  insights,
  opponents,
  ...props
}) => {
  const { t } = useTranslation();
  const [oppFilter, setOppFilter] = useState('all');

  const filteredMatches = useMemo(
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
              <Label className='font-semibold'>Viewing Stats For:</Label>
              <Select
                value={sport}
                onValueChange={(v) => onSportChange(v as Sport)}
              >
                <SelectTrigger className='w-auto'>
                  <SelectValue placeholder='Select a sport' />
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
          value={stats.total}
        />
        <StatCard
          icon={Percent}
          label={t('Win Rate (Ranked)')}
          value={`${stats.winRate.toFixed(1)}%`}
        />
        <StatCard
          icon={Flame}
          label={t('Max Streak (Ranked)')}
          value={stats.maxWinStreak}
        />
      </div>

      <AchievementsPanel
        allAchievements={achievements}
        sport={sport}
        sportMatches={stats.total}
        sportWins={stats.wins}
        sportWinRate={stats.winRate}
        sportMaxStreak={stats.maxWinStreak}
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

      {sport === 'pingpong' && (
        <DetailedStatsCard stats={stats} side={sideStats} t={t} />
      )}
      {sport === 'tennis' && tennisStats && (
        <TennisStatsCard stats={stats} tennisStats={tennisStats} t={t} />
      )}

      {insights.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className='flex items-center gap-2'>
              <LineChartIcon /> {t('Ranked Insights')}
            </CardTitle>
            <CardDescription>
              {t('Automatic game analysis on ranked matches')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className='space-y-3'>
              {insights.map((i, idx) => (
                <li key={idx} className='flex items-start gap-3'>
                  <i.icon className={`h-5 w-5 ${i.color} shrink-0`} />
                  <span dangerouslySetInnerHTML={{ __html: i.text }} />
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <MatchesTableCard
        title={`${t('Matches')} (${filteredMatches.length})`}
        matches={filteredMatches}
        loading={loadingMatches}
        meUid={meUid}
        t={t}
        config={config}
      />
    </div>
  );
};
