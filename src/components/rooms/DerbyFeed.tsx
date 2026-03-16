// src/components/rooms/DerbyFeed.tsx
'use client';

import {
	Avatar,
	AvatarFallback,
	AvatarImage,
	Card,
	CardContent,
	CardHeader,
	CardTitle,
	ScrollArea,
} from '@/components/ui';
import type { Match, Member, Room } from '@/lib/types';
import { safeFormatDate } from '@/lib/utils/date';
import {
	Coins,
	Droplet,
	Flame,
	LineChart,
	Skull,
	Swords,
	Target,
	TrendingDown,
	Trophy,
	Zap,
} from 'lucide-react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

interface DerbyFeedProps {
  room: Room;
  members: Member[];
  matches: Match[];
}

type NarrativeType =
  | 'FLAWLESS'
  | 'NAIL_BITER'
  | 'GIANT_SLAYER'
  | 'UPSET'
  | 'DOMINATION'
  | 'ROUTINE';

const getHash = (str: string) => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash);
};

const pickRandom = (arr: string[], hash: number) => arr[hash % arr.length];

const PHRASES = {
  NAIL_BITER: [
    '___WINNER___ survived a sweaty match against ___LOSER___',
    'Absolute cinema! ___WINNER___ edged out ___LOSER___',
    '___LOSER___ choked at the finish line against ___WINNER___',
    'Heart attack match! ___WINNER___ barely survived ___LOSER___',
    'Down to the wire! ___WINNER___ clutched against ___LOSER___',
  ],
  FLAWLESS: [
    '___WINNER___ completely humiliated ___LOSER___',
    '___WINNER___ gave a free lesson to ___LOSER___',
    '___LOSER___ forgot how to hold a paddle against ___WINNER___',
    'Total annihilation by ___WINNER___ over ___LOSER___',
    '___WINNER___ destroyed ___LOSER___ without breaking a sweat',
  ],
  UPSET: [
    'Massive Upset! ___WINNER___ shocked the favorite ___LOSER___',
    '___WINNER___ defied the math and broke ___LOSER___',
    'Nobody bet on ___WINNER___, but they crushed ___LOSER___',
    'David vs Goliath! ___WINNER___ slayed the higher-ranked ___LOSER___',
  ],
  GIANT_SLAYER: [
    "___WINNER___ claimed the massive bounty on ___LOSER___'s head!",
    'The streak is dead! ___WINNER___ dethroned ___LOSER___',
    "___LOSER___'s reign of terror was ended by ___WINNER___",
    'Jackpot! ___WINNER___ cashed in on ___LOSER___',
  ],
  DOMINATION: [
    '___WINNER___ dominated ___LOSER___ from start to finish',
    'Easy money for ___WINNER___ against ___LOSER___',
    '___WINNER___ steamrolled through ___LOSER___',
    'No chance for ___LOSER___, ___WINNER___ was too good',
  ],
  ROUTINE: [
    '___WINNER___ secured a solid win over ___LOSER___',
    'Another day, another victory for ___WINNER___ against ___LOSER___',
    '___WINNER___ defeated ___LOSER___ in a standard matchup',
    '___WINNER___ outplayed ___LOSER___',
    'Business as usual: ___WINNER___ takes down ___LOSER___',
  ],
};

