// src/components/AchievementsPanel.tsx

'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { safeFormatDate } from '@/lib/utils/date';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { FaLock, FaMedal, FaTrophy } from 'react-icons/fa';
import { GiFlame, GiPingPongBat } from 'react-icons/gi';

interface Achievement {
  type: string;
  dateFinished: string;
  place?: number;
  matchesPlayed?: number;
  wins?: number;
  roomName?: string;
  description?: string;
}

interface Props {
  achievements: Achievement[];
  overallMatches: number;
  overallWins: number;
  overallWinRate: number;
  overallMaxStreak: number;
}

// Kynnysarvot
const OVERALL_MATCH_THRESHOLDS = [
  10, 20, 50, 100, 200, 500, 1000, 2000, 3000, 5000,
];
const OVERALL_WIN_THRESHOLDS = [
  10, 20, 50, 100, 200, 500, 1000, 2000, 3000, 5000,
];
const OVERALL_STREAK_THRESHOLDS = [5, 10, 15, 20, 25, 30, 50, 75, 100];

const SEASON_MATCH_THRESHOLDS = [5, 10, 20, 50, 100, 200, 300];
const SEASON_WIN_THRESHOLDS = [5, 10, 20, 40, 60, 80, 100, 150, 200];
const TOURNAMENT_THRESHOLDS = [1, 5, 10, 25, 50, 100, 200, 500];

// ИЗМЕНЕНО: Старая функция больше не нужна, но ее можно оставить, если используется где-то еще.
const countSeasonsAtOrAbove = (
  arr: Achievement[],
  prop: 'matchesPlayed' | 'wins',
  thr: number
) =>
  arr.filter((a) => a.type === 'seasonFinish' && (a[prop] ?? 0) >= thr).length;

// НОВАЯ ФУНКЦИЯ: возвращает массив сезонов, достигших порога
const getSeasonsAtOrAbove = (
  arr: Achievement[],
  prop: 'matchesPlayed' | 'wins',
  thr: number
) => arr.filter((a) => a.type === 'seasonFinish' && (a[prop] ?? 0) >= thr);

const datesForPlace = (arr: Achievement[], place: number, type: string) =>
  arr
    .filter((a) => a.type === type && a.place === place)
    .map((a) => a.dateFinished);

const tournamentCount = (arr: Achievement[]) =>
  arr.filter((a) => a.type === 'tournamentFinish').length;

