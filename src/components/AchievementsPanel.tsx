// src/components/AchievementsPanel.tsx
'use client';

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui';
import { Sport, sportConfig } from '@/contexts/SportContext';
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
  sport: Sport;
}

interface Props {
  allAchievements: Achievement[];
  sport: Sport;
  sportMatches: number;
  sportWins: number;
  sportWinRate: number;
  sportMaxStreak: number;
}

// Achievement Thresholds
const OVERALL_MATCH_THRESHOLDS = [10, 50, 100, 250, 500, 1000];
const OVERALL_WIN_THRESHOLDS = [10, 50, 100, 250, 500];
const OVERALL_STREAK_THRESHOLDS = [5, 10, 15, 20];
const SEASON_MATCH_THRESHOLDS = [10, 25, 50, 100];
const SEASON_WIN_THRESHOLDS = [10, 25, 50, 100];
const TOURNAMENT_THRESHOLDS = [1, 5, 10, 25];

// Helper functions to process achievements
const getSeasonsAtOrAbove = (
  arr: Achievement[],
  prop: 'matchesPlayed' | 'wins',
  thr: number
) => arr.filter((a) => a.type === 'seasonFinish' && (a[prop] ?? 0) >= thr);

const getAchievementsByTypeAndPlace = (
  arr: Achievement[],
  type: string,
  place: number
) => arr.filter((a) => a.type === type && a.place === place);

const countAchievementsByType = (arr: Achievement[], type: string) =>
  arr.filter((a) => a.type === type).length;

