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
import {
	GiBroadsword,
	GiFlame,
	GiPingPongBat,
	GiSpikedHalo,
} from 'react-icons/gi';

interface Achievement {
  type: string;
  dateFinished: string;
  place?: number;
  matchesPlayed?: number;
  wins?: number;
  roomName?: string;
  tournamentName?: string;
  tournamentId?: string;
  sport?: Sport;
  longestWinStreak?: number; // Для дерби
}

interface Props {
  allAchievements: Achievement[];
  sport: Sport;
  sportMatches: number;
  sportWins: number;
  sportWinRate: number;
  sportMaxStreak: number;
}

const OVERALL_MATCH_THRESHOLDS = [10, 50, 100, 250, 500, 1000, 1500, 2000];
const OVERALL_WIN_THRESHOLDS = [10, 50, 100, 250, 500, 1000, 1500, 2000];
const OVERALL_STREAK_THRESHOLDS = [5, 10, 15, 20, 30, 50];
const SEASON_MATCH_THRESHOLDS = [10, 25, 50, 100, 150, 200, 250, 300];
const SEASON_WIN_THRESHOLDS = [10, 25, 50, 100, 150, 200, 250, 300];
const TOURNAMENT_THRESHOLDS = [1, 5, 10, 25];

const getSeasonsAtOrAbove = (
  arr: Achievement[],
  prop: 'matchesPlayed' | 'wins',
  thr: number,
) => arr.filter((a) => a.type === 'seasonFinish' && (a[prop] ?? 0) >= thr);

const getAchievementsByTypeAndPlace = (
  arr: Achievement[],
  type: string,
  place: number,
) => arr.filter((a) => a.type === type && a.place === place);

const countAchievementsByType = (arr: Achievement[], type: string) =>
  arr.filter((a) => a.type === type).length;

const getAchievementsByType = (arr: Achievement[], type: string) =>
  arr.filter((a) => a.type === type);

