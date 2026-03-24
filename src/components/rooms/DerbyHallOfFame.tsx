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
    return [...room.hallOfFame].sort(
      (a, b) =>
        (b.championships || 0) - (a.championships || 0) ||
        (b.totalDerbyWins || 0) - (a.totalDerbyWins || 0),
    );
  }, [room]);

  return (
    <div className='space-y-6 mt-6'>
      <Card className='border-0 rounded-2xl glass-panel shadow-sm overflow-hidden'>
        <CardHeader className='px-6 pt-6 pb-4 border-b border-black/5 dark:border-white/5 bg-background/20'>
          <CardTitle className='text-lg font-extrabold flex items-center gap-2'>
            <div className='bg-yellow-500/10 p-1.5 rounded-lg text-yellow-600'>
              <Crown className='w-4 h-4' />
            </div>
            {t('All-Time Legends')}
          </CardTitle>
        </CardHeader>
        <CardContent className='p-0'>
          <Table>
            <TableHeader className='bg-muted/30'>
              <TableRow className='border-0'>
                <TableHead className='pl-6 py-2 h-auto text-[10px] uppercase tracking-widest font-bold text-muted-foreground'>{t('Player')}</TableHead>
                <TableHead className='text-center py-2 h-auto text-[10px] uppercase tracking-widest font-bold text-muted-foreground'>{t('Titles')}</TableHead>
                <TableHead className='text-center py-2 h-auto text-[10px] uppercase tracking-widest font-bold text-muted-foreground'>{t('Slayers')}</TableHead>
                <TableHead className='text-center py-2 h-auto text-[10px] uppercase tracking-widest font-bold text-muted-foreground'>{t('Total Wins')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedHof.map((entry, idx) => (
                <TableRow
                  key={idx}
                  className='border-b-black/5 dark:border-b-white/5 hover:bg-muted/30 transition-colors'
                >
                  <TableCell className='pl-6 py-2'>
                    <div className='flex items-center gap-2'>
                      <span className='font-mono text-[10px] text-muted-foreground w-3'>
                        {idx + 1}
                      </span>
                      <span className='font-bold text-sm'>{entry.name}</span>
                      {idx === 0 && entry.championships > 0 && (
                        <Medal className='w-3 h-3 text-yellow-500' />
                      )}
                    </div>
                  </TableCell>
                  <TableCell className='text-center py-2'>
                    <div className='inline-flex items-center gap-1 bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 px-2 py-0.5 rounded text-xs font-black'>
                      <Trophy className='w-2.5 h-2.5' /> {entry.championships || 0}
                    </div>
                  </TableCell>
                  <TableCell className='text-center py-2 font-bold text-xs text-purple-500'>
                    {entry.streaksBroken || 0}
                  </TableCell>
                  <TableCell className='text-center py-2 font-medium text-xs text-muted-foreground'>
                    {entry.totalDerbyWins || 0}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className='grid grid-cols-1 md:grid-cols-2 gap-6'>
        <div className='space-y-3'>
          <h3 className='text-sm font-bold flex items-center gap-1.5 px-2'>
            <History className='w-4 h-4 text-primary' />
            {t('Sprint History')}
          </h3>
          <ScrollArea className='h-[350px] pr-3'>
            <div className='space-y-2'>
              {[...history].reverse().map((s: any, idx: number) => (
                <div
                  key={idx}
                  className='p-4 rounded-2xl glass-panel border-0 ring-1 ring-black/5 dark:ring-white/10 shadow-sm relative overflow-hidden group'
                >
                  <div className='flex justify-between items-start mb-2'>
                    <Badge
                      variant='outline'
                      className='rounded bg-background/50 border-0 ring-1 ring-black/5 text-[9px] px-1.5 py-0 uppercase tracking-widest font-bold'
                    >
                      Sprint #{s.sprintNumber}
                    </Badge>
                    <span className='text-[8px] font-bold text-muted-foreground uppercase'>
                      {s.period}
                    </span>
                  </div>

                  <div className='flex flex-col gap-1.5 mb-3'>
                    <div className='flex items-center gap-2 mb-2'>
                      <div className='bg-yellow-500/10 p-1.5 rounded-lg text-yellow-600'>
                        <Trophy className='w-4 h-4' />
                      </div>
                      <div>
                        <p className='text-[8px] uppercase font-bold text-muted-foreground leading-none mb-0.5'>
                          {t('Champion')}
                        </p>
                        <div className='flex items-baseline gap-1.5'>
                          <p className='text-sm font-black tracking-tight'>
                            {s.winnerName}
                          </p>
                          <span className='text-[10px] font-mono text-primary bg-primary/5 px-1 rounded font-bold'>
                            {s.podium?.[0]?.rating || s.maxRating || ''} ELO
                          </span>
                        </div>
                      </div>
                    </div>

                    {s.podium && (
                      <div className='flex gap-3 ml-9 mt-0.5 opacity-70'>
                        <div className='text-[10px] font-medium'>
                          <span className='text-slate-400 mr-1'>2nd:</span>
                          {s.podium[1]?.name || '—'}
                        </div>
                        <div className='text-[10px] font-medium'>
                          <span className='text-orange-400 mr-1'>3rd:</span>
                          {s.podium[2]?.name || '—'}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className='grid grid-cols-2 gap-2 mt-3 pt-3 border-t border-black/5 dark:border-white/5'>
                    <div className='flex items-center gap-1.5'>
                      <Skull className='w-3 h-3 text-purple-500' />
                      <span className='text-[10px] font-medium'>
                        <b className='text-foreground'>{s.topSlayerName}</b> ({s.topSlayerCount})
                      </span>
                    </div>
                    <div className='flex items-center gap-1.5'>
                      <Flame className='w-3 h-3 text-orange-500' />
                      <span className='text-[10px] font-medium'>
                        <b className='text-foreground'>{s.maxStreakPlayerName}</b> ({s.maxStreak})
                      </span>
                    </div>
                  </div>
                </div>
              ))}
              {history.length === 0 && (
                <p className='text-center py-10 text-muted-foreground italic text-xs'>
                  {t('No history yet')}
                </p>
              )}
            </div>
          </ScrollArea>
        </div>

        <div className='space-y-3'>
          <h3 className='text-sm font-bold flex items-center gap-1.5 px-2 text-muted-foreground'>
            <Trophy className='w-4 h-4' />
            {t('How it works')}
          </h3>
          <Card className='border-0 rounded-2xl bg-primary/5 ring-1 ring-primary/10'>
            <CardContent className='p-6 space-y-3 text-xs leading-relaxed text-muted-foreground'>
              <p>
                <b className='text-foreground'>{t('Championships')}</b>:{' '}
                {t('The most important metric. Won by having the highest ELO at the end of a Sprint.')}
              </p>
              <p>
                <b className='text-foreground'>{t('Soft Reset')}</b>:{' '}
                {t('At the end of each period, ratings are pulled 25% closer to 1000. This prevents runaway leaders and keeps the league competitive.')}
              </p>
              <p>
                <b className='text-foreground'>{t('Slayers')}</b>:{' '}
                {t("Number of times a player ended someone else's 3+ win streak.")}
              </p>
              <p>
                <b className='text-foreground'>{t('Persistent Data')}</b>:{' '}
                {t('While ELO and streaks reset every sprint, your Hall of Fame records stay forever.')}
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}