export default function AchievementsPanel({
  allAchievements = [],
  sport,
  sportMatches = 0,
  sportWins = 0,
  sportWinRate = 0,
  sportMaxStreak = 0,
}: Props) {
  const { t } = useTranslation();

  const achievements = allAchievements.filter((a) => a.sport === sport);

  const seasonPodiums = [1, 2, 3].map((place) => {
    const qualifying = getAchievementsByTypeAndPlace(
      achievements,
      'seasonFinish',
      place
    );
    const count = qualifying.length;
    return {
      icon: <FaMedal color={['#ffd700', '#c0c0c0', '#cd7f32'][place - 1]} />,
      unlocked: count > 0,
      count,
      tooltip:
        count > 0
          ? `${t('Podium #')}${place} (${count}x):\n${qualifying
              .map(
                (s) =>
                  `- ${s.roomName} (${safeFormatDate(
                    s.dateFinished,
                    'dd.MM.yy'
                  )})`
              )
              .join('\n')}`
          : `${t('Reach podium #')}${place} ${t('in a season')}`,
    };
  });

  const tournamentPodiums = [1, 2, 3].map((place) => {
    const qualifying = getAchievementsByTypeAndPlace(
      achievements,
      'tournamentFinish',
      place
    );
    const count = qualifying.length;
    return {
      icon: <FaTrophy color={['#ffd700', '#c0c0c0', '#cd7f32'][place - 1]} />,
      unlocked: count > 0,
      count,
      tooltip:
        count > 0
          ? `${t('Tournament Podium #')}${place} (${count}x):\n${qualifying
              .map(
                (s) =>
                  `- ${s.roomName} (${safeFormatDate(
                    s.dateFinished,
                    'dd.MM.yy'
                  )})`
              )
              .join('\n')}`
          : `${t('Reach tournament podium #')}${place}`,
    };
  });

  const tournamentsPlayedCount = countAchievementsByType(
    achievements,
    'tournamentFinish'
  );
  const tournamentMilestones = TOURNAMENT_THRESHOLDS.map((thr) => ({
    icon: <FaTrophy />,
    unlocked: tournamentsPlayedCount >= thr,
    tooltip: `${t('Tournaments played:')} ${tournamentsPlayedCount} / ${thr}`,
  }));

  const matchMilestones = OVERALL_MATCH_THRESHOLDS.map((thr) => ({
    icon: <GiPingPongBat />,
    unlocked: sportMatches >= thr,
    tooltip: `${t('Played')} ${sportMatches} / ${thr} ${t('matches')}`,
  }));

  const winMilestones = OVERALL_WIN_THRESHOLDS.map((thr) => ({
    icon: <FaTrophy />,
    unlocked: sportWins >= thr,
    tooltip: `${t('Won')} ${sportWins} / ${thr} ${t('matches')}`,
  }));

  const streakMilestones = OVERALL_STREAK_THRESHOLDS.map((thr) => ({
    icon: <GiFlame />,
    unlocked: sportMaxStreak >= thr,
    tooltip: `${t('Best streak:')} ${sportMaxStreak} / ${thr}`,
  }));

  const seasonMatchMilestones = SEASON_MATCH_THRESHOLDS.map((thr) => {
    const qualifying = getSeasonsAtOrAbove(achievements, 'matchesPlayed', thr);
    return {
      icon: <GiPingPongBat />,
      unlocked: qualifying.length > 0,
      count: qualifying.length,
      tooltip:
        qualifying.length > 0
          ? `${t('Achieved in')} ${qualifying.length} ${t(
              'seasons'
            )}:\n${qualifying
              .map((s) => `- ${s.roomName}: ${s.matchesPlayed} ${t('matches')}`)
              .join('\n')}`
          : `${t('Play')} ${thr}+ ${t('matches in a season')}`,
    };
  });

  const seasonWinMilestones = SEASON_WIN_THRESHOLDS.map((thr) => {
    const qualifying = getSeasonsAtOrAbove(achievements, 'wins', thr);
    return {
      icon: <FaTrophy />,
      unlocked: qualifying.length > 0,
      count: qualifying.length,
      tooltip:
        qualifying.length > 0
          ? `${t('Achieved in')} ${qualifying.length} ${t(
              'seasons'
            )}:\n${qualifying
              .map((s) => `- ${s.roomName}: ${s.wins} ${t('wins')}`)
              .join('\n')}`
          : `${t('Win')} ${thr}+ ${t('matches in a season')}`,
    };
  });

  return (
    <Card className='h-full'>
      <CardHeader>
        <CardTitle>
          {t('Achievements')} ({sportConfig[sport].name})
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Row title={t('Season Podiums')} items={seasonPodiums} />
        <Row title={t('Tournament Podiums')} items={tournamentPodiums} />
        <Row title={t('Tournaments Played')} items={tournamentMilestones} />
        <Row title={t('Total Matches')} items={matchMilestones} />
        <Row title={t('Total Wins')} items={winMilestones} />
        <Row title={t('Longest Win Streak')} items={streakMilestones} />
        <Row
          title={t('Matches in a Single Season')}
          items={seasonMatchMilestones}
        />
        <Row title={t('Wins in a Single Season')} items={seasonWinMilestones} />
      </CardContent>
    </Card>
  );
}

const Row: React.FC<{ title: string; items: any[] }> = ({ title, items }) => (
  <div className='mb-6'>
    <h4 className='text-md font-semibold mb-3'>{title}</h4>
    <div className='flex flex-wrap gap-4 items-center'>
      {items.map((it, idx) => (
        <TooltipProvider key={idx} delayDuration={100}>
          <Tooltip>
            <TooltipTrigger asChild>
              <div
                className={`relative text-3xl transition-opacity ${
                  it.unlocked ? 'opacity-100' : 'opacity-30'
                }`}
              >
                {it.icon}
                {it.count > 1 && (
                  <span className='absolute -top-2 -right-2 bg-primary text-primary-foreground rounded-full text-xs w-5 h-5 flex items-center justify-center border-2 border-card'>
                    {it.count}
                  </span>
                )}
                {!it.unlocked && (
                  <FaLock className='absolute top-0 right-0 text-lg text-muted-foreground' />
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
