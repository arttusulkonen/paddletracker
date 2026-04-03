// src/components/rooms/DerbyHallOfFame.tsx
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
} from '@/components/ui';
import { useAuth } from '@/contexts/AuthContext';
import { getUserLite } from '@/lib/friends';
import { Room } from '@/lib/types';
import {
	Clock,
	Crown,
	Flame,
	History,
	Info,
	Skull,
	Trophy,
} from 'lucide-react';
import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

export function DerbyHallOfFame({ room }: { room: Room }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [avatars, setAvatars] = useState<Record<string, string | null>>({});

  const history = useMemo(() => {
    const raw = (room as any).sprintHistory || [];
    return [...raw].reverse();
  }, [room]);

  const sortedHof = useMemo(() => {
    if (!room.hallOfFame) return [];
    return [...room.hallOfFame].sort(
      (a, b) =>
        (b.championships || 0) - (a.championships || 0) ||
        (b.totalDerbyWins || 0) - (a.totalDerbyWins || 0),
    );
  }, [room]);

  // Fetch avatars for the legends to make it look nicer
  useEffect(() => {
    const fetchAvatars = async () => {
      const newAvatars: Record<string, string | null> = {};
      for (const entry of sortedHof) {
        if (entry.userId && !newAvatars[entry.userId]) {
          try {
            const p = await getUserLite(entry.userId);
            if (p) newAvatars[entry.userId] = p.photoURL || null;
          } catch (e) {
            // ignore
          }
        }
      }
      setAvatars(newAvatars);
    };
    if (sortedHof.length > 0) fetchAvatars();
  }, [sortedHof]);

  return (
    <ScrollArea className='h-full w-full'>
      <div className='flex flex-col gap-6 pb-6 pr-4'>
        {/* ALL-TIME LEGENDS */}
        <Card className='border-0 rounded-[1.5rem] glass-panel bg-card shadow-xl shrink-0 relative overflow-hidden'>
          <div className='absolute inset-0 bg-gradient-to-br from-yellow-500/5 via-transparent to-transparent pointer-events-none' />
          <CardHeader className='px-5 pt-5 pb-3 relative z-10'>
            <CardTitle className='text-sm font-black flex items-center gap-2 tracking-widest uppercase text-yellow-600 dark:text-yellow-500'>
              <div className='bg-yellow-500/10 p-1.5 rounded-lg'>
                <Crown className='w-4 h-4' />
              </div>
              {t('All-Time Legends')}
            </CardTitle>
          </CardHeader>

          <CardContent className='px-5 pb-5 relative z-10'>
            {sortedHof.length === 0 ? (
              <p className='text-center py-6 text-muted-foreground text-xs font-light'>
                {t('No legends yet. Finish a sprint to create history.')}
              </p>
            ) : (
              <div className='space-y-3'>
                {/* TOP 3 PODIUM CARDS */}
                {sortedHof.slice(0, 3).map((entry, idx) => {
                  const isFirst = idx === 0;
                  const isSecond = idx === 1;
                  const isThird = idx === 2;

                  const medalColor = isFirst
                    ? 'text-yellow-500 bg-yellow-500/10 ring-yellow-500/30'
                    : isSecond
                      ? 'text-slate-400 bg-slate-400/10 ring-slate-400/30'
                      : 'text-amber-600 bg-amber-600/10 ring-amber-600/30';

                  return (
                    <div
                      key={entry.userId}
                      className={`flex items-center justify-between p-3 rounded-xl bg-background/80 backdrop-blur-md shadow-sm ring-1 ${isFirst ? 'ring-yellow-500/40 shadow-yellow-500/5' : 'ring-border/50'}`}
                    >
                      <div className='flex items-center gap-3'>
                        <div
                          className={`flex items-center justify-center w-6 h-6 rounded-full ${medalColor} font-black text-[10px]`}
                        >
                          {idx + 1}
                        </div>
                        <Avatar
                          className={`h-10 w-10 ${isFirst ? 'ring-2 ring-yellow-500 ring-offset-2 ring-offset-background' : 'ring-1 ring-border'}`}
                        >
                          <AvatarImage
                            src={avatars[entry.userId] || undefined}
                          />
                          <AvatarFallback className='text-xs font-bold'>
                            {(entry.name || '?').substring(0, 2).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <div className='font-bold text-sm leading-none mb-1.5 flex items-center gap-1.5'>
                            {entry.name}
                            {entry.userId === user?.uid && (
                              <Badge
                                variant='secondary'
                                className='text-[7px] px-1 py-0 h-3 leading-none uppercase bg-primary/10 text-primary hover:bg-primary/10'
                              >
                                {t('You')}
                              </Badge>
                            )}
                          </div>
                          <div className='flex items-center gap-3 text-[10px] font-bold text-muted-foreground uppercase tracking-widest'>
                            <span
                              className='flex items-center gap-1 text-yellow-600 dark:text-yellow-500'
                              title={t('Championships')}
                            >
                              <Trophy className='w-3 h-3' />{' '}
                              {entry.championships || 0}
                            </span>
                            <span
                              className='flex items-center gap-1 text-purple-500'
                              title={t('Slayers')}
                            >
                              <Skull className='w-3 h-3' />{' '}
                              {entry.streaksBroken || 0}
                            </span>
                            <span
                              className='flex items-center gap-1 text-emerald-500'
                              title={t('Total Wins')}
                            >
                              <span className='opacity-50'>W</span>{' '}
                              {entry.totalDerbyWins || 0}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}

                {/* REST OF THE LIST (4+) */}
                {sortedHof.length > 3 && (
                  <div className='mt-4 pt-4 border-t border-border/40 space-y-2'>
                    {sortedHof.slice(3).map((entry, idx) => (
                      <div
                        key={entry.userId}
                        className='flex items-center justify-between px-2 py-1'
                      >
                        <div className='flex items-center gap-3'>
                          <span className='text-[10px] font-bold text-muted-foreground w-4 text-center'>
                            {idx + 4}
                          </span>
                          <span className='text-xs font-semibold text-foreground truncate max-w-[120px]'>
                            {entry.name}
                          </span>
                        </div>
                        <div className='flex items-center gap-3 text-[9px] font-bold text-muted-foreground'>
                          <span
                            className='flex items-center gap-0.5 text-yellow-600/70'
                            title={t('Championships')}
                          >
                            <Trophy className='w-2.5 h-2.5' />{' '}
                            {entry.championships || 0}
                          </span>
                          <span
                            className='flex items-center gap-0.5 text-purple-500/70'
                            title={t('Slayers')}
                          >
                            <Skull className='w-2.5 h-2.5' />{' '}
                            {entry.streaksBroken || 0}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* SPRINT HISTORY */}
        <Card className='border-0 rounded-[1.5rem] glass-panel bg-card shadow-xl shrink-0'>
          <CardHeader className='px-5 pt-5 pb-4 border-b border-border/40 bg-muted/5 shrink-0'>
            <CardTitle className='text-sm font-black flex items-center justify-between tracking-widest uppercase text-foreground'>
              <div className='flex items-center gap-2'>
                <div className='bg-primary/10 p-1.5 rounded-lg text-primary'>
                  <History className='w-4 h-4' />
                </div>
                {t('Sprint History')}
              </div>
              <span className='text-[9px] font-bold bg-background px-2 py-1 rounded-md shadow-sm border border-border/50 text-muted-foreground'>
                {history.length} {t('Sprints')}
              </span>
            </CardTitle>
          </CardHeader>

          <CardContent className='p-5 bg-background/30'>
            {history.length === 0 ? (
              <div className='flex flex-col items-center justify-center text-muted-foreground py-6 gap-2'>
                <History className='w-8 h-8 opacity-20' />
                <p className='text-xs font-light text-center max-w-[200px]'>
                  {t('No sprints have been finished yet.')}
                </p>
              </div>
            ) : (
              <div className='space-y-4'>
                {history.map((s: any, idx: number) => (
                  <div
                    key={idx}
                    className='p-4 rounded-xl bg-background/90 backdrop-blur-sm border border-border shadow-sm relative overflow-hidden group transition-transform hover:-translate-y-0.5'
                  >
                    <div className='absolute -right-4 -top-4 opacity-5 pointer-events-none'>
                      <Trophy className='w-24 h-24' />
                    </div>

                    <div className='flex justify-between items-center mb-3 pb-3 border-b border-border/50'>
                      <Badge
                        variant='secondary'
                        className='rounded bg-primary/10 text-primary border-0 text-[9px] px-2 py-0.5 uppercase tracking-widest font-black'
                      >
                        Sprint #{s.sprintNumber}
                      </Badge>
                      <span className='text-[8px] font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-1 bg-muted px-1.5 py-0.5 rounded'>
                        <Clock className='w-2.5 h-2.5' />
                        {s.period}
                      </span>
                    </div>

                    <div className='flex items-center gap-3 mb-4'>
                      <div className='bg-yellow-500/20 p-2.5 rounded-xl text-yellow-600 shadow-inner'>
                        <Trophy className='w-6 h-6' />
                      </div>
                      <div className='flex-1'>
                        <p className='text-[8px] uppercase font-black tracking-widest text-muted-foreground mb-0.5'>
                          {t('Champion')}
                        </p>
                        <div className='flex items-baseline justify-between w-full'>
                          <p className='text-lg font-black tracking-tight text-foreground truncate max-w-[120px]'>
                            {s.winnerName || t('Unknown')}
                          </p>
                          <span className='text-[10px] font-mono text-primary font-black ml-2'>
                            {s.podium?.[0]?.rating || s.maxRating || ''} ELO
                          </span>
                        </div>
                      </div>
                    </div>

                    {s.podium && (
                      <div className='flex gap-2 mb-4 bg-muted/40 p-2 rounded-lg'>
                        <div className='flex-1 text-[9px] font-bold truncate px-1'>
                          <span className='text-slate-400 mr-1 uppercase tracking-widest text-[8px]'>
                            2nd
                          </span>
                          {s.podium[1]?.name || '—'}
                        </div>
                        <div className='w-px bg-border/50' />
                        <div className='flex-1 text-[9px] font-bold truncate px-1'>
                          <span className='text-amber-600 mr-1 uppercase tracking-widest text-[8px]'>
                            3rd
                          </span>
                          {s.podium[2]?.name || '—'}
                        </div>
                      </div>
                    )}

                    <div className='grid grid-cols-2 gap-2 mt-2 pt-2'>
                      <div className='flex items-center gap-2 bg-purple-500/5 p-1.5 rounded text-purple-700 dark:text-purple-400'>
                        <Skull className='w-3.5 h-3.5 shrink-0' />
                        <div className='flex flex-col min-w-0'>
                          <span className='text-[7px] uppercase tracking-widest font-black opacity-50'>
                            {t('Top Slayer')}
                          </span>
                          <span className='text-[9px] font-bold truncate'>
                            {s.topSlayerName || '—'}{' '}
                            <span className='opacity-60 font-mono'>
                              ({s.topSlayerCount || 0})
                            </span>
                          </span>
                        </div>
                      </div>
                      <div className='flex items-center gap-2 bg-orange-500/5 p-1.5 rounded text-orange-700 dark:text-orange-400'>
                        <Flame className='w-3.5 h-3.5 shrink-0' />
                        <div className='flex flex-col min-w-0'>
                          <span className='text-[7px] uppercase tracking-widest font-black opacity-50'>
                            {t('Top Streak')}
                          </span>
                          <span className='text-[9px] font-bold truncate'>
                            {s.maxStreakPlayerName || '—'}{' '}
                            <span className='opacity-60 font-mono'>
                              ({s.maxStreak || 0})
                            </span>
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* HOW IT WORKS (Collapsed by default or compact) */}
        <Card className='border-0 rounded-[1.5rem] bg-muted/40 shrink-0 mb-4'>
          <CardContent className='p-4 space-y-2 text-[10px] leading-relaxed text-muted-foreground'>
            <div className='font-black flex items-center gap-1.5 text-foreground mb-2 uppercase tracking-widest text-xs'>
              <Info className='w-3.5 h-3.5 text-primary' />
              {t('Derby Rules')}
            </div>
            <p>
              <b className='text-foreground'>{t('Championships')}</b>:{' '}
              {t('Won by having the highest ELO at the end of a Sprint.')}
            </p>
            <p>
              <b className='text-foreground'>{t('Soft Reset')}</b>:{' '}
              {t(
                'At the end of each period, ratings are pulled 25% closer to 1000.',
              )}
            </p>
            <p>
              <b className='text-foreground'>{t('Slayers')}</b>:{' '}
              {t("Ending someone else's 3+ win streak.")}
            </p>
          </CardContent>
        </Card>
      </div>
    </ScrollArea>
  );
}
