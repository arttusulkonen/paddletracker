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
import { ShieldCheck, Trash2, Users } from 'lucide-react';
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

  const computed = useMemo(() => {
    // FIX: Removed filtering of room.creator. Everyone in the list plays.
    const arr = Array.isArray(members) ? members : [];

    const base = arr.map((p: any) => {
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
      0
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
      <div className='mb-2 flex items-center justify-between'>
        <h3 className='font-semibold text-lg flex items-center gap-2'>
          <Users className='text-primary' />
          {t('Members')} ({sortedMembers.length})
        </h3>

        <div className='flex gap-2 bg-muted/30 p-1 rounded-lg'>
          <Button
            size='sm'
            variant={viewMode === 'regular' ? 'default' : 'ghost'}
            onClick={() => setViewMode('regular')}
            className='h-7 text-xs'
          >
            {t('Regular')}
          </Button>
          <Button
            size='sm'
            variant={viewMode === 'liveFinal' ? 'default' : 'ghost'}
            onClick={() => setViewMode('liveFinal')}
            className={`h-7 text-xs ${
              viewMode === 'liveFinal'
                ? 'bg-green-100 text-green-700 hover:bg-green-200 hover:text-green-800'
                : ''
            }`}
          >
            <span className='inline-flex items-center gap-1'>
              {viewMode === 'liveFinal' && (
                <span className='inline-block h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse' />
              )}
              {t('Live Final')}
            </span>
          </Button>
        </div>
      </div>

      <ScrollArea className='border rounded-md p-3 bg-background h-[400px] shadow-inner'>
        {sortedMembers.length === 0 ? (
          <div className='flex items-center justify-center h-full text-muted-foreground text-sm'>
            {t('No players yet.')}
          </div>
        ) : (
          sortedMembers.map((p, index) => {
            let rightValueNode;
            if (viewMode === 'regular') {
              rightValueNode = p.ratingVisible ? (
                <span className='text-primary font-bold'>
                  {Math.round(p.roomRating)}
                </span>
              ) : (
                <span className='text-muted-foreground'>—</span>
              );
            } else {
              if (p.totalMatches === 0) {
                rightValueNode = (
                  <span className='text-muted-foreground'>—</span>
                );
              } else {
                rightValueNode = (
                  <div className='text-right'>
                    <div className='font-bold text-green-700 text-sm'>
                      {p.adjPointsLive.toFixed(1)}
                    </div>
                    <div className='text-[10px] text-muted-foreground'>
                      {t('adj')}
                    </div>
                  </div>
                );
              }
            }

            return (
              <div
                key={p.userId}
                className='flex items-center justify-between p-2 hover:bg-muted/50 rounded-md transition-colors group relative'
              >
                <div className='flex items-center gap-3 flex-grow min-w-0'>
                  {viewMode === 'liveFinal' && (
                    <div
                      className={`w-5 text-center font-mono text-xs font-bold ${
                        index < 3 ? 'text-amber-500' : 'text-muted-foreground'
                      }`}
                    >
                      {index + 1}
                    </div>
                  )}

                  <Avatar className='h-10 w-10 border border-border'>
                    <AvatarImage src={p.photoURL || undefined} />
                    <AvatarFallback className='bg-primary/10 text-primary text-xs'>
                      {(p.name || '?').substring(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>

                  <div className='min-w-0 flex-1'>
                    <div className='font-medium text-sm leading-none flex items-center gap-1.5 truncate'>
                      {p.isDeleted ? (
                        <span className='truncate text-muted-foreground italic'>
                          {p.name}
                        </span>
                      ) : (
                        <a
                          href={`/profile/${p.userId}`}
                          className='hover:underline truncate hover:text-primary transition-colors'
                        >
                          {p.name}
                        </a>
                      )}
                      {/* Show visual indicator for creator, but keep them in list */}
                      {p.userId === room.creator && (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <ShieldCheck className='h-3.5 w-3.5 text-primary flex-shrink-0' />
                            </TooltipTrigger>
                            <TooltipContent>
                              <span>{t('Room Creator')}</span>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                    </div>

                    <div className='text-xs text-muted-foreground truncate mt-1 flex items-center gap-2'>
                      <span>
                        {t('W')}:{' '}
                        <span className='text-green-600 font-medium'>
                          {p.wins}
                        </span>
                      </span>
                      <span className='opacity-50'>/</span>
                      <span>
                        {t('L')}:{' '}
                        <span className='text-red-600 font-medium'>
                          {p.losses}
                        </span>
                      </span>

                      {viewMode === 'liveFinal' && p.totalMatches > 0 && (
                        <>
                          <span className='opacity-50'>·</span>
                          <span title={t('Net Points (Rating - 1000)')}>
                            Δ {p.totalAddedPoints > 0 ? '+' : ''}
                            {Math.round(p.totalAddedPoints)}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <div className='flex items-center gap-3 pl-2'>
                  <div className='min-w-[60px] text-right flex justify-end'>
                    {rightValueNode}
                  </div>

                  <div className='w-7 h-7 flex-shrink-0 flex items-center justify-center'>
                    {canRemovePlayers && p.userId !== currentUser?.uid && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant='ghost'
                            size='icon'
                            className='h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-destructive/10 hover:text-destructive'
                          >
                            <Trash2 className='h-4 w-4' />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>
                              {t('Are you sure?')}
                            </AlertDialogTitle>
                            <AlertDialogDescription>
                              {t(
                                'This action cannot be undone. This will permanently remove {{playerName}} from the room.',
                                { playerName: p.name }
                              )}
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>{t('Cancel')}</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => onRemovePlayer(p.userId)}
                              className='bg-destructive hover:bg-destructive/90'
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
          })
        )}
      </ScrollArea>
    </div>
  );
}
