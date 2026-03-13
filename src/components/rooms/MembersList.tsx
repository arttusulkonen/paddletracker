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
import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

interface MembersListProps {
  members: any[];
  room: Room;
  isCreator: boolean;
  canManage: boolean;
  currentUser: User | null;
  onRemovePlayer: (userId: string) => void;
}

type ViewMode = 'regular' | 'liveFinal';

export function MembersList({
  members,
  room,
  isCreator,
  canManage,
  currentUser,
  onRemovePlayer,
}: MembersListProps) {
  const { t } = useTranslation();
  const [viewMode, setViewMode] = useState<ViewMode>('regular');

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
      if (viewMode === 'regular') {
        if (a.ratingVisible !== b.ratingVisible)
          return a.ratingVisible ? -1 : 1;
        if (b.roomRating !== a.roomRating) return b.roomRating - a.roomRating;
        return b.totalMatches - a.totalMatches;
      } else {
        const aZero = a.totalMatches === 0;
        const bZero = b.totalMatches === 0;
        if (aZero !== bZero) return aZero ? 1 : -1;

        if (b.adjPointsLive !== a.adjPointsLive)
          return b.adjPointsLive - a.adjPointsLive;

        if ((b.totalAddedPoints ?? 0) !== (a.totalAddedPoints ?? 0))
          return (b.totalAddedPoints ?? 0) - (a.totalAddedPoints ?? 0);

        if (b.wins !== a.wins) return b.wins - a.wins;
        return b.winRate - a.winRate;
      }
    });
  }, [computed, viewMode]);

  const canRemovePlayers = isCreator || canManage;

  return (
    <div>
      <div className='mb-4 flex items-center justify-between'>
        <h3 className='font-extrabold text-xl flex items-center gap-3 tracking-tight'>
          <div className="bg-primary/10 p-2 rounded-xl">
             <Users className='text-primary h-5 w-5' />
          </div>
          {t('Members')} <span className="text-muted-foreground font-medium text-base ml-1">({sortedMembers.length})</span>
        </h3>

        <div className='flex gap-1.5 bg-muted/30 p-1.5 rounded-2xl ring-1 ring-black/5 dark:ring-white/10 backdrop-blur-xl'>
          <Button
            size='sm'
            variant={viewMode === 'regular' ? 'default' : 'ghost'}
            onClick={() => setViewMode('regular')}
            className='h-8 text-xs rounded-xl font-semibold px-4'
          >
            {t('Regular')}
          </Button>
          <Button
            size='sm'
            variant={viewMode === 'liveFinal' ? 'default' : 'ghost'}
            onClick={() => setViewMode('liveFinal')}
            className={`h-8 text-xs rounded-xl font-semibold px-4 ${
              viewMode === 'liveFinal'
                ? 'bg-green-500/15 text-green-700 dark:text-green-400 hover:bg-green-500/25'
                : ''
            }`}
          >
            <span className='inline-flex items-center gap-1.5'>
              {viewMode === 'liveFinal' && (
                <span className='inline-block h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse' />
              )}
              {t('Live Final')}
            </span>
          </Button>
        </div>
      </div>

      <ScrollArea className='h-[400px] w-full rounded-2xl border-0 ring-1 ring-black/5 dark:ring-white/10 bg-muted/10 shadow-inner p-2'>
        {sortedMembers.length === 0 ? (
          <div className='flex items-center justify-center h-full text-muted-foreground text-sm font-light'>
            {t('No players yet.')}
          </div>
        ) : (
          <div className="space-y-1.5 p-1">
            {sortedMembers.map((p, index) => {
              const isMyNemesis = myNemesisId && myNemesisId === p.userId;
              const currentStreak = p.currentStreak ?? 0;
              const isOnFire = currentStreak >= 3;
              const isGiantSlayer = p.badges?.includes('giant_slayer');

              let rightValueNode;
              if (viewMode === 'regular') {
                rightValueNode = p.ratingVisible ? (
                  <span className='text-primary font-black text-lg'>
                    {Math.round(p.roomRating)}
                  </span>
                ) : (
                  <span className='text-muted-foreground/50'>—</span>
                );
              } else {
                if (p.totalMatches === 0) {
                  rightValueNode = (
                    <span className='text-muted-foreground/50'>—</span>
                  );
                } else {
                  rightValueNode = (
                    <div className='text-right'>
                      <div className='font-black text-green-600 dark:text-green-400 text-lg'>
                        {p.adjPointsLive.toFixed(1)}
                      </div>
                      <div className='text-[9px] uppercase tracking-widest font-bold text-muted-foreground'>
                        {t('adj')}
                      </div>
                    </div>
                  );
                }
              }

              return (
                <div
                  key={p.userId}
                  className='flex items-center justify-between p-3 bg-background hover:bg-background/80 rounded-xl transition-all group relative border border-transparent hover:border-border/50 hover:shadow-sm'
                >
                  <div className='flex items-center gap-4 flex-grow min-w-0'>
                    {viewMode === 'liveFinal' && (
                      <div
                        className={`w-6 text-center font-mono text-sm font-bold ${
                          index === 0 ? 'text-yellow-500' : index === 1 ? 'text-slate-400' : index === 2 ? 'text-amber-600' : 'text-muted-foreground/50'
                        }`}
                      >
                        {index + 1}
                      </div>
                    )}

                    <Avatar
                      className={`h-11 w-11 transition-transform group-hover:scale-105 ${isOnFire ? 'ring-2 ring-orange-500 ring-offset-2 ring-offset-background' : 'ring-1 ring-black/5 dark:ring-white/10'}`}
                    >
                      <AvatarImage src={p.photoURL || undefined} />
                      <AvatarFallback className='bg-primary/10 text-primary font-medium'>
                        {(p.name || '?').substring(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>

                    <div className='min-w-0 flex-1'>
                      <div className='font-semibold text-base leading-none flex items-center gap-2 truncate'>
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
                                <ShieldCheck className='h-4 w-4 text-primary flex-shrink-0' />
                              </TooltipTrigger>
                              <TooltipContent className="glass-panel border-0">
                                <span>{t('Room Creator')}</span>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        )}
                      </div>

                      <div className='text-xs text-muted-foreground truncate mt-2 flex items-center gap-2.5 font-medium'>
                        <span className="flex items-center gap-1">
                          <span className="text-[10px] uppercase tracking-widest opacity-70">{t('W')}</span>
                          <span className='text-emerald-500 font-bold'>
                            {p.wins}
                          </span>
                        </span>
                        <span className='opacity-30'>|</span>
                        <span className="flex items-center gap-1">
                          <span className="text-[10px] uppercase tracking-widest opacity-70">{t('L')}</span>
                          <span className='text-red-500 font-bold'>
                            {p.losses}
                          </span>
                        </span>

                        {viewMode === 'liveFinal' && p.totalMatches > 0 && (
                          <>
                            <span className='opacity-30'>|</span>
                            <span title={t('Net Points (Rating - 1000)')} className="flex items-center gap-1">
                              <span className="text-[10px] uppercase tracking-widest opacity-70">Δ</span>
                              <span className={p.totalAddedPoints > 0 ? "text-emerald-500 font-bold" : p.totalAddedPoints < 0 ? "text-red-500 font-bold" : "font-bold"}>
                                {p.totalAddedPoints > 0 ? '+' : ''}
                                {Math.round(p.totalAddedPoints)}
                              </span>
                            </span>
                          </>
                        )}
                      </div>

                      {(isMyNemesis || isOnFire || isGiantSlayer) && (
                        <div className='flex items-center flex-wrap gap-2 mt-2.5'>
                          {isMyNemesis && (
                            <TooltipProvider delayDuration={0}>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <div className='flex items-center gap-1 bg-purple-500/10 text-purple-600 dark:text-purple-400 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-widest ring-1 ring-purple-500/20'>
                                    <Skull className='w-3 h-3' />
                                    {t('Nemesis')}
                                  </div>
                                </TooltipTrigger>
                                <TooltipContent className="glass-panel border-0">
                                  {t('You struggle against this player')}
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          )}
                          {isOnFire && (
                            <TooltipProvider delayDuration={0}>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <div className='flex items-center gap-1 bg-orange-500/10 text-orange-600 dark:text-orange-400 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-widest ring-1 ring-orange-500/20'>
                                    <Flame className='w-3 h-3 fill-current animate-pulse' />
                                    {currentStreak} {t('Win Streak')}
                                  </div>
                                </TooltipTrigger>
                                <TooltipContent className="glass-panel border-0">
                                  {t('On a winning streak!')}
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          )}
                          {isGiantSlayer && (
                            <TooltipProvider delayDuration={0}>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <div className='flex items-center gap-1 bg-blue-500/10 text-blue-600 dark:text-blue-400 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-widest ring-1 ring-blue-500/20'>
                                    <Swords className='w-3 h-3' />
                                    {t('Giant Slayer')}
                                  </div>
                                </TooltipTrigger>
                                <TooltipContent className="glass-panel border-0">
                                  {t('Broke a massive win streak')}
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className='flex items-center gap-4 pl-3'>
                    <div className='min-w-[60px] text-right flex justify-end'>
                      {rightValueNode}
                    </div>

                    <div className='w-8 h-8 flex-shrink-0 flex items-center justify-center'>
                      {canRemovePlayers && p.userId !== currentUser?.uid && (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant='ghost'
                              size='icon'
                              className='h-8 w-8 rounded-full opacity-0 group-hover:opacity-100 transition-all hover:bg-destructive/10 hover:text-destructive'
                            >
                              <Trash2 className='h-4 w-4' />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent className="glass-panel border-0 sm:rounded-[2rem]">
                            <AlertDialogHeader>
                              <AlertDialogTitle className="text-2xl">
                                {t('Are you sure?')}
                              </AlertDialogTitle>
                              <AlertDialogDescription className="text-base text-muted-foreground">
                                {t(
                                  'This action cannot be undone. This will permanently remove {{playerName}} from the room.',
                                  { playerName: p.name },
                                )}
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter className="mt-6 gap-3 sm:gap-0">
                              <AlertDialogCancel className="rounded-xl h-12 text-base">{t('Cancel')}</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => onRemovePlayer(p.userId)}
                                className='bg-destructive hover:bg-destructive/90 rounded-xl h-12 text-base font-bold'
                              >
                                {t('Remove')}
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      )}
                    </div>
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