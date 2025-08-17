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
import { ShieldCheck, Trash2, Users } from 'lucide-react';
import React from 'react';
import { useTranslation } from 'react-i18next';

interface MembersListProps {
  members: any[];
  room: Room;
  isCreator: boolean;
  canManage: boolean;
  currentUser: User | null;
  onRemovePlayer: (userId: string) => void;
}

function getRank(elo: number, t: (key: string) => string) {
  if (elo < 1001) return t('Ping-Pong Padawan');
  if (elo < 1100) return t('Table-Tennis Trainee');
  if (elo < 1200) return t('Racket Rookie');
  if (elo < 1400) return t('Paddle Prodigy');
  if (elo < 1800) return t('Spin Sensei');
  if (elo < 2000) return t('Smash Samurai');
  return t('Ping-Pong Paladin');
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

  const [viewMode, setViewMode] = React.useState<ViewMode>('regular');

  const computed = React.useMemo(() => {
    const arr = Array.isArray(members) ? members : [];

    const matchesArr = arr.map((p: any) =>
      Number.isFinite(p.totalMatches)
        ? Number(p.totalMatches)
        : Number(p.wins ?? 0) + Number(p.losses ?? 0)
    );
    const avgM =
      matchesArr.reduce((s, v) => s + (v || 0), 0) / (matchesArr.length || 1) ||
      0.000001;

    const adj = (p: any) => {
      const totalMatches = Number.isFinite(p.totalMatches)
        ? Number(p.totalMatches)
        : Number(p.wins ?? 0) + Number(p.losses ?? 0);
      const deltaRoom = Number(p.deltaRoom ?? Number(p.rating ?? 1000) - 1000);
      const ratio = totalMatches / avgM;
      const factor = !isFinite(ratio) || ratio <= 0 ? 0 : Math.sqrt(ratio);
      return deltaRoom * factor;
    };

    return arr.map((p: any) => ({
      ...p,
      totalMatches: Number.isFinite(p.totalMatches)
        ? Number(p.totalMatches)
        : Number(p.wins ?? 0) + Number(p.losses ?? 0),
      deltaRoom: Number(p.deltaRoom ?? Number(p.rating ?? 1000) - 1000),
      adjPointsLive: adj(p),
    }));
  }, [members]);

  const sortedMembers = React.useMemo(() => {
    if (viewMode === 'regular') {
      return [...computed].sort((a, b) => {
        if (a.ratingVisible !== b.ratingVisible)
          return a.ratingVisible ? -1 : 1;
        return (b.rating ?? 0) - (a.rating ?? 0);
      });
    }
    return [...computed].sort(
      (a, b) => (b.adjPointsLive ?? 0) - (a.adjPointsLive ?? 0)
    );
  }, [computed, viewMode]);

  const canRemovePlayers = isCreator || canManage;

  return (
    <div>
      <div className='mb-2 flex items-center justify-between'>
        <h3 className='font-semibold text-lg flex items-center gap-2'>
          <Users className='text-primary' />
          {t('Members')} ({members.length})
        </h3>

        <div className='flex gap-2'>
          <Button
            size='sm'
            variant={viewMode === 'regular' ? 'default' : 'outline'}
            onClick={() => setViewMode('regular')}
          >
            {t('Regular')}
          </Button>
          <Button
            size='sm'
            variant={viewMode === 'liveFinal' ? 'default' : 'outline'}
            onClick={() => setViewMode('liveFinal')}
            className={
              viewMode === 'liveFinal'
                ? 'bg-green-100 text-green-700 hover:bg-green-100'
                : ''
            }
          >
            <span className='inline-flex items-center gap-1'>
              <span className='inline-block h-2 w-2 rounded-full bg-green-500 animate-pulse' />
              {t('Live Final')}
            </span>
          </Button>
        </div>
      </div>

      <ScrollArea className='border rounded-md p-3 bg-background h-[400px]'>
        {sortedMembers.map((p) => {
          const rank = getRank(p.globalElo ?? 1000, t);

          const rightValue =
            viewMode === 'regular'
              ? p.ratingVisible && typeof p.rating === 'number'
                ? `${Math.round(p.rating)} ${t('pts')}`
                : '—'
              : `${(p.adjPointsLive ?? 0).toFixed(2)} ${t('adj')}`;
          return (
            <div
              key={p.userId}
              className='flex items-center justify-between p-2 hover:bg-muted/50 rounded-md transition-colors group'
            >
              <div className='flex items-center gap-3 flex-grow min-w-0'>
                <Avatar className='h-12 w-12'>
                  <AvatarImage src={p.photoURL || undefined} />
                  <AvatarFallback>{(p.name || '?').charAt(0)}</AvatarFallback>
                </Avatar>
                <div className='min-w-0'>
                  <div className='font-medium leading-none flex items-center gap-2 truncate'>
                    {p.isDeleted ? (
                      <span className='truncate'>{p.name}</span>
                    ) : (
                      <a
                        href={`/profile/${p.userId}`}
                        className='hover:underline truncate'
                      >
                        {p.name}
                      </a>
                    )}
                    {p.userId === room.creator && (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <ShieldCheck className='h-4 w-4 text-primary flex-shrink-0' />
                          </TooltipTrigger>
                          <TooltipContent>
                            <span>{t('Room Creator')}</span>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )}
                    {viewMode === 'liveFinal' && (
                      <span className='ml-1 text-[10px] font-semibold text-green-700 bg-green-100 px-1.5 py-0.5 rounded'>
                        LIVE
                      </span>
                    )}
                  </div>

                  <p className='text-xs text-muted-foreground truncate'>
                    {t('MP')} {p.totalMatches ?? 0} · {t('W%')} {p.winPct}% ·{' '}
                    {t('ELO')} {p.globalElo?.toFixed(0) ?? '–'}
                    {viewMode === 'liveFinal' && (
                      <>
                        {' '}
                        · Δ{' '}
                        {Number(p.deltaRoom ?? 0) >= 0
                          ? `+${Math.round(p.deltaRoom)}`
                          : Math.round(p.deltaRoom)}
                      </>
                    )}
                  </p>

                  <p className='text-[10px] text-muted-foreground truncate'>
                    {t('Rank')} {rank}
                  </p>
                </div>
              </div>

              <span
                className={`text-sm font-semibold text-right w-28 flex-shrink-0 ${
                  viewMode === 'liveFinal' ? 'text-green-700' : 'text-primary'
                }`}
                title={
                  viewMode === 'liveFinal'
                    ? t(
                        'Adjusted Pts = RoomΔ × √(Games / AvgGames). Live preview of season-final metric.'
                      )
                    : t('Room Rating within this room (starts at 1000).')
                }
              >
                {rightValue}
              </span>

              <div className='w-7 h-7 ml-2 flex-shrink-0'>
                {canRemovePlayers && p.userId !== currentUser?.uid && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant='ghost'
                        size='icon'
                        className='h-7 w-7 opacity-0 group-hover:opacity-100'
                      >
                        <Trash2 className='h-4 w-4 text-destructive' />
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
          );
        })}
      </ScrollArea>
    </div>
  );
}
