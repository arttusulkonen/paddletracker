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
	Droplet,
	Flame,
	Skull,
	Swords,
	Target,
	TrendingDown,
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

// Генератор хэша для детерминированного рандома (чтобы фразы не менялись при ререндере)
const getHash = (str: string) => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash);
};

const pickRandom = (arr: string[], hash: number) => arr[hash % arr.length];

// Вариативные пулы фраз
const PHRASES = {
  NAIL_BITER: [
    '{{winner}} survived a sweaty match against {{loser}}',
    'Absolute cinema! {{winner}} edged out {{loser}}',
    '{{loser}} choked at the finish line against {{winner}}',
    'Heart attack match! {{winner}} barely survived {{loser}}',
    'Down to the wire! {{winner}} clutched against {{loser}}',
  ],
  FLAWLESS: [
    '{{winner}} completely humiliated {{loser}}',
    '{{winner}} gave a free lesson to {{loser}}',
    '{{loser}} forgot how to hold a paddle against {{winner}}',
    'Total annihilation by {{winner}} over {{loser}}',
    '{{winner}} destroyed {{loser}} without breaking a sweat',
  ],
  UPSET: [
    'Massive Upset! {{winner}} shocked the favorite {{loser}}',
    '{{winner}} defied the math and broke {{loser}}',
    'Nobody bet on {{winner}}, but they crushed {{loser}}',
    'David vs Goliath! {{winner}} slayed the higher-ranked {{loser}}',
  ],
  GIANT_SLAYER: [
    "{{winner}} claimed the massive bounty on {{loser}}'s head!",
    'The streak is dead! {{winner}} dethroned {{loser}}',
    "{{loser}}'s reign of terror was ended by {{winner}}",
    'Jackpot! {{winner}} cashed in on {{loser}}',
  ],
  DOMINATION: [
    '{{winner}} dominated {{loser}} from start to finish',
    'Easy money for {{winner}} against {{loser}}',
    '{{winner}} steamrolled through {{loser}}',
    'No chance for {{loser}}, {{winner}} was too good',
  ],
  ROUTINE: [
    '{{winner}} secured a solid win over {{loser}}',
    'Another day, another victory for {{winner}} against {{loser}}',
    '{{winner}} defeated {{loser}} in a standard matchup',
    '{{winner}} outplayed {{loser}}',
    'Business as usual: {{winner}} takes down {{loser}}',
  ],
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
    const list: { victim: Member; nemesis: Member }[] = [];
    safeMembers.forEach((m) => {
      if (m.nemesisId) {
        const nemesis = safeMembers.find((n) => n.userId === m.nemesisId);
        if (nemesis) list.push({ victim: m, nemesis });
      }
    });
    return list;
  }, [safeMembers]);

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
        // Потная катка (отрыв в 2 очка)
        type = 'NAIL_BITER';
      } else if (minScore <= 2 && maxScore >= 11) {
        // Сухая или почти сухая победа
        type = 'FLAWLESS';
      } else if (delta >= 15) {
        type = 'DOMINATION';
      }

      const matchHash = getHash(m.id || String(Math.random()));
      const phrase = pickRandom(PHRASES[type], matchHash);

      events.push({ match: m, type, phrase, winner, loser, delta });
    });

    // Возвращаем ВСЕ события, лимит снят
    return events;
  }, [safeMatches]);

  if (room.mode !== 'derby') return null;

  if (
    bounties.length === 0 &&
    rivalries.length === 0 &&
    chronicles.length === 0
  ) {
    return (
      <Card className='mb-8 border-red-500/20 bg-red-500/5'>
        <CardContent className='p-6 text-center text-red-500/70'>
          <Swords className='w-8 h-8 mx-auto mb-2 opacity-50' />
          <p className='text-sm font-medium'>
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
    const scoreText = `${m.player1.scores} - ${m.player2.scores}`;
    // Локализация с интерполяцией имен
    const localizedText = t(phrase, {
      winner: winner.name,
      loser: loser.name,
    });

    switch (type) {
      case 'FLAWLESS':
        return (
          <div className='bg-sky-500/10 border border-sky-500/20 rounded-lg p-3'>
            <div className='flex items-center gap-2 text-sky-600 dark:text-sky-400 font-bold text-[10px] uppercase mb-1'>
              <Target className='w-3 h-3' />
              {t('Flawless Victory')}
            </div>
            <div
              className='text-sm font-medium leading-tight'
              dangerouslySetInnerHTML={{
                __html: localizedText
                  .replace(
                    winner.name,
                    `<span class="text-foreground font-bold">${winner.name}</span>`,
                  )
                  .replace(
                    loser.name,
                    `<span class="text-muted-foreground">${loser.name}</span>`,
                  ),
              }}
            />
            <div className='flex items-center justify-between mt-2'>
              <span className='font-mono text-xs bg-background px-1.5 rounded border'>
                {scoreText}
              </span>
              <span className='text-xs font-bold text-sky-600'>
                +{Math.round(delta)}
              </span>
            </div>
          </div>
        );

      case 'NAIL_BITER':
        return (
          <div className='bg-amber-500/10 border border-amber-500/20 rounded-lg p-3'>
            <div className='flex items-center gap-2 text-amber-600 dark:text-amber-400 font-bold text-[10px] uppercase mb-1'>
              <Droplet className='w-3 h-3' />
              {t('Nail-Biter')}
            </div>
            <div
              className='text-sm font-medium leading-tight'
              dangerouslySetInnerHTML={{
                __html: localizedText
                  .replace(
                    winner.name,
                    `<span class="text-foreground font-bold">${winner.name}</span>`,
                  )
                  .replace(
                    loser.name,
                    `<span class="text-muted-foreground">${loser.name}</span>`,
                  ),
              }}
            />
            <div className='flex items-center justify-between mt-2'>
              <span className='font-mono text-xs bg-background px-1.5 rounded border border-amber-500/30'>
                {scoreText}
              </span>
              <span className='text-xs font-bold text-amber-600'>
                +{Math.round(delta)}
              </span>
            </div>
          </div>
        );

      case 'GIANT_SLAYER':
        return (
          <div className='bg-red-500/10 border border-red-500/30 rounded-lg p-3 relative overflow-hidden'>
            <div className='absolute -right-4 -top-4 opacity-10'>
              <Skull className='w-20 h-20 text-red-500' />
            </div>
            <div className='flex items-center gap-2 text-red-600 dark:text-red-400 font-bold text-[10px] uppercase mb-1 relative z-10'>
              <Swords className='w-3 h-3' />
              {t('Giant Slayer')}
            </div>
            <div
              className='text-sm font-medium leading-tight relative z-10'
              dangerouslySetInnerHTML={{
                __html: localizedText
                  .replace(
                    winner.name,
                    `<span class="text-foreground font-bold">${winner.name}</span>`,
                  )
                  .replace(
                    loser.name,
                    `<span class="text-muted-foreground line-through decoration-red-500/50">${loser.name}</span>`,
                  ),
              }}
            />
            <div className='flex items-center justify-between mt-2 relative z-10'>
              <span className='font-mono text-xs bg-background px-1.5 rounded border border-red-500/30'>
                {scoreText}
              </span>
              <span className='text-sm font-black text-red-600 bg-red-500/20 px-2 rounded'>
                +{Math.round(delta)} ELO
              </span>
            </div>
          </div>
        );

      case 'UPSET':
        return (
          <div className='bg-purple-500/10 border border-purple-500/20 rounded-lg p-3'>
            <div className='flex items-center gap-2 text-purple-600 dark:text-purple-400 font-bold text-[10px] uppercase mb-1'>
              <TrendingDown className='w-3 h-3' />
              {t('Massive Upset')}
            </div>
            <div
              className='text-sm font-medium leading-tight'
              dangerouslySetInnerHTML={{
                __html: localizedText
                  .replace(
                    winner.name,
                    `<span class="text-foreground font-bold">${winner.name}</span>`,
                  )
                  .replace(
                    loser.name,
                    `<span class="text-muted-foreground">${loser.name}</span>`,
                  ),
              }}
            />
            <div className='flex items-center justify-between mt-2'>
              <span className='font-mono text-xs bg-background px-1.5 rounded border'>
                {scoreText}
              </span>
              <span className='text-xs font-bold text-purple-600'>
                +{Math.round(delta)}
              </span>
            </div>
          </div>
        );

      case 'DOMINATION':
        return (
          <div className='bg-primary/5 border border-primary/20 rounded-lg p-3'>
            <div className='flex items-center gap-2 text-primary font-bold text-[10px] uppercase mb-1'>
              <Flame className='w-3 h-3' />
              {t('Domination')}
            </div>
            <div
              className='text-sm font-medium leading-tight'
              dangerouslySetInnerHTML={{
                __html: localizedText
                  .replace(
                    winner.name,
                    `<span class="text-foreground font-bold">${winner.name}</span>`,
                  )
                  .replace(
                    loser.name,
                    `<span class="text-muted-foreground">${loser.name}</span>`,
                  ),
              }}
            />
            <div className='flex items-center justify-between mt-2'>
              <span className='font-mono text-xs bg-background px-1.5 rounded border'>
                {scoreText}
              </span>
              <span className='text-xs font-bold text-primary'>
                +{Math.round(delta)}
              </span>
            </div>
          </div>
        );

      default:
        return (
          <div className='bg-muted/30 border border-border rounded-lg p-3'>
            <div
              className='text-sm font-medium leading-tight'
              dangerouslySetInnerHTML={{
                __html: localizedText
                  .replace(
                    winner.name,
                    `<span class="text-foreground font-bold">${winner.name}</span>`,
                  )
                  .replace(
                    loser.name,
                    `<span class="text-muted-foreground">${loser.name}</span>`,
                  ),
              }}
            />
            <div className='flex items-center justify-between mt-2'>
              <span className='font-mono text-xs bg-background px-1.5 rounded border text-muted-foreground'>
                {scoreText}
              </span>
              <span className='text-xs font-bold text-muted-foreground flex items-center gap-1'>
                <Zap className='w-3 h-3' />+{Math.round(delta)}
              </span>
            </div>
          </div>
        );
    }
  };

  return (
    <div className='grid grid-cols-1 lg:grid-cols-12 gap-6 mb-8'>
      {/* Левая колонка со стриками и заклятыми врагами */}
      <div className='lg:col-span-5 space-y-6'>
        {bounties.length > 0 && (
          <Card className='border-orange-500/30 bg-orange-500/5 shadow-md'>
            <CardHeader className='pb-3'>
              <CardTitle className='text-lg font-bold text-orange-600 dark:text-orange-400 flex items-center gap-2'>
                <Flame className='w-5 h-5 fill-current animate-pulse' />
                {t('Active Bounties')}
              </CardTitle>
            </CardHeader>
            <CardContent className='space-y-3'>
              {bounties.map((b) => (
                <div
                  key={b.userId}
                  className='flex items-center justify-between bg-background border border-orange-500/20 rounded-lg p-3'
                >
                  <div className='flex items-center gap-3'>
                    <Avatar className='h-10 w-10 border-2 border-orange-500'>
                      <AvatarImage src={b.photoURL || undefined} />
                      <AvatarFallback className='bg-orange-100 text-orange-700'>
                        {(b.name || '?').substring(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <div className='font-bold text-sm'>{b.name}</div>
                      <div className='text-xs text-muted-foreground flex items-center gap-1'>
                        <Flame className='w-3 h-3 text-orange-500' />
                        {b.currentStreak} {t('Win Streak')}
                      </div>
                    </div>
                  </div>
                  <div className='text-right'>
                    <div className='text-xs font-semibold text-orange-500 uppercase tracking-wide'>
                      {t('Reward')}
                    </div>
                    <div className='font-bold text-lg text-foreground'>
                      +{((b.currentStreak ?? 0) - 2) * 5} {t('ELO')}
                    </div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {rivalries.length > 0 && (
          <Card className='border-purple-500/30 bg-purple-500/5 shadow-md'>
            <CardHeader className='pb-3'>
              <CardTitle className='text-lg font-bold text-purple-600 dark:text-purple-400 flex items-center gap-2'>
                <Skull className='w-5 h-5' />
                {t('Active Rivalries')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className='max-h-[300px] pr-4'>
                <div className='space-y-3'>
                  {rivalries.map((r, idx) => (
                    <div
                      key={idx}
                      className='flex items-center gap-4 bg-background border border-purple-500/20 rounded-lg p-3'
                    >
                      <div className='flex flex-col items-center w-12 text-center'>
                        <Avatar className='h-8 w-8 mb-1 border border-border grayscale'>
                          <AvatarImage src={r.victim.photoURL || undefined} />
                          <AvatarFallback className='text-[10px]'>
                            {(r.victim.name || '?')
                              .substring(0, 2)
                              .toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <span className='text-[10px] leading-tight truncate w-full text-muted-foreground'>
                          {r.victim.name}
                        </span>
                      </div>

                      <div className='flex-1 flex flex-col items-center text-center'>
                        <span className='text-xs font-bold text-purple-500 uppercase tracking-wider bg-purple-500/10 px-2 py-0.5 rounded-full'>
                          {t('Fears')}
                        </span>
                        <div className='w-full h-px bg-purple-500/20 my-2 relative'>
                          <div className='absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-2 h-2 rotate-45 border-t border-r border-purple-500/40 bg-background' />
                        </div>
                      </div>

                      <div className='flex flex-col items-center w-12 text-center'>
                        <Avatar className='h-8 w-8 mb-1 border-2 border-purple-500 shadow-[0_0_8px_rgba(168,85,247,0.4)]'>
                          <AvatarImage src={r.nemesis.photoURL || undefined} />
                          <AvatarFallback className='text-[10px] bg-purple-100 text-purple-700'>
                            {(r.nemesis.name || '?')
                              .substring(0, 2)
                              .toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <span className='text-[10px] leading-tight truncate w-full font-bold'>
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

      {/* Правая колонка с жесткой высотой для хроник */}
      <Card className='lg:col-span-7 border-border shadow-md flex flex-col h-[600px]'>
        <CardHeader className='pb-3 border-b bg-muted/20 flex-shrink-0'>
          <CardTitle className='text-lg font-bold flex items-center justify-between'>
            <div className='flex items-center gap-2'>
              <Swords className='w-5 h-5 text-primary' />
              {t('Derby Chronicles')}
            </div>
            <span className='text-xs font-normal text-muted-foreground bg-background px-2 py-1 rounded-full border'>
              {chronicles.length} {t('Events')}
            </span>
          </CardTitle>
        </CardHeader>

        <CardContent className='p-0 flex-1 relative overflow-hidden'>
          <ScrollArea className='h-full w-full p-4'>
            {chronicles.length === 0 ? (
              <div className='flex items-center justify-center h-full text-muted-foreground text-sm italic py-10'>
                {t('No historical events recorded yet.')}
              </div>
            ) : (
              <div className='space-y-4 pr-3 pb-4'>
                {chronicles.map((event) => (
                  <div
                    key={event.match.id}
                    className='relative pl-4 border-l-2 border-primary/20 pb-2'
                  >
                    <div className='absolute w-2 h-2 bg-primary rounded-full -left-[5px] top-1.5' />
                    <div className='text-[10px] uppercase font-bold text-muted-foreground mb-1.5 tracking-wider'>
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
