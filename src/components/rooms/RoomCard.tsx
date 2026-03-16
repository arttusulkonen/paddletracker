// src/components/rooms/RoomCard.tsx
'use client';

import { Badge as BadgeUI } from '@/components/ui/badge';
import { Button as ButtonUI } from '@/components/ui/button';
import {
	CardContent as CardContentUI,
	CardDescription as CardDescriptionUI,
	CardFooter as CardFooterUI,
	CardHeader as CardHeaderUI,
	CardTitle as CardTitleUI,
	Card as CardUI,
} from '@/components/ui/card';

import { useAuth } from '@/contexts/AuthContext';
import { sportConfig } from '@/contexts/SportContext';
import { Room } from '@/lib/types';
import {
	Archive,
	CalendarDays,
	CheckCircle2,
	Crown,
	Trophy,
	Users,
	Warehouse,
} from 'lucide-react';
import Link from 'next/link';
import React from 'react';
import { useTranslation } from 'react-i18next';

interface RoomCardProps {
  room: Room & {
    id: string;
    createdRaw?: string;
    isFinished?: boolean;
    createdAt?: string;
    creatorName?: string;
    communityName?: string;
  };
  myMatches?: number;
  myRating?: number;
  hrefBase?: string;
}

const parseFinnishDate = (val: string | number | undefined | null): Date => {
  if (!val) return new Date();

  if (typeof val === 'number') return new Date(val);

  if (typeof val === 'object' && 'toDate' in (val as any)) {
    return (val as any).toDate();
  }

  const str = String(val).trim();

  const parts = str.split(' ');
  const datePart = parts[0];
  const timePart = parts[1] || '00.00.00';

  const d = datePart.split('.');
  const t = timePart.split('.');

  if (d.length === 3) {
    const day = parseInt(d[0], 10);
    const month = parseInt(d[1], 10) - 1;
    const year = parseInt(d[2], 10);

    const hours = parseInt(t[0] || '0', 10);
    const minutes = parseInt(t[1] || '0', 10);
    const seconds = parseInt(t[2] || '0', 10);

    const result = new Date(year, month, day, hours, minutes, seconds);
    if (!isNaN(result.getTime())) return result;
  }

  const iso = new Date(str);
  if (!isNaN(iso.getTime())) return iso;

  return new Date();
};

