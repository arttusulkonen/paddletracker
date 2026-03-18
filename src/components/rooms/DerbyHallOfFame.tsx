'use client';

import {
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
import { Room } from '@/lib/types';
import { Crown, Flame, History, Medal, Skull, Trophy } from 'lucide-react';
import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

export function DerbyHallOfFame({ room }: { room: Room }) {
  const { t } = useTranslation();

  const history = useMemo(() => (room as any).sprintHistory || [], [room]);
  const sortedHof = useMemo(() => {
    if (!room.hallOfFame) return [];
    // Сортировка: Сначала по титулам, потом по общему количеству побед
    return [...room.hallOfFame].sort(
      (a, b) =>
        (b.championships || 0) - (a.championships || 0) ||
        (b.totalDerbyWins || 0) - (a.totalDerbyWins || 0),
    );
  }, [room]);

  return (
    <div className='space-y-8 mt-8'>
      {/* 1. All-Time Legends Table */}
      <Card className='border-0 rounded-[2rem] glass-panel shadow-xl overflow-hidden'>
        <CardHeader className='px-8 pt-8 pb-6 border-b border-black/5 dark:border-white/5 bg-background/20'>
          <CardTitle className='text-2xl font-extrabold flex items-center gap-3'>
            <div className='bg-yellow-500/10 p-2.5 rounded-xl text-yellow-600'>
              <Crown className='w-6 h-6' />
            </div>
            {t('All-Time Legends')}
          </CardTitle>
        </CardHeader>
        <CardContent className='p-0'>
          <Table>
            <TableHeader className='bg-muted/30'>
              <TableRow className='border-0'>
                <TableHead className='pl-8'>{t('Player')}</TableHead>
                <TableHead className='text-center'>{t('Titles')}</TableHead>
                <TableHead className='text-center'>{t('Slayers')}</TableHead>
                <TableHead className='text-center'>{t('Total Wins')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedHof.map((entry, idx) => (
                <TableRow
                  key={idx}
                  className='border-b-black/5 dark:border-b-white/5'
                >
                  <TableCell className='pl-8 py-4'>
                    <div className='flex items-center gap-3'>
                      <span className='font-mono text-xs opacity-30 w-4'>
                        {idx + 1}
                      </span>
                      <span className='font-bold text-lg'>{entry.name}</span>
                      {idx === 0 && entry.championships > 0 && (
                        <Medal className='w-4 h-4 text-yellow-500' />
                      )}
                    </div>
                  </TableCell>
                  <TableCell className='text-center'>
                    <div className='inline-flex items-center gap-1 bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 px-3 py-1 rounded-full font-black'>
                      <Trophy className='w-3 h-3' /> {entry.championships || 0}
                    </div>
                  </TableCell>
                  <TableCell className='text-center font-bold text-purple-500'>
                    {entry.streaksBroken || 0}
                  </TableCell>
                  <TableCell className='text-center font-medium opacity-70'>
                    {entry.totalDerbyWins || 0}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* 2. Sprint History (Хронология) */}
      <div className='grid grid-cols-1 md:grid-cols-2 gap-6'>
        <div className='space-y-4'>
          <h3 className='text-xl font-bold flex items-center gap-2 px-2'>
            <History className='w-5 h-5 text-primary' />
            {t('Sprint History')}
          </h3>
          <ScrollArea className='h-[400px] pr-4'>
            <div className='space-y-3'>
              {[...history].reverse().map((s: any, idx: number) => (
                <div
                  key={idx}
                  className='p-5 rounded-3xl glass-panel border-0 ring-1 ring-black/5 dark:ring-white/10 shadow-sm relative overflow-hidden group'
                >
                  <div className='flex justify-between items-start mb-3'>
                    <Badge
                      variant='outline'
                      className='rounded-lg bg-background/50 border-0 ring-1 ring-black/5'
                    >
                      Sprint #{s.sprintNumber}
                    </Badge>
                    <span className='text-[10px] font-bold text-muted-foreground uppercase'>
                      {s.period}
                    </span>
                  </div>

                  <div className='flex flex-col gap-2 mb-4'>
                    <div className='flex items-center gap-3 mb-4'>
                      <div className='bg-yellow-500/10 p-2 rounded-lg text-yellow-600'>
                        <Trophy className='w-5 h-5' />
                      </div>
                      <div>
                        <p className='text-[10px] uppercase font-bold text-muted-foreground leading-none mb-1'>
                          {t('Champion')}
                        </p>
                        <div className='flex items-baseline gap-2'>
                          <p className='text-lg font-black tracking-tight'>
                            {s.winnerName}
                          </p>
                          {/* Добавляем рейтинг, с которым игрок закончил сезон */}
                          <span className='text-xs font-mono text-primary bg-primary/5 px-1.5 rounded'>
                            {s.podium?.[0]?.rating || s.maxRating || ''} ELO
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Добавляем отображение 2 и 3 места в историю */}
                    {s.podium && (
                      <div className='flex gap-4 ml-11 mt-1 opacity-70'>
                        <div className='text-xs font-medium'>
                          <span className='text-slate-400 mr-1'>2nd:</span>{' '}
                          {s.podium[1]?.name || '—'}
                        </div>
                        <div className='text-xs font-medium'>
                          <span className='text-orange-400 mr-1'>3rd:</span>{' '}
                          {s.podium[2]?.name || '—'}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className='grid grid-cols-2 gap-2 mt-4 pt-4 border-t border-black/5 dark:border-white/5'>
                    <div className='flex items-center gap-2'>
                      <Skull className='w-3.5 h-3.5 text-purple-500' />
                      <span className='text-xs font-medium'>
                        <b className='text-foreground'>{s.topSlayerName}</b> (
                        {s.topSlayerCount})
                      </span>
                    </div>
                    <div className='flex items-center gap-2'>
                      <Flame className='w-3.5 h-3.5 text-orange-500' />
                      <span className='text-xs font-medium'>
                        <b className='text-foreground'>
                          {s.maxStreakPlayerName}
                        </b>{' '}
                        ({s.maxStreak})
                      </span>
                    </div>
                  </div>
                </div>
              ))}
              {history.length === 0 && (
                <p className='text-center py-10 text-muted-foreground italic text-sm'>
                  {t('No history yet')}
                </p>
              )}
            </div>
          </ScrollArea>
        </div>

        {/* 3. Описание правил (Knowledge) */}
        <div className='space-y-4'>
          <h3 className='text-xl font-bold flex items-center gap-2 px-2 text-muted-foreground'>
            <Trophy className='w-5 h-5' />
            {t('How it works')}
          </h3>
          <Card className='border-0 rounded-[2rem] bg-primary/5 ring-1 ring-primary/10'>
            <CardContent className='p-8 space-y-4 text-sm leading-relaxed text-muted-foreground'>
              <p>
                • <b>{t('Championships')}</b>:{' '}
                {t(
                  'The most important metric. Won by having the highest ELO at the end of a Sprint.',
                )}
              </p>
              <p>
                • <b>{t('Soft Reset')}</b>:{' '}
                {t(
                  'At the end of each period, ratings are pulled 25% closer to 1000. This prevents runaway leaders and keeps the league competitive.',
                )}
              </p>
              <p>
                • <b>{t('Slayers')}</b>:{' '}
                {t(
                  "Number of times a player ended someone else's 3+ win streak.",
                )}
              </p>
              <p>
                • <b>{t('Persistent Data')}</b>:{' '}
                {t(
                  'While ELO and streaks reset every sprint, your Hall of Fame records stay forever.',
                )}
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
