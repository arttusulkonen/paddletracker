// src/components/ProfileStats.tsx
'use client';

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  ScrollArea,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/lib/firebase';
import { Match, Room, SportConfig } from '@/lib/types';
import { safeFormatDate } from '@/lib/utils/date';
import { doc, getDoc } from 'firebase/firestore';
import {
  CornerUpLeft,
  CornerUpRight,
  PieChart as PieChartIcon,
} from 'lucide-react';
import { FC, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Pie,
  PieChart,
  Legend as ReLegend,
  ResponsiveContainer,
} from 'recharts';

// Типы для пропсов
type Stats = {
  total: number;
  wins: number;
  losses: number;
  winRate: number;
  bestWinMargin: number;
  worstLossMargin: number;
  pointsScored: number;
  pointsConceded: number;
  pointsDiff: number;
  maxWinStreak: number;
  maxLossStreak: number;
};
type SideStats = {
  leftSideWins: number;
  leftSideLosses: number;
  rightSideWins: number;
  rightSideLosses: number;
};
type OpponentStats = {
  name: string;
  wins: number;
  losses: number;
  elo: number;
  winRate: number;
};

interface ProfileStatsProps {
  stats: Stats;
  sideStats: SideStats;
  pieData: { name: string; value: number; fill: string }[];
  sidePieData: { name: string; value: number; fill: string }[];
  sidePieLossData: { name: string; value: number; fill: string }[];
  matches: Match[];
  loading: boolean;
  meUid: string;
  config: SportConfig;
  oppStats: OpponentStats[];
}

function StatItem({ l, v }: { l: string; v: React.ReactNode }) {
  return (
    <div>
      <p className='font-semibold'>{l}</p>
      {v}
    </div>
  );
}

function DetailedStatsCard({
  stats,
  side,
  t,
}: {
  stats: Stats;
  side: SideStats;
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

function PieCard({
  title,
  icon: Icon,
  data,
}: {
  title: string;
  icon: React.ElementType;
  data: { name: string; value: number; fill: string }[];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className='flex items-center gap-2'>
          <Icon className='h-5 w-5' /> {title}
        </CardTitle>
      </CardHeader>
      <CardContent className='h-[350px] w-full'>
        <ResponsiveContainer width='100%' height='100%'>
          <PieChart>
            <Pie
              data={data}
              dataKey='value'
              nameKey='name'
              cx='50%'
              cy='50%'
              outerRadius={80}
              label
            />
            <ReLegend />
          </PieChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
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

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className='text-center py-8'>{t('Loading…')}</div>
        ) : matches.length === 0 ? (
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
                {matches.map((m) => {
                  const room = roomData.get(m.roomId!);
                  const isP1 = m.player1Id === meUid;
                  const date = safeFormatDate(m.tsIso, 'dd.MM.yyyy HH:mm');
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
                        {room ? (
                          <Badge variant='outline'>{room.name}</Badge>
                        ) : (
                          'N/A'
                        )}
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

export const ProfileStats: FC<ProfileStatsProps> = ({
  stats,
  sideStats,
  pieData,
  sidePieData,
  sidePieLossData,
  matches,
  loading,
  meUid,
  config,
  oppStats,
}) => {
  const { t } = useTranslation();
  return (
    <>
      <div className='grid grid-cols-1 md:grid-cols-2 gap-4 items-stretch'>
        <div className='flex flex-col gap-4'>
          <PieCard
            title={t('Win / Loss (Ranked)')}
            icon={PieChartIcon}
            data={pieData}
          />
        </div>
        <div className='flex flex-col gap-4'>
          <PieCard
            title={t('Left vs Right Wins (Ranked)')}
            icon={PieChartIcon}
            data={sidePieData}
          />
          <PieCard
            title={t('Left vs Right Losses (Ranked)')}
            icon={PieChartIcon}
            data={sidePieLossData}
          />
        </div>
      </div>
      <DetailedStatsCard stats={stats} side={sideStats} t={t} />
      <MatchesTableCard
        title={`${t('All Matches')} (${matches.length})`}
        matches={matches}
        loading={loading}
        meUid={meUid}
        t={t}
        config={config}
      />
      <Card>
        <CardHeader>
          <CardTitle>{t('Performance vs Opponents (Ranked)')}</CardTitle>
        </CardHeader>
        <CardContent>
          <ScrollArea>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('Opponent')}</TableHead>
                  <TableHead>{t('W / L')}</TableHead>
                  <TableHead>{t('Win %')}</TableHead>
                  <TableHead>{t('ELO Δ')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {oppStats.map((o) => (
                  <TableRow key={o.name}>
                    <TableCell>{o.name}</TableCell>
                    <TableCell>
                      {o.wins} / {o.losses}
                    </TableCell>
                    <TableCell>{o.winRate.toFixed(1)}%</TableCell>
                    <TableCell
                      className={
                        o.elo >= 0 ? 'text-accent' : 'text-destructive'
                      }
                    >
                      {o.elo > 0 ? `+${o.elo}` : o.elo}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ScrollArea>
        </CardContent>
      </Card>
    </>
  );
};
