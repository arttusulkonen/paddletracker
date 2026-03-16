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
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '@/components/ui';
import { Room } from '@/lib/types';
import { Crown, Flame, Skull, Swords, Trophy } from 'lucide-react';
import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

interface DerbyHallOfFameProps {
  room: Room;
}

export function DerbyHallOfFame({ room }: DerbyHallOfFameProps) {
  const { t } = useTranslation();

  const sortedHof = useMemo(() => {
    if (!room || !room.hallOfFame) return [];
    return [...room.hallOfFame].sort((a, b) => {
      if ((b.championships || 0) !== (a.championships || 0)) {
        return (b.championships || 0) - (a.championships || 0);
      }
      return (b.totalDerbyWins || 0) - (a.totalDerbyWins || 0);
    });
  }, [room]);

  if (!room || room.mode !== 'derby') return null;

  if (sortedHof.length === 0) {
    return (
      <Card className='border-0 rounded-[2rem] glass-panel shadow-md bg-muted/5 ring-1 ring-black/5 dark:ring-white/5'>
        <CardContent className='p-10 text-center text-muted-foreground'>
          <Trophy className='w-12 h-12 mx-auto mb-4 opacity-20' />
          <p className='text-base font-semibold max-w-sm mx-auto'>
            {t(
              'The Hall of Fame is empty. Complete the first sprint to immortalize the champions!',
            )}
          </p>
        </CardContent>
      </Card>
    );
  }

  const maxChampionships = Math.max(
    ...sortedHof.map((h) => h.championships || 0),
  );
  const maxStreaksBroken = Math.max(
    ...sortedHof.map((h) => h.streaksBroken || 0),
  );
  const maxStreakEver = Math.max(...sortedHof.map((h) => h.maxStreakEver || 0));
  const maxWins = Math.max(...sortedHof.map((h) => h.totalDerbyWins || 0));

  return (
    <Card className='border-0 rounded-[2rem] glass-panel shadow-xl overflow-hidden mt-8'>
      <div className='absolute inset-0 bg-gradient-to-br from-yellow-500/5 via-transparent to-transparent pointer-events-none' />
      <CardHeader className='px-8 pt-8 pb-6 relative z-10 border-b border-black/5 dark:border-white/5 bg-background/20'>
        <CardTitle className='text-2xl font-extrabold tracking-tight flex items-center gap-3'>
          <div className='bg-yellow-500/10 p-2.5 rounded-xl ring-1 ring-yellow-500/20 text-yellow-600 dark:text-yellow-500 shadow-sm'>
            <Crown className='w-6 h-6' />
          </div>
          {t('Hall of Fame')}
        </CardTitle>
      </CardHeader>
      <CardContent className='p-0 relative z-10'>
        <ScrollArea className='w-full'>
          <Table>
            <TableHeader className='bg-muted/30'>
              <TableRow className='border-b-black/5 dark:border-b-white/5 hover:bg-transparent'>
                <TableHead className='px-6 py-4 text-[10px] uppercase font-bold tracking-widest text-muted-foreground'>
                  {t('Legend')}
                </TableHead>
                <TableHead className='px-6 py-4 text-center text-[10px] uppercase font-bold tracking-widest text-muted-foreground'>
                  <div className='flex flex-col items-center gap-1'>
                    <Trophy className='w-4 h-4 text-yellow-500' />
                    <span>{t('Titles')}</span>
                  </div>
                </TableHead>
                <TableHead className='px-6 py-4 text-center text-[10px] uppercase font-bold tracking-widest text-muted-foreground'>
                  <div className='flex flex-col items-center gap-1'>
                    <Skull className='w-4 h-4 text-purple-500' />
                    <span>{t('Slayers')}</span>
                  </div>
                </TableHead>
                <TableHead className='px-6 py-4 text-center text-[10px] uppercase font-bold tracking-widest text-muted-foreground'>
                  <div className='flex flex-col items-center gap-1'>
                    <Flame className='w-4 h-4 text-orange-500' />
                    <span>{t('Max Streak')}</span>
                  </div>
                </TableHead>
                <TableHead className='px-6 py-4 text-center text-[10px] uppercase font-bold tracking-widest text-muted-foreground'>
                  <div className='flex flex-col items-center gap-1'>
                    <Swords className='w-4 h-4 text-primary' />
                    <span>{t('Wins')}</span>
                  </div>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedHof.map((entry, index) => {
                const memberData = room.members?.find(
                  (m) => m.userId === entry.userId,
                );
                const isTopChamps =
                  (entry.championships || 0) === maxChampionships &&
                  maxChampionships > 0;
                const isTopSlayer =
                  (entry.streaksBroken || 0) === maxStreaksBroken &&
                  maxStreaksBroken > 0;
                const isTopStreak =
                  (entry.maxStreakEver || 0) === maxStreakEver &&
                  maxStreakEver > 0;
                const isTopWins =
                  (entry.totalDerbyWins || 0) === maxWins && maxWins > 0;

                return (
                  <TableRow
                    key={entry.userId}
                    className='group border-b-black/5 dark:border-b-white/5 hover:bg-muted/20 transition-colors'
                  >
                    <TableCell className='px-6 py-4'>
                      <div className='flex items-center gap-4'>
                        <span className='font-mono text-sm font-bold text-muted-foreground/50 w-4'>
                          {index + 1}
                        </span>
                        <Avatar className='h-10 w-10 ring-1 ring-black/5 dark:ring-white/10 shadow-sm group-hover:scale-105 transition-transform'>
                          <AvatarImage
                            src={memberData?.photoURL || undefined}
                          />
                          <AvatarFallback className='bg-primary/10 text-primary font-bold'>
                            {(entry.name || '?').substring(0, 2).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <span className='font-bold text-base tracking-tight'>
                          {entry.name}
                        </span>
                      </div>
                    </TableCell>

                    <TableCell className='px-6 py-4 text-center'>
                      <div
                        className={`inline-flex items-center justify-center min-w-[3rem] px-2 py-1 rounded-xl text-lg font-black ${isTopChamps ? 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-500 ring-1 ring-yellow-500/30 shadow-sm' : 'text-foreground'}`}
                      >
                        {entry.championships || 0}
                      </div>
                    </TableCell>

                    <TableCell className='px-6 py-4 text-center'>
                      <div
                        className={`inline-flex items-center justify-center min-w-[3rem] px-2 py-1 rounded-xl text-lg font-black ${isTopSlayer ? 'bg-purple-500/10 text-purple-600 dark:text-purple-400 ring-1 ring-purple-500/30 shadow-sm' : 'text-foreground'}`}
                      >
                        {entry.streaksBroken || 0}
                      </div>
                    </TableCell>

                    <TableCell className='px-6 py-4 text-center'>
                      <div
                        className={`inline-flex items-center justify-center min-w-[3rem] px-2 py-1 rounded-xl text-lg font-black ${isTopStreak ? 'bg-orange-500/10 text-orange-600 dark:text-orange-400 ring-1 ring-orange-500/30 shadow-sm' : 'text-foreground'}`}
                      >
                        {entry.maxStreakEver || 0}
                      </div>
                    </TableCell>

                    <TableCell className='px-6 py-4 text-center'>
                      <div
                        className={`inline-flex items-center justify-center min-w-[3rem] px-2 py-1 rounded-xl text-lg font-black ${isTopWins ? 'bg-primary/10 text-primary ring-1 ring-primary/30 shadow-sm' : 'text-foreground'}`}
                      >
                        {entry.totalDerbyWins || 0}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
