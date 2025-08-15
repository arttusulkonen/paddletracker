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
  isAdmin: boolean;
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

export function MembersList({
  members,
  room,
  isCreator,
  isAdmin,
  currentUser,
  onRemovePlayer,
}: MembersListProps) {
  const { t } = useTranslation();

  const sortedMembers = React.useMemo(() => {
    return [...members].sort((a, b) => {
      if (a.ratingVisible !== b.ratingVisible) {
        return a.ratingVisible ? -1 : 1;
      }
      return (b.rating ?? 0) - (a.rating ?? 0);
    });
  }, [members]);

  const canRemovePlayers = isCreator || isAdmin;

  return (
    <div>
      <h3 className='font-semibold text-lg mb-2 flex items-center gap-2'>
        <Users className='text-primary' />
        {t('Members')} ({members.length})
      </h3>
      <ScrollArea className='border rounded-md p-3 bg-background h-[400px]'>
        {sortedMembers.map((p) => {
          const rank = getRank(p.globalElo ?? 1000, t);
          return (
            <div
              key={p.userId}
              className='flex items-center justify-between p-2 hover:bg-muted/50 rounded-md transition-colors group'
            >
              {/* Column 1: Player Info (takes up available space) */}
              <div className='flex items-center gap-3 flex-grow min-w-0'>
                <Avatar className='h-12 w-12'>
                  <AvatarImage src={p.photoURL || undefined} />
                  <AvatarFallback>{p.name.charAt(0)}</AvatarFallback>
                </Avatar>
                <div className='min-w-0'>
                  <p className='font-medium leading-none flex items-center gap-2 truncate'>
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
                            <p>{t('Room Creator')}</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )}
                  </p>
                  <p className='text-xs text-muted-foreground truncate'>
                    {t('MP')} {p.totalMatches} · {t('W%')} {p.winPct}% ·{' '}
                    {t('ELO')} {p.globalElo?.toFixed(0) ?? '–'}
                  </p>
                  <p className='text-[10px] text-muted-foreground truncate'>
                    {t('Rank')} {rank}
                  </p>
                </div>
              </div>

              {/* Column 2: Points (fixed width, aligned right) */}
              <span className='text-sm font-semibold text-primary text-right w-24 flex-shrink-0'>
                {p.ratingVisible ? `${Math.round(p.rating)} ${t('pts')}` : '—'}
              </span>

              {/* Column 3: Delete Button (fixed width container) */}
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
