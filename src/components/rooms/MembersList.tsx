// src/components/rooms/MembersList.tsx
'use client';

import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
	Avatar,
	AvatarFallback,
	AvatarImage,
	Button,
	ScrollArea,
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from '@/components/ui';
import type { Room } from '@/lib/types';
import type { User } from 'firebase/auth';
import { Flame, ShieldCheck, Skull, Swords, Trash2, Users } from 'lucide-react';
import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

interface MembersListProps {
  members: any[];
  room: Room;
  isCreator: boolean;
  canManage: boolean;
  currentUser: User | null;
  onRemovePlayer: (userId: string) => void;
}

export function MembersList({
  members,
  room,
  isCreator,
  canManage,
  currentUser,
  onRemovePlayer,
}: MembersListProps) {
  const { t } = useTranslation();
  const roomMode = room.mode || 'office';

  const myNemesisId = useMemo(() => {
    if (!Array.isArray(members)) {
      return undefined;
    }
    return members.find((m: any) => m.userId === currentUser?.uid)?.nemesisId;
  }, [members, currentUser]);

  const computed = useMemo(() => {
    const arr = Array.isArray(members) ? members : [];
    const playersOnly = arr.filter((p: any) => p.accountType !== 'coach');

    const base = playersOnly.map((p: any) => {
      const totalMatches = Number.isFinite(p.totalMatches)
        ? Number(p.totalMatches)
        : Number(p.wins ?? 0) + Number(p.losses ?? 0);

      const roomRating = Number(p.rating ?? 1000);
      const totalAddedPoints = roomRating - 1000;

      const winRate =
        totalMatches > 0 ? (Number(p.wins ?? 0) / totalMatches) * 100 : 0;

      return {
        ...p,
        totalMatches,
        roomRating,
        totalAddedPoints,
        winRate,
      };
    });

    const activePlayers = base.filter((p: any) => p.totalMatches > 0);
    const totalMatchesAll = activePlayers.reduce(
      (sum: number, r: any) => sum + r.totalMatches,
      0,
    );
    const avgM =
      activePlayers.length > 0 ? totalMatchesAll / activePlayers.length : 1;

    const adjFactor = (ratio: number) => {
      if (!isFinite(ratio) || ratio <= 0) return 0;
      return Math.sqrt(ratio);
    };

    return base.map((p: any) => ({
      ...p,
      adjPointsLive: p.totalAddedPoints * adjFactor(p.totalMatches / avgM),
    }));
  }, [members]);

  const sortedMembers = useMemo(() => {
    return [...computed].sort((a, b) => {
      const aPlayed = a.totalMatches > 0;
      const bPlayed = b.totalMatches > 0;
      if (aPlayed !== bPlayed) return aPlayed ? -1 : 1;

      if (roomMode === 'professional' || roomMode === 'derby') {
        if (b.roomRating !== a.roomRating) return b.roomRating - a.roomRating;
        if (b.winRate !== a.winRate) return b.winRate - a.winRate;
        return b.wins - a.wins;
      } else if (roomMode === 'arcade') {
        if (b.wins !== a.wins) return b.wins - a.wins;
        if (b.winRate !== a.winRate) return b.winRate - a.winRate;
        return b.totalMatches - a.totalMatches;
      } else {
        if (b.adjPointsLive !== a.adjPointsLive)
          return b.adjPointsLive - a.adjPointsLive;
        if (b.roomRating !== a.roomRating) return b.roomRating - a.roomRating;
        return b.winRate - a.winRate;
      }
    });
  }, [computed, roomMode]);

  const canRemovePlayers = isCreator || canManage;

  return (
    <div className='flex flex-col h-full'>
      <div className='mb-3 flex flex-col justify-between gap-4'>
        <h3 className='font-extrabold text-lg flex items-center gap-2 tracking-tight'>
          <div className='bg-primary/10 p-1.5 rounded-lg'>
            <Users className='text-primary h-4 w-4' />
          </div>
          {t('Members')}{' '}
          <span className='text-muted-foreground font-medium text-sm ml-1'>
            ({sortedMembers.length})
          </span>
        </h3>
      </div>

      <ScrollArea className='h-[400px] w-full rounded-xl border border-border/40 bg-muted/10 shadow-inner p-1 overflow-x-hidden'>
        {sortedMembers.length === 0 ? (
          <div className='flex items-center justify-center h-full text-muted-foreground text-xs font-light'>
            {t('No players yet.')}
          </div>
        ) : (
          <div className='space-y-1 p-1 pr-2'>
            {sortedMembers.map((p, index) => {
              const isMyNemesis = myNemesisId && myNemesisId === p.userId;
              const currentStreak = p.currentStreak ?? 0;
              const isOnFire = currentStreak >= 3;
              const isGiantSlayer = p.badges?.includes('giant_slayer');
              const hasPlayed = p.totalMatches > 0;

              return (
                <div
                  key={p.userId}
                  className='flex items-center justify-between p-2 bg-background hover:bg-muted/50 rounded-lg transition-colors group relative border border-transparent hover:border-border/60 w-full overflow-hidden'
                >
                  <div className='flex items-center gap-2.5 flex-grow min-w-0'>
                    <div
                      className={`w-4 text-right font-mono text-xs font-bold shrink-0 ${
                        index === 0 && hasPlayed
                          ? 'text-yellow-500'
                          : index === 1 && hasPlayed
                            ? 'text-slate-400'
                            : index === 2 && hasPlayed
                              ? 'text-amber-600'
                              : 'text-muted-foreground/40'
                      }`}
                    >
                      {hasPlayed ? index + 1 : '-'}
                    </div>

                    <Avatar
                      className={`h-8 w-8 shrink-0 transition-transform group-hover:scale-105 ${isOnFire ? 'ring-1 ring-orange-500 ring-offset-1 ring-offset-background' : 'ring-1 ring-black/5 dark:ring-white/10'}`}
                    >
                      <AvatarImage src={p.photoURL || undefined} />
                      <AvatarFallback className='bg-primary/10 text-primary text-[10px] font-bold'>
                        {(p.name || '?').substring(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>

                    <div className='min-w-0 flex-1 overflow-hidden'>
                      <div className='font-semibold text-sm leading-tight flex items-center gap-1.5 truncate'>
                        {p.isDeleted ? (
                          <span className='truncate text-muted-foreground italic'>
                            {p.name}
                          </span>
                        ) : (
                          <a
                            href={`/profile/${p.userId}`}
                            className='hover:text-primary transition-colors truncate'
                          >
                            {p.name}
                          </a>
                        )}
                        {p.userId === room.creator && (
                          <TooltipProvider delayDuration={0}>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <ShieldCheck className='h-3 w-3 text-primary flex-shrink-0' />
                              </TooltipTrigger>
                              <TooltipContent className='glass-panel border-0 text-xs'>
                                <span>{t('Room Creator')}</span>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        )}
                      </div>

                      <div className='text-[10px] text-muted-foreground truncate mt-0.5 flex items-center gap-1.5 font-medium'>
                        <span className='text-emerald-500 font-bold'>
                          {p.wins ?? 0}
                        </span>
                        <span className='opacity-40 uppercase tracking-wider text-[8px]'>
                          {t('W')}
                        </span>
                        <span className='opacity-20'>|</span>
                        <span className='text-red-500 font-bold'>
                          {p.losses ?? 0}
                        </span>
                        <span className='opacity-40 uppercase tracking-wider text-[8px]'>
                          {t('L')}
                        </span>
                      </div>

                      {(isMyNemesis || isOnFire || isGiantSlayer) && (
                        <div className='flex items-center flex-wrap gap-1 mt-1'>
                          {isMyNemesis && (
                            <TooltipProvider delayDuration={0}>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <div className='flex items-center gap-0.5 bg-purple-500/10 text-purple-600 dark:text-purple-400 px-1.5 rounded-[4px] text-[8px] font-bold uppercase tracking-widest'>
                                    <Skull className='w-2.5 h-2.5' />
                                    {t('Nemesis')}
                                  </div>
                                </TooltipTrigger>
                                <TooltipContent className='glass-panel border-0 text-xs'>
                                  {t('You struggle against this player')}
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          )}
                          {isOnFire && (
                            <TooltipProvider delayDuration={0}>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <div className='flex items-center gap-0.5 bg-orange-500/10 text-orange-600 dark:text-orange-400 px-1.5 rounded-[4px] text-[8px] font-bold uppercase tracking-widest'>
                                    <Flame className='w-2.5 h-2.5 fill-current animate-pulse' />
                                    {currentStreak}
                                  </div>
                                </TooltipTrigger>
                                <TooltipContent className='glass-panel border-0 text-xs'>
                                  {t('On a winning streak!')}
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          )}
                          {isGiantSlayer && (
                            <TooltipProvider delayDuration={0}>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <div className='flex items-center gap-0.5 bg-blue-500/10 text-blue-600 dark:text-blue-400 px-1.5 rounded-[4px] text-[8px] font-bold uppercase tracking-widest'>
                                    <Swords className='w-2.5 h-2.5' />
                                    {t('Slayer')}
                                  </div>
                                </TooltipTrigger>
                                <TooltipContent className='glass-panel border-0 text-xs'>
                                  {t('Broke a massive win streak')}
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className='flex items-center gap-2 pl-1 shrink-0'>
                    {hasPlayed && (
                      <div className='flex flex-col items-end justify-center min-w-[36px]'>
                        {roomMode === 'professional' ? (
                          <>
                            <span className='font-black text-primary text-sm leading-none'>
                              {Math.round(p.rating ?? 1000)}
                            </span>
                            <span className='text-[8px] uppercase tracking-widest text-muted-foreground/60 font-bold mt-0.5'>
                              {t('elo')}
                            </span>
                          </>
                        ) : roomMode === 'arcade' ? (
                          <>
                            <span className='font-black text-purple-500 text-sm leading-none'>
                              {p.wins ?? 0}
                            </span>
                            <span className='text-[8px] uppercase tracking-widest text-muted-foreground/60 font-bold mt-0.5'>
                              {t('wins')}
                            </span>
                          </>
                        ) : (
                          <>
                            <span className='font-black text-green-600 dark:text-green-400 text-sm leading-none'>
                              {p.adjPointsLive?.toFixed(1) ?? '0.0'}
                            </span>
                            <span className='text-[8px] uppercase tracking-widest text-muted-foreground/60 font-bold mt-0.5'>
                              {t('adj')}
                            </span>
                          </>
                        )}
                      </div>
                    )}

                    {canRemovePlayers && p.userId !== currentUser?.uid && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant='ghost'
                            size='icon'
                            className='h-6 w-6 rounded-full hidden group-hover:flex items-center justify-center bg-destructive/10 text-destructive hover:bg-destructive hover:text-white transition-colors'
                          >
                            <Trash2 className='h-3 w-3' />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent className='glass-panel border-0 sm:rounded-2xl'>
                          <AlertDialogHeader>
                            <AlertDialogTitle className='text-xl'>
                              {t('Are you sure?')}
                            </AlertDialogTitle>
                            <AlertDialogDescription className='text-sm text-muted-foreground'>
                              {t(
                                'This action cannot be undone. This will permanently remove {{playerName}} from the room.',
                                { playerName: p.name },
                              )}
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter className='mt-4 gap-2'>
                            <AlertDialogCancel className='rounded-lg h-10 text-sm'>
                              {t('Cancel')}
                            </AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => onRemovePlayer(p.userId)}
                              className='bg-destructive hover:bg-destructive/90 rounded-lg h-10 text-sm font-bold'
                            >
                              {t('Remove')}
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}