export const RoomCard: React.FC<RoomCardProps> = ({
  room,
  myMatches,
  myRating,
  hrefBase = '/rooms',
}) => {
  const { t } = useTranslation();
  const { user } = useAuth();

  const isMember = room.memberIds?.includes(user?.uid || '');
  const sportIcon = sportConfig[room.sport || 'pingpong'].icon;
  const memberCount = room.memberIds?.length || 0;

  const createdDate = parseFinnishDate(room.createdAt || room.roomCreated);

  const getRoomStatus = () => {
    if (room.isArchived) {
      return {
        label: t('Archived'),
        icon: <Archive className='h-3 w-3' />,
        style: 'bg-muted/40 opacity-70 grayscale border-2 border-dashed border-muted-foreground/30',
        btnText: t('View History'),
        btnVariant: 'secondary',
        isActive: false,
      };
    }
    if (room.isFinished) {
      return {
        label: t('Season Finished'),
        icon: <CheckCircle2 className='h-3 w-3' />,
        style:
          'bg-amber-500/5 dark:bg-amber-900/10 ring-1 ring-amber-500/20 opacity-90',
        btnText: t('View Results'),
        btnVariant: 'outline',
        isActive: false,
      };
    }
    return {
      label: null,
      icon: null,
      style: 'hover:scale-[1.02] hover:shadow-2xl ring-1 ring-black/5 dark:ring-white/10 bg-background/50',
      btnText: isMember ? t('Enter Room') : t('View Details'),
      btnVariant: isMember ? 'default' : 'secondary',
      isActive: true,
    };
  };

  const status = getRoomStatus();

  const getModeBadge = () => {
    switch (room.mode) {
      case 'professional':
        return {
          label: t('Pro'),
          color:
            'bg-amber-500/10 text-amber-700 dark:text-amber-400 ring-1 ring-amber-500/30',
        };
      case 'arcade':
        return {
          label: t('Arcade'),
          color:
            'bg-purple-500/10 text-purple-700 dark:text-purple-400 ring-1 ring-purple-500/30',
        };
      case 'derby':
        return {
          label: t('Derby'),
          color:
            'bg-red-500/10 text-red-700 dark:text-red-400 ring-1 ring-red-500/30',
        };
      default:
        return {
          label: t('Club'),
          color:
            'bg-slate-500/10 text-slate-700 dark:text-slate-300 ring-1 ring-slate-500/30',
        };
    }
  };
  const mode = getModeBadge();

  return (
    <CardUI
      className={`flex flex-col h-full transition-all duration-500 border-0 rounded-[2rem] glass-panel ${status.style} ${status.isActive ? 'group' : ''} overflow-hidden relative`}
    >
      {/* Мягкий градиент на фоне для неактивных комнат, чтобы они выглядели "завершенными" */}
      {!status.isActive && (
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-muted/50 via-transparent to-transparent pointer-events-none" />
      )}
      
      {/* Градиент при ховере для активных комнат */}
      {status.isActive && (
        <div className='absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none' />
      )}

      <CardHeaderUI className='pb-4 relative z-10 px-6 pt-6'>
        <div className='flex justify-between items-start mb-4'>
          <div className='flex flex-wrap gap-2'>
            <BadgeUI
              variant='outline'
              className={`text-[9px] uppercase font-bold tracking-widest border-0 ${!status.isActive ? 'opacity-70 saturate-50' : mode.color} px-2.5 py-0.5 rounded-full`}
            >
              {mode.label}
            </BadgeUI>

            {status.label && (
              <BadgeUI
                variant={room.isArchived ? 'secondary' : 'default'}
                className={`text-[9px] gap-1 px-2.5 py-0.5 rounded-full border-0 shadow-sm uppercase tracking-widest font-bold ${
                  room.isFinished && !room.isArchived ? 'bg-amber-500/20 text-amber-700 dark:text-amber-400 hover:bg-amber-500/30' : 'bg-background/50 backdrop-blur-md'
                }`}
              >
                {status.icon} {status.label}
              </BadgeUI>
            )}

            {room.communityName && (
              <BadgeUI
                variant='outline'
                className={`text-[9px] gap-1 px-2.5 py-0.5 rounded-full border-0 uppercase tracking-widest font-bold ${
                  !status.isActive 
                    ? 'bg-muted text-muted-foreground' 
                    : 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 ring-1 ring-indigo-500/30'
                }`}
              >
                <Warehouse className='h-3 w-3' />
                <span className='truncate max-w-[100px]'>
                  {room.communityName}
                </span>
              </BadgeUI>
            )}
          </div>

          <div className={`transition-colors p-2 rounded-xl backdrop-blur-sm ${
            status.isActive 
              ? 'text-muted-foreground/30 group-hover:text-primary bg-background/50 ring-1 ring-black/5 dark:ring-white/10' 
              : 'text-muted-foreground/20 bg-transparent'
          }`}>
            {sportIcon}
          </div>
        </div>

        <CardTitleUI className={`text-2xl font-extrabold tracking-tight leading-tight line-clamp-1 transition-colors ${
          status.isActive ? 'group-hover:text-primary' : 'text-foreground/80'
        }`}>
          <Link
            href={`${hrefBase}/${room.id}`}
            className='before:absolute before:inset-0'
          >
            {room.name}
          </Link>
        </CardTitleUI>

        <CardDescriptionUI className={`flex items-center gap-1.5 text-xs mt-1.5 ${!status.isActive ? 'opacity-60' : ''}`}>
          <span className='font-light opacity-70'>{t('by')}</span>
          <span className='font-semibold text-foreground/80'>
            {room.creatorName || t('Unknown')}
          </span>
          {room.creator === user?.uid && (
            <Crown className={`h-3.5 w-3.5 ${!status.isActive ? 'text-muted-foreground' : 'text-amber-500'}`} />
          )}
        </CardDescriptionUI>
      </CardHeaderUI>

      <CardContentUI className='flex-grow space-y-5 relative z-10 px-6'>
        <div className='grid grid-cols-2 gap-3'>
          <div className={`p-3 rounded-2xl flex flex-col items-center justify-center transition-colors shadow-sm ${
            status.isActive 
              ? 'bg-background/40 backdrop-blur-md ring-1 ring-black/5 dark:ring-white/5 group-hover:ring-primary/20' 
              : 'bg-muted/30 border border-transparent'
          }`}>
            <div className={`flex items-center gap-1.5 text-[9px] uppercase font-bold tracking-widest ${!status.isActive ? 'text-muted-foreground/70' : 'text-muted-foreground'}`}>
              <Users className='h-3.5 w-3.5' /> {t('Members')}
            </div>
            <span className={`text-2xl font-black mt-1 ${!status.isActive ? 'text-foreground/70' : ''}`}>{memberCount}</span>
          </div>
          <div className={`p-3 rounded-2xl flex flex-col items-center justify-center transition-colors shadow-sm ${
            status.isActive 
              ? 'bg-background/40 backdrop-blur-md ring-1 ring-black/5 dark:ring-white/5 group-hover:ring-primary/20' 
              : 'bg-muted/30 border border-transparent'
          }`}>
            <div className={`flex items-center gap-1.5 text-[9px] uppercase font-bold tracking-widest ${!status.isActive ? 'text-muted-foreground/70' : 'text-muted-foreground'}`}>
              <CalendarDays className='h-3.5 w-3.5' /> {t('Created')}
            </div>
            <span className={`text-sm font-semibold mt-2 ${!status.isActive ? 'text-foreground/70' : ''}`}>
              {createdDate.toLocaleDateString(undefined, {
                month: 'short',
                day: 'numeric',
              })}
            </span>
          </div>
        </div>

        {isMember && (
          <div className={`pt-4 border-t flex items-center justify-between text-sm ${!status.isActive ? 'border-border/20 opacity-70' : 'border-border/40'}`}>
            <div className='flex items-center gap-3'>
              <div className={`p-2 rounded-xl ${
                status.isActive 
                  ? 'bg-primary/10 text-primary ring-1 ring-primary/20' 
                  : 'bg-muted text-muted-foreground'
              }`}>
                <Trophy className='h-4 w-4' />
              </div>
              <div className='flex flex-col leading-none'>
                <span className='text-[9px] text-muted-foreground font-bold uppercase tracking-widest mb-1'>
                  Rating
                </span>
                <span className='font-black text-lg'>
                  {Math.round(myRating || 1000)}
                </span>
              </div>
            </div>
            <div className='text-right leading-none'>
              <span className='block text-[9px] text-muted-foreground font-bold uppercase tracking-widest mb-1'>
                {t('Matches')}
              </span>
              <span className='font-black text-lg'>{myMatches || 0}</span>
            </div>
          </div>
        )}
      </CardContentUI>

      <CardFooterUI className='pt-2 pb-6 px-6 relative z-10'>
        <ButtonUI
          asChild
          className={`w-full rounded-xl h-12 font-bold shadow-md transition-all ${
            status.isActive && status.btnVariant === 'default' 
              ? 'hover:shadow-lg active:scale-[0.98]' 
              : !status.isActive 
                ? 'opacity-80 hover:opacity-100'
                : ''
          }`}
          variant={status.btnVariant as any}
        >
          <Link href={`${hrefBase}/${room.id}`}>{status.btnText}</Link>
        </ButtonUI>
      </CardFooterUI>
    </CardUI>
  );
};