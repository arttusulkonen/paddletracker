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
      <Card className='mb-4 border-0 rounded-xl glass-panel shadow-sm bg-red-500/5 ring-1 ring-red-500/20'>
        <CardContent className='p-4 text-center text-red-600/70 dark:text-red-400/70'>
          <Swords className='w-6 h-6 mx-auto mb-2 opacity-50' />
          <p className='text-xs font-semibold max-w-sm mx-auto'>
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
      <div className='flex items-center gap-1 font-mono text-[9px] bg-background/80 backdrop-blur-md px-1.5 py-0.5 rounded border border-black/5 dark:border-white/5 text-muted-foreground shrink-0'>
        <span className='font-bold text-foreground truncate max-w-[45px]'>
          {m.player1.name}
        </span>
        <span className='opacity-50'>
          {m.player1.scores}-{m.player2.scores}
        </span>
        <span className='font-bold text-foreground truncate max-w-[45px]'>
          {m.player2.name}
        </span>
      </div>
    );

    const baseClass =
      'rounded-xl p-2.5 shadow-sm ring-1 ring-inset flex flex-col justify-center';

    switch (type) {
      case 'FLAWLESS':
        return (
          <div className={`${baseClass} bg-sky-500/10 ring-sky-500/20`}>
            <div className='flex items-center justify-between mb-1'>
              <div className='flex items-center gap-1.5 text-sky-600 dark:text-sky-400 font-bold text-[9px] uppercase tracking-widest'>
                <Target className='w-3 h-3' />
                {t('Flawless Victory')}
              </div>
              <span className='text-[10px] font-black text-sky-600 dark:text-sky-400'>
                +{Math.round(delta)}
              </span>
            </div>
            <div className='flex items-center justify-between gap-2'>
              <div className='text-[11px] font-medium leading-snug flex-1'>
                {renderText(localizedText, winner.name, loser.name, type)}
              </div>
              {ScoreBadge}
            </div>
          </div>
        );

      case 'NAIL_BITER':
        return (
          <div className={`${baseClass} bg-amber-500/10 ring-amber-500/20`}>
            <div className='flex items-center justify-between mb-1'>
              <div className='flex items-center gap-1.5 text-amber-600 dark:text-amber-400 font-bold text-[9px] uppercase tracking-widest'>
                <Droplet className='w-3 h-3' />
                {t('Nail-Biter')}
              </div>
              <span className='text-[10px] font-black text-amber-600 dark:text-amber-400'>
                +{Math.round(delta)}
              </span>
            </div>
            <div className='flex items-center justify-between gap-2'>
              <div className='text-[11px] font-medium leading-snug flex-1'>
                {renderText(localizedText, winner.name, loser.name, type)}
              </div>
              {ScoreBadge}
            </div>
          </div>
        );

      case 'GIANT_SLAYER':
        return (
          <div
            className={`${baseClass} bg-red-500/10 ring-red-500/30 relative overflow-hidden`}
          >
            <div className='absolute -right-2 -top-2 opacity-10 pointer-events-none'>
              <Skull className='w-12 h-12 text-red-500' />
            </div>
            <div className='flex items-center justify-between mb-1 relative z-10'>
              <div className='flex items-center gap-1.5 text-red-600 dark:text-red-400 font-bold text-[9px] uppercase tracking-widest'>
                <Swords className='w-3 h-3' />
                {t('Giant Slayer')}
              </div>
              <span className='text-[9px] font-black text-white bg-red-500 px-1 py-px rounded shadow-sm'>
                +{Math.round(delta)} ELO
              </span>
            </div>
            <div className='flex items-center justify-between gap-2 relative z-10'>
              <div className='text-[11px] font-medium leading-snug flex-1'>
                {renderText(localizedText, winner.name, loser.name, type)}
              </div>
              {ScoreBadge}
            </div>
          </div>
        );

      case 'UPSET':
        return (
          <div className={`${baseClass} bg-purple-500/10 ring-purple-500/20`}>
            <div className='flex items-center justify-between mb-1'>
              <div className='flex items-center gap-1.5 text-purple-600 dark:text-purple-400 font-bold text-[9px] uppercase tracking-widest'>
                <TrendingDown className='w-3 h-3' />
                {t('Massive Upset')}
              </div>
              <span className='text-[10px] font-black text-purple-600 dark:text-purple-400'>
                +{Math.round(delta)}
              </span>
            </div>
            <div className='flex items-center justify-between gap-2'>
              <div className='text-[11px] font-medium leading-snug flex-1'>
                {renderText(localizedText, winner.name, loser.name, type)}
              </div>
              {ScoreBadge}
            </div>
          </div>
        );

      case 'DOMINATION':
        return (
          <div className={`${baseClass} bg-primary/10 ring-primary/20`}>
            <div className='flex items-center justify-between mb-1'>
              <div className='flex items-center gap-1.5 text-primary font-bold text-[9px] uppercase tracking-widest'>
                <Flame className='w-3 h-3' />
                {t('Domination')}
              </div>
              <span className='text-[10px] font-black text-primary'>
                +{Math.round(delta)}
              </span>
            </div>
            <div className='flex items-center justify-between gap-2'>
              <div className='text-[11px] font-medium leading-snug flex-1'>
                {renderText(localizedText, winner.name, loser.name, type)}
              </div>
              {ScoreBadge}
            </div>
          </div>
        );

      default:
        return (
          <div className={`${baseClass} bg-muted/30 ring-border/50`}>
            <div className='flex items-center justify-between gap-2'>
              <div className='text-[11px] font-medium leading-snug flex-1'>
                {renderText(localizedText, winner.name, loser.name, type)}
              </div>
              <div className='flex flex-col items-end gap-1'>
                <span className='text-[9px] font-black text-muted-foreground flex items-center gap-0.5'>
                  <Zap className='w-2.5 h-2.5' />+{Math.round(delta)}
                </span>
                {ScoreBadge}
              </div>
            </div>
          </div>
        );
    }
  };

  return (
    <div className='grid grid-cols-1 lg:grid-cols-12 gap-4 mb-4'>
      <div className='lg:col-span-5 space-y-4'>
        {(insights.highestStreak > 0 || insights.biggestHeist > 0) && (
          <Card className='border-0 rounded-xl glass-panel bg-blue-500/5 ring-1 ring-blue-500/20 shadow-sm relative overflow-hidden'>
            <div className='absolute inset-0 bg-gradient-to-br from-blue-500/10 to-transparent mix-blend-overlay pointer-events-none' />
            <CardHeader className='pb-2 relative z-10 px-4 pt-4'>
              <CardTitle className='text-sm font-extrabold text-blue-600 dark:text-blue-400 flex items-center gap-1.5 tracking-tight'>
                <div className='p-1 bg-blue-500/10 rounded-md'>
                  <LineChart className='w-3.5 h-3.5' />
                </div>
                {t('Arena Insights')}
              </CardTitle>
            </CardHeader>
            <CardContent className='space-y-1.5 px-4 pb-4 relative z-10'>
              {insights.highestStreakPlayer && insights.highestStreak > 0 && (
                <div className='flex items-center justify-between bg-background/60 backdrop-blur-md ring-1 ring-black/5 dark:ring-white/10 rounded-lg p-2 shadow-sm'>
                  <div className='flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-widest text-muted-foreground'>
                    <Trophy className='w-3 h-3 text-yellow-500' />
                    <span>{t('All-Time Streak')}</span>
                  </div>
                  <div className='flex items-center gap-1.5'>
                    <span className='font-bold text-xs'>
                      {insights.highestStreakPlayer?.name}
                    </span>
                    <span className='bg-yellow-500/20 text-yellow-700 dark:text-yellow-500 px-1 py-px rounded text-[9px] font-black'>
                      {insights.highestStreak} 🔥
                    </span>
                  </div>
                </div>
              )}
              {insights.biggestHeistPlayer && insights.biggestHeist > 0 && (
                <div className='flex items-center justify-between bg-background/60 backdrop-blur-md ring-1 ring-black/5 dark:ring-white/10 rounded-lg p-2 shadow-sm'>
                  <div className='flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-widest text-muted-foreground'>
                    <Coins className='w-3 h-3 text-emerald-500' />
                    <span>{t('Biggest Heist')}</span>
                  </div>
                  <div className='flex items-center gap-1.5'>
                    <span className='font-bold text-xs'>
                      {insights.biggestHeistPlayer?.name}
                    </span>
                    <span className='bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 px-1 py-px rounded text-[9px] font-black'>
                      +{Math.round(insights.biggestHeist)} ELO
                    </span>
                  </div>
                </div>
              )}
              {insights.mostFrequentMatchupCount > 0 && (
                <div className='flex items-center justify-between bg-background/60 backdrop-blur-md ring-1 ring-black/5 dark:ring-white/10 rounded-lg p-2 shadow-sm'>
                  <div className='flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-widest text-muted-foreground'>
                    <Swords className='w-3 h-3 text-rose-500' />
                    <span>{t('Most Clashes')}</span>
                  </div>
                  <div className='flex flex-col items-end gap-0.5'>
                    <span className='bg-rose-500/20 text-rose-700 dark:text-rose-400 px-1 py-px rounded text-[8px] font-black uppercase'>
                      {insights.mostFrequentMatchupCount} {t('Games')}
                    </span>
                    <span className='font-bold text-[9px] text-muted-foreground truncate max-w-[100px]'>
                      {insights.mostFrequentMatchupNames}
                    </span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {bounties.length > 0 && (
          <Card className='border-0 rounded-xl glass-panel bg-orange-500/5 ring-1 ring-orange-500/20 shadow-sm relative overflow-hidden'>
            <div className='absolute inset-0 bg-gradient-to-br from-orange-500/10 to-transparent mix-blend-overlay pointer-events-none' />
            <CardHeader className='pb-2 relative z-10 px-4 pt-4'>
              <CardTitle className='text-sm font-extrabold text-orange-600 dark:text-orange-400 flex items-center gap-1.5 tracking-tight'>
                <div className='p-1 bg-orange-500/10 rounded-md'>
                  <Flame className='w-3.5 h-3.5 fill-current animate-pulse' />
                </div>
                {t('Active Bounties')}
              </CardTitle>
            </CardHeader>
            <CardContent className='space-y-1.5 px-4 pb-4 relative z-10'>
              {bounties.map((b) => (
                <div
                  key={b.userId}
                  className='flex items-center justify-between bg-background/60 backdrop-blur-md ring-1 ring-black/5 dark:ring-white/10 rounded-lg p-2 shadow-sm transition-transform hover:scale-[1.01]'
                >
                  <div className='flex items-center gap-2.5'>
                    <Avatar className='h-7 w-7 ring-1 ring-orange-500/50'>
                      <AvatarImage src={b.photoURL || undefined} />
                      <AvatarFallback className='bg-orange-100 text-orange-700 text-[9px] font-bold'>
                        {(b.name || '?').substring(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <div className='font-bold text-xs leading-tight'>
                        {b.name}
                      </div>
                      <div className='text-[8px] font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-1 mt-0.5'>
                        <Flame className='w-2 h-2 text-orange-500' />
                        {b.currentStreak} {t('Win Streak')}
                      </div>
                    </div>
                  </div>
                  <div className='text-right'>
                    <div className='text-[7px] font-bold text-orange-500 uppercase tracking-widest mb-0.5'>
                      {t('Reward')}
                    </div>
                    <div className='font-black text-sm text-foreground leading-none'>
                      +{((b.currentStreak ?? 0) - 2) * 5}
                    </div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {rivalries.length > 0 && (
          <Card className='border-0 rounded-xl glass-panel bg-purple-500/5 ring-1 ring-purple-500/20 shadow-sm relative overflow-hidden'>
            <div className='absolute inset-0 bg-gradient-to-br from-purple-500/10 to-transparent mix-blend-overlay pointer-events-none' />
            <CardHeader className='pb-2 relative z-10 px-4 pt-4'>
              <CardTitle className='text-sm font-extrabold text-purple-600 dark:text-purple-400 flex items-center gap-1.5 tracking-tight'>
                <div className='p-1 bg-purple-500/10 rounded-md'>
                  <Skull className='w-3.5 h-3.5' />
                </div>
                {t('Active Rivalries')}
              </CardTitle>
            </CardHeader>
            <CardContent className='px-4 pb-4 relative z-10'>
              <ScrollArea className='max-h-[220px] pr-2 overflow-visible'>
                <div className='space-y-1.5'>
                  {rivalries.map((r, idx) => (
                    <div
                      key={idx}
                      className='flex items-center justify-between bg-background/60 backdrop-blur-md ring-1 ring-black/5 dark:ring-white/10 rounded-lg p-2 shadow-sm'
                    >
                      <div className='flex flex-col items-center w-[40px] text-center'>
                        <Avatar className='h-6 w-6 mb-1 ring-1 ring-black/5 dark:ring-white/10 grayscale opacity-70'>
                          <AvatarImage src={r.victim.photoURL || undefined} />
                          <AvatarFallback className='text-[9px] font-bold'>
                            {(r.victim.name || '?')
                              .substring(0, 2)
                              .toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <span className='text-[8px] font-bold leading-tight truncate w-full text-muted-foreground'>
                          {r.victim.name}
                        </span>
                      </div>

                      <div className='flex-1 flex flex-col items-center text-center justify-center px-1'>
                        <div className='flex items-center gap-1 text-xs font-black bg-muted/50 px-1.5 py-0.5 rounded-md ring-1 ring-black/5 dark:ring-white/5'>
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
                        <span className='text-[7px] font-bold text-purple-700 dark:text-purple-400 mt-1 bg-purple-500/20 px-1 py-px rounded uppercase tracking-widest'>
                          {r.winRate}% {t('Win')}
                        </span>
                      </div>

                      <div className='flex flex-col items-center w-[40px] text-center'>
                        <Avatar className='h-6 w-6 mb-1 ring-1 ring-purple-500 shadow-sm transition-transform hover:scale-110'>
                          <AvatarImage src={r.nemesis.photoURL || undefined} />
                          <AvatarFallback className='text-[9px] font-bold bg-purple-100 text-purple-700'>
                            {(r.nemesis.name || '?')
                              .substring(0, 2)
                              .toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <span className='text-[8px] font-bold leading-tight truncate w-full text-foreground'>
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

      <Card className='lg:col-span-7 border-0 rounded-xl glass-panel shadow-sm flex flex-col h-[500px] overflow-hidden'>
        <CardHeader className='pb-2 border-b border-black/5 dark:border-white/5 bg-muted/10 flex-shrink-0 px-4 pt-4'>
          <CardTitle className='text-base font-extrabold flex items-center justify-between tracking-tight'>
            <div className='flex items-center gap-2'>
              <div className='bg-primary/10 p-1.5 rounded-lg text-primary'>
                <Swords className='w-4 h-4' />
              </div>
              {t('Derby Chronicles')}
            </div>
            <span className='text-[8px] uppercase tracking-widest font-bold text-muted-foreground bg-background/50 backdrop-blur-sm px-2 py-0.5 rounded-full ring-1 ring-black/5 dark:ring-white/10'>
              {chronicles.length} {t('Events')}
            </span>
          </CardTitle>
        </CardHeader>

        <CardContent className='p-0 flex-1 relative overflow-hidden bg-background/30'>
          <ScrollArea className='h-full w-full p-3'>
            {chronicles.length === 0 ? (
              <div className='flex items-center justify-center h-full text-muted-foreground text-xs font-light py-10'>
                {t('No historical events recorded yet.')}
              </div>
            ) : (
              <div className='space-y-3 pr-2 pb-3 relative'>
                <div className='absolute left-2.5 top-1.5 bottom-1.5 w-px bg-gradient-to-b from-primary/30 via-primary/10 to-transparent' />

                {chronicles.map((event) => (
                  <div
                    key={event.match.id}
                    className='relative pl-5 pb-0.5 group'
                  >
                    <div className='absolute left-[-3.5px] top-1 w-1.5 h-1.5 rounded-full bg-primary/50' />
                    <div className='text-[7px] uppercase font-bold text-muted-foreground/70 mb-1 tracking-widest'>
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
