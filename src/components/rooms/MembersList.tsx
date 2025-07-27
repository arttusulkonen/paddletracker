// src/components/rooms/MembersList.tsx
'use client';

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  ScrollArea,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui';
import type { Room } from '@/lib/types';
import { ShieldCheck, Users } from 'lucide-react'; // ✅ Заменили Crown на ShieldCheck
import { useTranslation } from 'react-i18next';

interface MembersListProps {
  members: any[];
  room: Room;
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

export function MembersList({ members, room }: MembersListProps) {
  const { t } = useTranslation();

  return (
    <div>
      <h3 className='font-semibold text-lg mb-2 flex items-center gap-2'>
        <Users className='text-primary' />
        {t('Members')} ({members.length})
      </h3>
      <ScrollArea className='border rounded-md p-3 bg-background h-[400px]'>
        {members.map((p) => {
          const rank = getRank(p.globalElo ?? 1000, t);
          return (
            <div
              key={p.userId}
              className='flex items-center justify-between p-2 hover:bg-muted/50 rounded-md transition-colors'
            >
              <div className='flex items-center gap-3'>
                <Avatar className='h-12 w-12'>
                  <AvatarImage src={p.photoURL || undefined} />
                  <AvatarFallback>{p.name.charAt(0)}</AvatarFallback>
                </Avatar>
                <div>
                  <p className='font-medium leading-none flex items-center gap-2'>
                    {p.isDeleted ? (
                      <span>{p.name}</span>
                    ) : (
                      <a
                        href={`/profile/${p.userId}`}
                        className='hover:underline'
                      >
                        {p.name}
                      </a>
                    )}
                    {/* ✅ **ИЗМЕНЕНИЕ**: Заменили иконку и добавили подсказку */}
                    {p.userId === room.creator && (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <ShieldCheck className='h-4 w-4 text-primary' />
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>{t('Room Creator')}</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )}
                  </p>
                  <p className='text-xs text-muted-foreground'>
                    {t('MP')} {p.totalMatches} · {t('W%')} {p.winPct}% ·{' '}
                    {t('ELO')} {p.globalElo?.toFixed(0) ?? '–'}
                  </p>
                  <p className='text-[10px] text-muted-foreground'>
                    {t('Rank')} {rank}
                  </p>
                </div>
              </div>
              <span className='text-sm font-semibold text-primary'>
                {p.rating}&nbsp;{t('pts')}
              </span>
            </div>
          );
        })}
      </ScrollArea>
    </div>
  );
}