const dedupTournamentFinishes = (arr: Achievement[]) => {
  const seen = new Set<string>();
  const out: Achievement[] = [];
  for (const a of arr) {
    if (a.type !== 'tournamentFinish') {
      out.push(a);
      continue;
    }
    const key = `${a.type}:${a.tournamentId ?? a.dateFinished}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(a);
  }
  return out;
};

export default function AchievementsPanel({
  allAchievements = [],
  sport,
  sportMatches = 0,
  sportWins = 0,
  sportMaxStreak = 0,
}: Props) {
  const { t } = useTranslation();

  const achievements = dedupTournamentFinishes(
    allAchievements.filter((a) => (a.sport || 'pingpong') === sport),
  );

  const seasonPodiums = [1, 2, 3].map((place) => {
    const qualifying = getAchievementsByTypeAndPlace(
      achievements,
      'seasonFinish',
      place,
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
                    'dd.MM.yy',
                  )})`,
              )
              .join('\n')}`
          : `${t('Reach podium #')}${place} ${t('in a season')}`,
    };
  });

  const tournamentPodiums = [1, 2, 3].map((place) => {
    const qualifying = getAchievementsByTypeAndPlace(
      achievements,
      'tournamentFinish',
      place,
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
                  `- ${s.tournamentName ?? '—'} (${safeFormatDate(
                    s.dateFinished,
                    'dd.MM.yy',
                  )})`,
              )
              .join('\n')}`
          : `${t('Reach tournament podium #')}${place}`,
    };
  });

  const derbyChampions = getAchievementsByType(achievements, 'derbyChampion');
  const derbyUnstoppables = getAchievementsByType(
    achievements,
    'derbyUnstoppable',
  );

  const derbyMilestones = [
    {
      icon: <GiBroadsword color='#ef4444' />,
      unlocked: derbyChampions.length > 0,
      count: derbyChampions.length,
      tooltip:
        derbyChampions.length > 0
          ? `${t('Derby Champion')} (${derbyChampions.length}x):\n${derbyChampions
              .map(
                (s) =>
                  `- ${s.roomName} (${safeFormatDate(s.dateFinished, 'dd.MM.yy')})`,
              )
              .join('\n')}`
          : `${t('Win a season in Derby mode')}`,
    },
    {
      icon: <GiSpikedHalo color='#f97316' />,
      unlocked: derbyUnstoppables.length > 0,
      count: derbyUnstoppables.length,
      tooltip:
        derbyUnstoppables.length > 0
          ? `${t('Derby Unstoppable')} (${derbyUnstoppables.length}x):\n${derbyUnstoppables
              .map(
                (s) => `- ${s.roomName} (${s.longestWinStreak} ${t('streak')})`,
              )
              .join('\n')}`
          : `${t('Achieve the longest streak (5+) in a Derby season')}`,
    },
  ];

  const tournamentsPlayedCount = countAchievementsByType(
    achievements,
    'tournamentFinish',
  );
  const tournamentMilestones = TOURNAMENT_THRESHOLDS.map((thr) => ({
    icon: <FaTrophy color='#eab308' />,
    unlocked: tournamentsPlayedCount >= thr,
    tooltip: `${t('Tournaments played:')} ${tournamentsPlayedCount} / ${thr}`,
  }));

  const matchMilestones = OVERALL_MATCH_THRESHOLDS.map((thr) => ({
    icon: <GiPingPongBat color='#3b82f6' />,
    unlocked: sportMatches >= thr,
    tooltip: `${t('Played')} ${sportMatches} / ${thr} ${t('matches')}`,
  }));

  const winMilestones = OVERALL_WIN_THRESHOLDS.map((thr) => ({
    icon: <FaTrophy color='#10b981' />,
    unlocked: sportWins >= thr,
    tooltip: `${t('Won')} ${sportWins} / ${thr} ${t('matches')}`,
  }));

  const streakMilestones = OVERALL_STREAK_THRESHOLDS.map((thr) => ({
    icon: <GiFlame color='#f97316' />,
    unlocked: sportMaxStreak >= thr,
    tooltip: `${t('Best streak:')} ${sportMaxStreak} / ${thr}`,
  }));

  const seasonMatchMilestones = SEASON_MATCH_THRESHOLDS.map((thr) => {
    const qualifying = getSeasonsAtOrAbove(achievements, 'matchesPlayed', thr);
    return {
      icon: <GiPingPongBat color='#8b5cf6' />,
      unlocked: qualifying.length > 0,
      count: qualifying.length,
      tooltip:
        qualifying.length > 0
          ? `${t('Achieved in')} ${qualifying.length} ${t(
              'seasons',
            )}:\n${qualifying
              .map((s) => `- ${s.roomName}: ${s.matchesPlayed} ${t('matches')}`)
              .join('\n')}`
          : `${t('Play')} ${thr}+ ${t('matches in a season')}`,
    };
  });

  const seasonWinMilestones = SEASON_WIN_THRESHOLDS.map((thr) => {
    const qualifying = getSeasonsAtOrAbove(achievements, 'wins', thr);
    return {
      icon: <FaTrophy color='#14b8a6' />,
      unlocked: qualifying.length > 0,
      count: qualifying.length,
      tooltip:
        qualifying.length > 0
          ? `${t('Achieved in')} ${qualifying.length} ${t(
              'seasons',
            )}:\n${qualifying
              .map((s) => `- ${s.roomName}: ${s.wins} ${t('wins')}`)
              .join('\n')}`
          : `${t('Win')} ${thr}+ ${t('matches in a season')}`,
    };
  });

  return (
    <Card className='border-0 rounded-[2rem] glass-panel shadow-lg relative'>
      <div className='absolute inset-0 bg-gradient-to-br from-yellow-500/5 to-transparent mix-blend-overlay pointer-events-none rounded-[2rem]' />
      <CardHeader className='px-8 pt-8 pb-4 relative z-10'>
        <CardTitle className='text-2xl font-extrabold tracking-tight flex items-center gap-3'>
          <div className='bg-yellow-500/10 p-2.5 rounded-xl ring-1 ring-yellow-500/20 text-yellow-600 dark:text-yellow-500'>
            <FaTrophy className='w-5 h-5' />
          </div>
          {t('Achievements')}{' '}
          <span className='opacity-50 text-xl font-medium'>
            ({sportConfig[sport].name})
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className='px-8 pb-8 relative z-10'>
        <div className='grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6'>
          <Row title={t('Season Podiums')} items={seasonPodiums} />
          <Row title={t('Tournament Podiums')} items={tournamentPodiums} />
          <Row title={t('Derby Legends')} items={derbyMilestones} />
          <Row title={t('Tournaments Played')} items={tournamentMilestones} />
          <Row title={t('Total Matches')} items={matchMilestones} />
          <Row title={t('Total Wins')} items={winMilestones} />
          <Row title={t('Longest Win Streak')} items={streakMilestones} />
          <Row
            title={t('Matches in a Single Season')}
            items={seasonMatchMilestones}
          />
          <Row
            title={t('Wins in a Single Season')}
            items={seasonWinMilestones}
          />
        </div>
      </CardContent>
    </Card>
  );
}

const Row: React.FC<{ title: string; items: any[] }> = ({ title, items }) => (
  <div className='bg-background/40 p-4 rounded-2xl ring-1 ring-black/5 dark:ring-white/5 backdrop-blur-sm'>
    <h4 className='text-[10px] font-bold mb-3 uppercase tracking-widest text-muted-foreground'>
      {title}
    </h4>
    <div className='flex flex-wrap gap-3 items-center'>
      {items.map((it, idx) => (
        <TooltipProvider key={idx} delayDuration={100}>
          <Tooltip>
            <TooltipTrigger asChild>
              <div
                className={`relative text-2xl transition-all duration-300 cursor-help p-1.5 rounded-xl ${
                  it.unlocked
                    ? 'opacity-100 drop-shadow-md bg-white/60 dark:bg-black/40 ring-1 ring-black/5 dark:ring-white/10 hover:scale-110'
                    : 'opacity-20 grayscale'
                }`}
              >
                {it.icon}
                {it.count > 1 && (
                  <span className='absolute -top-1.5 -right-1.5 bg-foreground text-background rounded-full text-[9px] w-[18px] h-[18px] flex items-center justify-center font-black shadow-sm'>
                    {it.count}
                  </span>
                )}
                {!it.unlocked && (
                  <FaLock className='absolute top-0 right-0 text-[10px] text-muted-foreground' />
                )}
              </div>
            </TooltipTrigger>
            <TooltipContent
              side='top'
              className='glass-panel border-0 text-xs font-medium z-50'
            >
              <div style={{ whiteSpace: 'pre-wrap' }}>{it.tooltip}</div>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      ))}
    </div>
  </div>
);