export default function AchievementsPanel({
  achievements = [],
  overallMatches = 0,
  overallWins = 0,
  overallWinRate = 0,
  overallMaxStreak = 0,
}: Props) {
  const { t } = useTranslation();

  if (!achievements.length) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t('Achievements')}</CardTitle>
        </CardHeader>
        <CardContent>{t('No season achievements yet.')}</CardContent>
      </Card>
    );
  }

  const seasonStars = [1, 2, 3].map((pl) => {
    const cnt = datesForPlace(achievements, pl, 'seasonFinish').length;
    return {
      label: `${t('Season Podium')} #${pl}`,
      icon: <FaMedal color={['#ffd700', '#c0c0c0', '#cd7f32'][pl - 1]} />,
      unlocked: cnt > 0,
      count: cnt,
      tooltip: cnt
        ? `${t('Podium #')}${pl} ${t('on:')}\n${datesForPlace(
            achievements,
            pl,
            'seasonFinish'
          ).join('\n')}`
        : `${t('Reach podium #')}${pl} ${t('in a season')}`,
    };
  });

  const tournStars = [1, 2, 3].map((pl) => {
    const cnt = datesForPlace(achievements, pl, 'tournamentFinish').length;
    return {
      label: `${t('Tournament Podium')} #${pl}`,
      icon: <FaTrophy color={['#ffd700', '#c0c0c0', '#cd7f32'][pl - 1]} />,
      unlocked: cnt > 0,
      count: cnt,
      tooltip: cnt
        ? `${t('Podium #')}${pl} ${t('on:')}\n${datesForPlace(
            achievements,
            pl,
            'tournamentFinish'
          ).join('\n')}`
        : `${t('Reach tournament podium #')}${pl}`,
    };
  });

  const tPlayed = tournamentCount(achievements);
  const tournamentMilestones = TOURNAMENT_THRESHOLDS.map((thr) => ({
    label: `${t('Played')} ${thr}+ ${t('Tournaments')}`,
    icon: <FaTrophy />,
    unlocked: tPlayed >= thr,
    tooltip:
      tPlayed >= thr
        ? `${t('You played')} ${tPlayed} ${t('tournaments')} (>= ${thr})`
        : `${t('Play')} ${thr} ${t('tournaments to unlock')}`,
  }));

  const overallMatchMilestones = OVERALL_MATCH_THRESHOLDS.map((thr) => ({
    label: `${t('Played')} ${thr}+ ${t('Matches')}`,
    icon: <GiPingPongBat />,
    unlocked: overallMatches >= thr,
    tooltip:
      overallMatches >= thr
        ? `${t('You played')} ${overallMatches} ${t('matches')} (>= ${thr})`
        : `${t('Play')} ${thr} ${t('matches to unlock')}`,
  }));

  const overallWinMilestones = OVERALL_WIN_THRESHOLDS.map((thr) => ({
    label: `${t('Won')} ${thr}+ ${t('Matches')}`,
    icon: <FaTrophy />,
    unlocked: overallWins >= thr,
    tooltip:
      overallWins >= thr
        ? `${t('You have')} ${overallWins} ${t(
            'wins'
          )} (${overallWinRate.toFixed(1)}% ${t('win rate')})`
        : `${t('Win')} ${thr} ${t('matches to unlock')}`,
  }));

  const overallStreakMilestones = OVERALL_STREAK_THRESHOLDS.map((thr) => ({
    label: `${t('Win Streak')} ${thr}+`,
    icon: <GiFlame />,
    unlocked: overallMaxStreak >= thr,
    tooltip:
      overallMaxStreak >= thr
        ? `${t('Your best streak is')} ${overallMaxStreak} (>= ${thr})`
        : `${t('Get a streak of')} ${thr} ${t('to unlock')}`,
  }));

  const seasonMatchMilestones = SEASON_MATCH_THRESHOLDS.map((thr) => {
    const qualifyingSeasons = getSeasonsAtOrAbove(
      achievements,
      'matchesPlayed',
      thr
    );
    const cnt = qualifyingSeasons.length;
    return {
      label: `${t('Played')} ${thr}+ ${t('Matches in Season')}`,
      icon: <GiPingPongBat />,
      unlocked: cnt > 0,
      count: cnt,
      tooltip:
        cnt > 0
          ? `${t('Achieved in')} ${cnt} ${t('seasons')}:\n${qualifyingSeasons
              .map(
                (s) =>
                  `- ${s.roomName || t('Unnamed Season')}: ${
                    s.matchesPlayed
                  } ${t('matches')}`
              )
              .join('\n')}`
          : `${t('No season with')} ${thr}+ ${t('matches yet')}`,
    };
  });

  const seasonWinMilestones = SEASON_WIN_THRESHOLDS.map((thr) => {
    const qualifyingSeasons = getSeasonsAtOrAbove(achievements, 'wins', thr);
    const cnt = qualifyingSeasons.length;
    return {
      label: `${t('Won')} ${thr}+ ${t('Matches in Season')}`,
      icon: <FaTrophy />,
      unlocked: cnt > 0,
      count: cnt,
      tooltip:
        cnt > 0
          ? `${t('Achieved in')} ${cnt} ${t('seasons')}:\n${qualifyingSeasons
              .map(
                (s) =>
                  `- ${s.roomName || t('Unnamed Season')}: ${s.wins} ${t(
                    'wins'
                  )}`
              )
              .join('\n')}`
          : `${t('No season with')} ${thr}+ ${t('wins yet')}`,
    };
  });

  const Row: React.FC<{ title: string; items: any[] }> = ({ title, items }) => (
    <div className='mb-6'>
      <h4 className='text-lg font-semibold mb-2'>{title}</h4>
      <div className='flex flex-wrap gap-4 items-center'>
        {items.map((it, idx) => (
          <TooltipProvider key={idx}>
            <Tooltip delayDuration={100}>
              <TooltipTrigger asChild>
                <div
                  className='relative text-3xl'
                  style={{ color: it.unlocked ? undefined : '#ccc' }}
                >
                  {it.icon}
                  {it.count! > 0 && (
                    <span className='absolute -top-2 -right-2 bg-red-600 text-white rounded-full text-xs w-5 h-5 flex items-center justify-center'>
                      {it.count}
                    </span>
                  )}
                  {!it.unlocked && (
                    <FaLock className='absolute -top-2 -right-2 text-lg text-gray-500' />
                  )}
                </div>
              </TooltipTrigger>
              <TooltipContent side='top'>
                <div style={{ whiteSpace: 'pre-wrap' }}>{it.tooltip}</div>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ))}
      </div>
    </div>
  );

  return (
    <Card className='h-full'>
      <CardHeader>
        <CardTitle>{t('Achievements')}</CardTitle>
      </CardHeader>
      <CardContent>
        <Row title={t('Season Podiums')} items={seasonStars} />
        <Row title={t('Tournament Podiums')} items={tournStars} />
        <Row title={t('Tournaments Played')} items={tournamentMilestones} />
        <Row title={t('Total Matches')} items={overallMatchMilestones} />
        <Row title={t('Total Wins')} items={overallWinMilestones} />
        <Row title={t('Longest Win Streak')} items={overallStreakMilestones} />
        <Row
          title={t('Matches in a Single Season')}
          items={seasonMatchMilestones}
        />
        <Row title={t('Wins in a Single Season')} items={seasonWinMilestones} />
      </CardContent>
    </Card>
  );
}