const renderText = (
  template: string,
  winnerName: string,
  loserName: string,
  type: NarrativeType,
) => {
  const parts = template.split(/(___WINNER___|___LOSER___)/g);
  return (
    <>
      {parts.map((part, i) => {
        if (part === '___WINNER___') {
          return (
            <span key={i} className='text-foreground font-bold'>
              {winnerName}
            </span>
          );
        }
        if (part === '___LOSER___') {
          const loserClass =
            type === 'GIANT_SLAYER'
              ? 'text-muted-foreground line-through decoration-red-500/50'
              : 'text-muted-foreground';
          return (
            <span key={i} className={loserClass}>
              {loserName}
            </span>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </>
  );
};

export function DerbyFeed({ room, members, matches }: DerbyFeedProps) {
  const { t } = useTranslation();

  const safeMembers = Array.isArray(members) ? members : [];
  const safeMatches = Array.isArray(matches) ? matches : [];

  const bounties = useMemo(() => {
    return safeMembers
      .filter((m) => (m.currentStreak ?? 0) >= 3)
      .sort((a, b) => (b.currentStreak ?? 0) - (a.currentStreak ?? 0));
  }, [safeMembers]);

  const rivalries = useMemo(() => {
    const list: {
      victim: Member;
      nemesis: Member;
      wins: number;
      losses: number;
      winRate: number;
    }[] = [];

    safeMembers.forEach((m) => {
      if (m.nemesisId) {
        const nemesis = safeMembers.find((n) => n.userId === m.nemesisId);
        const h2hStats = m.h2h?.[m.nemesisId];

        if (nemesis && h2hStats) {
          const total = h2hStats.wins + h2hStats.losses;
          const winRate =
            total > 0 ? Math.round((h2hStats.wins / total) * 100) : 0;
          list.push({
            victim: m,
            nemesis,
            wins: h2hStats.wins,
            losses: h2hStats.losses,
            winRate,
          });
        }
      }
    });
    return list.sort((a, b) => a.winRate - b.winRate);
  }, [safeMembers]);

  const insights = useMemo(() => {
    let highestStreak = 0;
    // Исправляем ошибку типов (never), принудительно задав any для игрока
    let highestStreakPlayer: any = null;

    safeMembers.forEach((m) => {
      if ((m.highestStreak ?? 0) > highestStreak) {
        highestStreak = m.highestStreak ?? 0;
        highestStreakPlayer = m;
      }
    });

    let biggestHeist = 0;
    let biggestHeistPlayer: any = null;

    const matchupCounts: Record<string, number> = {};
    let mostFrequentMatchupCount = 0;
    let mostFrequentMatchupNames = '';

    safeMatches.forEach((m) => {
      const p1Delta =
        typeof m.player1?.roomAddedPoints === 'number'
          ? m.player1.roomAddedPoints
          : 0;
      const p2Delta =
        typeof m.player2?.roomAddedPoints === 'number'
          ? m.player2.roomAddedPoints
          : 0;

      if (p1Delta > biggestHeist) {
        biggestHeist = p1Delta;
        biggestHeistPlayer = m.player1;
      }
      if (p2Delta > biggestHeist) {
        biggestHeist = p2Delta;
        biggestHeistPlayer = m.player2;
      }

      const key = [m.player1Id, m.player2Id].sort().join('_');
      matchupCounts[key] = (matchupCounts[key] || 0) + 1;
      if (matchupCounts[key] > mostFrequentMatchupCount) {
        mostFrequentMatchupCount = matchupCounts[key];
        mostFrequentMatchupNames = `${m.player1.name} & ${m.player2.name}`;
      }
    });

    return {
      highestStreak,
      highestStreakPlayer,
      biggestHeist,
      biggestHeistPlayer,
      mostFrequentMatchupCount,
      mostFrequentMatchupNames,
    };
  }, [safeMembers, safeMatches]);

  const chronicles = useMemo(() => {
    const events: {
      match: Match;
      type: NarrativeType;
      phrase: string;
      winner: any;
      loser: any;
      delta: number;
    }[] = [];

    const sortedMatches = [...safeMatches].sort((a, b) => {
      const timeA = a.tsIso ? Date.parse(a.tsIso) : 0;
      const timeB = b.tsIso ? Date.parse(b.tsIso) : 0;
      return timeB - timeA;
    });

    sortedMatches.forEach((m) => {
      const p1Delta =
        typeof m.player1?.roomAddedPoints === 'number'
          ? m.player1.roomAddedPoints
          : 0;
      const p2Delta =
        typeof m.player2?.roomAddedPoints === 'number'
          ? m.player2.roomAddedPoints
          : 0;

      const isP1Winner = m.player1.scores > m.player2.scores;
      const winner = isP1Winner ? m.player1 : m.player2;
      const loser = isP1Winner ? m.player2 : m.player1;
      const delta = isP1Winner ? p1Delta : p2Delta;

      const s1 = Number(m.player1.scores);
      const s2 = Number(m.player2.scores);
      const scoreDiff = Math.abs(s1 - s2);
      const maxScore = Math.max(s1, s2);
      const minScore = Math.min(s1, s2);

      const winnerOld = Number(winner.roomOldRating || 1000);
      const loserOld = Number(loser.roomOldRating || 1000);
      const eloDiff = loserOld - winnerOld;

      let type: NarrativeType = 'ROUTINE';

      if (delta >= 25) {
        type = 'GIANT_SLAYER';
      } else if (eloDiff >= 60) {
        type = 'UPSET';
      } else if (scoreDiff <= 2 && maxScore >= 11) {
        type = 'NAIL_BITER';
      } else if (minScore <= 2 && maxScore >= 11) {
        type = 'FLAWLESS';
      } else if (delta >= 15) {
        type = 'DOMINATION';
      }

      const matchHash = getHash(m.id || String(Math.random()));
      const phrase = pickRandom(PHRASES[type], matchHash);

      events.push({ match: m, type, phrase, winner, loser, delta });
    });

    return events;
  }, [safeMatches]);

  if (room.mode !== 'derby') return null;

  if (
    bounties.length === 0 &&
    rivalries.length === 0 &&
    chronicles.length === 0
  ) {
    return (
      <Card className='mb-8 border-0 rounded-[2rem] glass-panel shadow-md bg-red-500/5 ring-1 ring-red-500/20'>
        <CardContent className='p-10 text-center text-red-600/70 dark:text-red-400/70'>
          <Swords className='w-12 h-12 mx-auto mb-4 opacity-50' />
          <p className='text-base font-semibold max-w-sm mx-auto'>
            {t(
              'The Derby has begun. Play matches to build streaks and rivalries!',
            )}
          </p>
        </CardContent>
      </Card>
    );
  }

  const renderChronicleCard = (event: any) => {
    const { match: m, type, phrase, winner, loser, delta } = event;
    const localizedText = t(phrase);

    const ScoreBadge = (
      <div className='flex items-center gap-1.5 font-mono text-[10px] sm:text-xs bg-background/80 backdrop-blur-md px-2 py-0.5 rounded border-0 ring-1 ring-black/5 dark:ring-white/10 shadow-sm text-muted-foreground'>
        <span className='font-bold text-foreground truncate max-w-[60px] sm:max-w-[80px]'>
          {m.player1.name}
        </span>
        <span className='opacity-50'>
          {m.player1.scores} - {m.player2.scores}
        </span>
        <span className='font-bold text-foreground truncate max-w-[60px] sm:max-w-[80px]'>
          {m.player2.name}
        </span>
      </div>
    );

    const baseClass =
      'rounded-2xl p-4 transition-all shadow-sm ring-1 ring-inset';

    switch (type) {
      case 'FLAWLESS':
        return (
          <div
            className={`${baseClass} bg-sky-500/10 ring-sky-500/20 backdrop-blur-sm`}
          >
            <div className='flex items-center gap-2 text-sky-600 dark:text-sky-400 font-bold text-[10px] uppercase mb-1.5 tracking-widest'>
              <Target className='w-3.5 h-3.5' />
              {t('Flawless Victory')}
            </div>
            <div className='text-sm font-medium leading-relaxed'>
              {renderText(localizedText, winner.name, loser.name, type)}
            </div>
            <div className='flex items-center justify-between mt-3'>
              {ScoreBadge}
              <span className='text-xs font-black text-sky-600 dark:text-sky-400'>
                +{Math.round(delta)}
              </span>
            </div>
          </div>
        );

      case 'NAIL_BITER':
        return (
          <div
            className={`${baseClass} bg-amber-500/10 ring-amber-500/20 backdrop-blur-sm`}
          >
            <div className='flex items-center gap-2 text-amber-600 dark:text-amber-400 font-bold text-[10px] uppercase mb-1.5 tracking-widest'>
              <Droplet className='w-3.5 h-3.5' />
              {t('Nail-Biter')}
            </div>
            <div className='text-sm font-medium leading-relaxed'>
              {renderText(localizedText, winner.name, loser.name, type)}
            </div>
            <div className='flex items-center justify-between mt-3'>
              {ScoreBadge}
              <span className='text-xs font-black text-amber-600 dark:text-amber-400'>
                +{Math.round(delta)}
              </span>
            </div>
          </div>
        );

      case 'GIANT_SLAYER':
        return (
          <div
            className={`${baseClass} bg-red-500/10 ring-red-500/30 backdrop-blur-md relative overflow-hidden`}
          >
            <div className='absolute -right-4 -top-4 opacity-10'>
              <Skull className='w-24 h-24 text-red-500' />
            </div>
            <div className='flex items-center gap-2 text-red-600 dark:text-red-400 font-bold text-[10px] uppercase mb-1.5 relative z-10 tracking-widest'>
              <Swords className='w-3.5 h-3.5' />
              {t('Giant Slayer')}
            </div>
            <div className='text-sm font-medium leading-relaxed relative z-10'>
              {renderText(localizedText, winner.name, loser.name, type)}
            </div>
            <div className='flex items-center justify-between mt-3 relative z-10'>
              {ScoreBadge}
              <span className='text-xs font-black text-red-600 dark:text-red-400 bg-red-500/20 px-2 py-0.5 rounded shadow-sm'>
                +{Math.round(delta)} ELO
              </span>
            </div>
          </div>
        );

      case 'UPSET':
        return (
          <div
            className={`${baseClass} bg-purple-500/10 ring-purple-500/20 backdrop-blur-sm`}
          >
            <div className='flex items-center gap-2 text-purple-600 dark:text-purple-400 font-bold text-[10px] uppercase mb-1.5 tracking-widest'>
              <TrendingDown className='w-3.5 h-3.5' />
              {t('Massive Upset')}
            </div>
            <div className='text-sm font-medium leading-relaxed'>
              {renderText(localizedText, winner.name, loser.name, type)}
            </div>
            <div className='flex items-center justify-between mt-3'>
              {ScoreBadge}
              <span className='text-xs font-black text-purple-600 dark:text-purple-400'>
                +{Math.round(delta)}
              </span>
            </div>
          </div>
        );

      case 'DOMINATION':
        return (
          <div
            className={`${baseClass} bg-primary/10 ring-primary/20 backdrop-blur-sm`}
          >
            <div className='flex items-center gap-2 text-primary font-bold text-[10px] uppercase mb-1.5 tracking-widest'>
              <Flame className='w-3.5 h-3.5' />
              {t('Domination')}
            </div>
            <div className='text-sm font-medium leading-relaxed'>
              {renderText(localizedText, winner.name, loser.name, type)}
            </div>
            <div className='flex items-center justify-between mt-3'>
              {ScoreBadge}
              <span className='text-xs font-black text-primary'>
                +{Math.round(delta)}
              </span>
            </div>
          </div>
        );

      default:
        return (
          <div
            className={`${baseClass} bg-muted/30 ring-border/50 backdrop-blur-sm`}
          >
            <div className='text-sm font-medium leading-relaxed'>
              {renderText(localizedText, winner.name, loser.name, type)}
            </div>
            <div className='flex items-center justify-between mt-3'>
              {ScoreBadge}
              <span className='text-xs font-black text-muted-foreground flex items-center gap-1'>
                <Zap className='w-3 h-3' />+{Math.round(delta)}
              </span>
            </div>
          </div>
        );
    }
  };

  return (
    <div className='grid grid-cols-1 lg:grid-cols-12 gap-8 mb-8'>
      <div className='lg:col-span-5 space-y-8'>
        {(insights.highestStreak > 0 || insights.biggestHeist > 0) && (
          <Card className='border-0 rounded-[2rem] glass-panel bg-blue-500/5 ring-1 ring-blue-500/20 shadow-md relative overflow-hidden'>
            <div className='absolute inset-0 bg-gradient-to-br from-blue-500/10 to-transparent mix-blend-overlay pointer-events-none' />
            <CardHeader className='pb-4 relative z-10 px-6 pt-6'>
              <CardTitle className='text-lg font-extrabold text-blue-600 dark:text-blue-400 flex items-center gap-2.5 tracking-tight'>
                <div className='p-2 bg-blue-500/10 rounded-xl'>
                  <LineChart className='w-5 h-5' />
                </div>
                {t('Arena Insights')}
              </CardTitle>
            </CardHeader>
            <CardContent className='space-y-3 px-6 pb-6 relative z-10'>
              {insights.highestStreakPlayer && insights.highestStreak > 0 && (
                <div className='flex items-center justify-between bg-background/60 backdrop-blur-md ring-1 ring-blue-500/20 rounded-2xl p-3.5 shadow-sm'>
                  <div className='flex items-center gap-2.5 text-xs font-bold uppercase tracking-widest text-muted-foreground'>
                    <Trophy className='w-4 h-4 text-yellow-500' />
                    <span>{t('All-Time Streak')}</span>
                  </div>
                  <div className='flex items-center gap-2'>
                    <span className='font-bold text-sm'>
                      {insights.highestStreakPlayer?.name}
                    </span>
                    <span className='bg-yellow-500/20 text-yellow-700 dark:text-yellow-500 px-2 py-0.5 rounded text-xs font-black shadow-sm'>
                      {insights.highestStreak} 🔥
                    </span>
                  </div>
                </div>
              )}
              {insights.biggestHeistPlayer && insights.biggestHeist > 0 && (
                <div className='flex items-center justify-between bg-background/60 backdrop-blur-md ring-1 ring-blue-500/20 rounded-2xl p-3.5 shadow-sm'>
                  <div className='flex items-center gap-2.5 text-xs font-bold uppercase tracking-widest text-muted-foreground'>
                    <Coins className='w-4 h-4 text-emerald-500' />
                    <span>{t('Biggest Heist')}</span>
                  </div>
                  <div className='flex items-center gap-2'>
                    <span className='font-bold text-sm'>
                      {insights.biggestHeistPlayer?.name}
                    </span>
                    <span className='bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 px-2 py-0.5 rounded text-xs font-black shadow-sm'>
                      +{Math.round(insights.biggestHeist)} ELO
                    </span>
                  </div>
                </div>
              )}
              {insights.mostFrequentMatchupCount > 0 && (
                <div className='flex items-center justify-between bg-background/60 backdrop-blur-md ring-1 ring-blue-500/20 rounded-2xl p-3.5 shadow-sm'>
                  <div className='flex items-center gap-2.5 text-xs font-bold uppercase tracking-widest text-muted-foreground'>
                    <Swords className='w-4 h-4 text-rose-500' />
                    <span>{t('Most Clashes')}</span>
                  </div>
                  <div className='flex flex-col items-end gap-1'>
                    <span className='bg-rose-500/20 text-rose-700 dark:text-rose-400 px-2 py-0.5 rounded text-[10px] font-black shadow-sm uppercase'>
                      {insights.mostFrequentMatchupCount} {t('Games')}
                    </span>
                    <span className='font-bold text-[10px] text-muted-foreground truncate max-w-[120px]'>
                      {insights.mostFrequentMatchupNames}
                    </span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {bounties.length > 0 && (
          <Card className='border-0 rounded-[2rem] glass-panel bg-orange-500/5 ring-1 ring-orange-500/20 shadow-md relative overflow-hidden'>
            <div className='absolute inset-0 bg-gradient-to-br from-orange-500/10 to-transparent mix-blend-overlay pointer-events-none' />
            <CardHeader className='pb-4 relative z-10 px-6 pt-6'>
              <CardTitle className='text-lg font-extrabold text-orange-600 dark:text-orange-400 flex items-center gap-2.5 tracking-tight'>
                <div className='p-2 bg-orange-500/10 rounded-xl'>
                  <Flame className='w-5 h-5 fill-current animate-pulse' />
                </div>
                {t('Active Bounties')}
              </CardTitle>
            </CardHeader>
            <CardContent className='space-y-3 px-6 pb-6 relative z-10'>
              {bounties.map((b) => (
                <div
                  key={b.userId}
                  className='flex items-center justify-between bg-background/60 backdrop-blur-md ring-1 ring-orange-500/20 rounded-2xl p-4 shadow-sm transition-transform hover:scale-[1.02]'
                >
                  <div className='flex items-center gap-4'>
                    <Avatar className='h-12 w-12 ring-2 ring-orange-500 shadow-[0_0_10px_rgba(249,115,22,0.3)]'>
                      <AvatarImage src={b.photoURL || undefined} />
                      <AvatarFallback className='bg-orange-100 text-orange-700 font-bold'>
                        {(b.name || '?').substring(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <div className='font-bold text-base'>{b.name}</div>
                      <div className='text-[10px] font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-1 mt-1'>
                        <Flame className='w-3 h-3 text-orange-500' />
                        {b.currentStreak} {t('Win Streak')}
                      </div>
                    </div>
                  </div>
                  <div className='text-right'>
                    <div className='text-[9px] font-bold text-orange-500 uppercase tracking-widest mb-0.5'>
                      {t('Reward')}
                    </div>
                    <div className='font-black text-xl text-foreground'>
                      +{((b.currentStreak ?? 0) - 2) * 5}{' '}
                      <span className='text-xs font-bold text-muted-foreground'>
                        {t('ELO')}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {rivalries.length > 0 && (
          <Card className='border-0 rounded-[2rem] glass-panel bg-purple-500/5 ring-1 ring-purple-500/20 shadow-md relative overflow-hidden'>
            <div className='absolute inset-0 bg-gradient-to-br from-purple-500/10 to-transparent mix-blend-overlay pointer-events-none' />
            <CardHeader className='pb-4 relative z-10 px-6 pt-6'>
              <CardTitle className='text-lg font-extrabold text-purple-600 dark:text-purple-400 flex items-center gap-2.5 tracking-tight'>
                <div className='p-2 bg-purple-500/10 rounded-xl'>
                  <Skull className='w-5 h-5' />
                </div>
                {t('Active Rivalries')}
              </CardTitle>
            </CardHeader>
            <CardContent className='px-6 pb-6 relative z-10'>
              <ScrollArea className='max-h-[300px] pr-4'>
                <div className='space-y-4'>
                  {rivalries.map((r, idx) => (
                    <div
                      key={idx}
                      className='flex items-center justify-between bg-background/60 backdrop-blur-md ring-1 ring-blue-500/20 rounded-2xl p-3.5 shadow-sm'
                    >
                      <div className='flex flex-col items-center w-[60px] text-center'>
                        <Avatar className='h-10 w-10 mb-2 ring-1 ring-black/5 dark:ring-white/10 grayscale opacity-70'>
                          <AvatarImage src={r.victim.photoURL || undefined} />
                          <AvatarFallback className='text-xs font-bold'>
                            {(r.victim.name || '?')
                              .substring(0, 2)
                              .toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <span className='text-[10px] font-bold leading-tight truncate w-full text-muted-foreground'>
                          {r.victim.name}
                        </span>
                      </div>

                      <div className='flex-1 flex flex-col items-center text-center justify-center px-2'>
                        <span className='text-[9px] font-black text-muted-foreground uppercase tracking-widest mb-1.5'>
                          {t('H2H Record')}
                        </span>
                        <div className='flex items-center gap-2 text-base font-black bg-muted/50 px-3 py-1 rounded-xl ring-1 ring-black/5 dark:ring-white/5'>
                          <span className='text-red-500' title={t('Wins')}>
                            {r.wins}
                          </span>
                          <span className='text-muted-foreground/30'>-</span>
                          <span
                            className='text-emerald-500'
                            title={t('Losses')}
                          >
                            {r.losses}
                          </span>
                        </div>
                        <span className='text-[9px] font-bold text-purple-700 dark:text-purple-400 mt-2 bg-purple-500/20 px-2.5 py-0.5 rounded-full uppercase tracking-widest shadow-sm'>
                          {r.winRate}% {t('Win')}
                        </span>
                      </div>

                      <div className='flex flex-col items-center w-[60px] text-center'>
                        <Avatar className='h-10 w-10 mb-2 ring-2 ring-purple-500 shadow-[0_0_10px_rgba(168,85,247,0.4)] transition-transform hover:scale-110'>
                          <AvatarImage src={r.nemesis.photoURL || undefined} />
                          <AvatarFallback className='text-xs font-bold bg-purple-100 text-purple-700'>
                            {(r.nemesis.name || '?')
                              .substring(0, 2)
                              .toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <span className='text-[10px] font-bold leading-tight truncate w-full text-foreground'>
                          {r.nemesis.name}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        )}
      </div>

      <Card className='lg:col-span-7 border-0 rounded-[2rem] glass-panel shadow-xl flex flex-col h-[700px] overflow-hidden'>
        <CardHeader className='pb-4 border-b border-black/5 dark:border-white/5 bg-muted/20 flex-shrink-0 px-8 pt-8'>
          <CardTitle className='text-xl font-extrabold flex items-center justify-between tracking-tight'>
            <div className='flex items-center gap-3'>
              <div className='bg-primary/10 p-2 rounded-xl text-primary'>
                <Swords className='w-6 h-6' />
              </div>
              {t('Derby Chronicles')}
            </div>
            <span className='text-[10px] uppercase tracking-widest font-bold text-muted-foreground bg-background/50 backdrop-blur-sm px-3 py-1.5 rounded-full ring-1 ring-black/5 dark:ring-white/10 shadow-sm'>
              {chronicles.length} {t('Events')}
            </span>
          </CardTitle>
        </CardHeader>

        <CardContent className='p-0 flex-1 relative overflow-hidden bg-background/30'>
          <ScrollArea className='h-full w-full p-6'>
            {chronicles.length === 0 ? (
              <div className='flex items-center justify-center h-full text-muted-foreground text-sm font-light py-20'>
                {t('No historical events recorded yet.')}
              </div>
            ) : (
              <div className='space-y-6 pr-4 pb-6 relative'>
                {/* Timeline vertical line */}
                <div className='absolute left-[11px] top-4 bottom-4 w-px bg-gradient-to-b from-primary/30 via-primary/10 to-transparent' />

                {chronicles.map((event) => (
                  <div
                    key={event.match.id}
                    className='relative pl-8 pb-2 group'
                  >
                    <div className='text-[9px] uppercase font-bold text-muted-foreground mb-2 tracking-widest ml-1'>
                      {safeFormatDate(
                        event.match.tsIso ?? event.match.timestamp,
                        'MMM d, HH:mm',
                      )}
                    </div>
                    {renderChronicleCard(event)}
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
