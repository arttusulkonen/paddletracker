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
import {
	TooltipContent as TooltipContentUI,
	TooltipProvider as TooltipProviderUI,
	TooltipTrigger as TooltipTriggerUI,
	Tooltip as TooltipUI,
} from '@/components/ui/tooltip';

import { useAuth } from '@/contexts/AuthContext';
import { sportConfig } from '@/contexts/SportContext';
import { Room } from '@/lib/types';
import {
	Archive,
	CalendarDays,
	CheckCircle2,
	Crown,
	Globe,
	Lock,
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

// --- СПЕЦИАЛЬНЫЙ ПАРСЕР ДЛЯ getFinnishDate ---
const parseFinnishDate = (val: string | number | undefined | null): Date => {
  if (!val) return new Date();

  // 1. Если это уже timestamp (число)
  if (typeof val === 'number') return new Date(val);

  // 2. Если это объект Firestore Timestamp
  if (typeof val === 'object' && 'toDate' in (val as any)) {
    return (val as any).toDate();
  }

  const str = String(val).trim();

  // 3. Формат "DD.MM.YYYY HH.MM.SS" (как в вашей функции)
  // или "DD.MM.YYYY"
  const parts = str.split(' ');
  const datePart = parts[0];
  const timePart = parts[1] || '00.00.00';

  const d = datePart.split('.'); // [DD, MM, YYYY]
  const t = timePart.split('.'); // [HH, MM, SS]

  if (d.length === 3) {
    const day = parseInt(d[0], 10);
    const month = parseInt(d[1], 10) - 1; // Месяцы в JS от 0
    const year = parseInt(d[2], 10);

    const hours = parseInt(t[0] || '0', 10);
    const minutes = parseInt(t[1] || '0', 10);
    const seconds = parseInt(t[2] || '0', 10);

    const result = new Date(year, month, day, hours, minutes, seconds);
    if (!isNaN(result.getTime())) return result;
  }

  // 4. Фолбэк на стандартный ISO
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

  // Используем наш парсер
  const createdDate = parseFinnishDate(room.createdAt || room.roomCreated);

  const getRoomStatus = () => {
    if (room.isArchived) {
      return {
        label: t('Archived'),
        icon: <Archive className='h-3 w-3' />,
        style: 'opacity-70 grayscale',
        badge: 'outline',
        btnText: t('View History'),
        btnVariant: 'secondary',
      };
    }
    if (room.isFinished) {
      return {
        label: t('Season Finished'),
        icon: <CheckCircle2 className='h-3 w-3' />,
        style: 'border-amber-500/30 bg-amber-50/50 dark:bg-amber-950/10',
        badge: 'secondary',
        btnText: t('View Results'),
        btnVariant: 'outline',
      };
    }
    return {
      label: null,
      icon: null,
      style: 'hover:border-primary/50 hover:shadow-lg',
      badge: 'default',
      btnText: isMember ? t('Enter Room') : t('View Details'),
      btnVariant: isMember ? 'default' : 'secondary',
    };
  };

  const status = getRoomStatus();

  const getModeBadge = () => {
    switch (room.mode) {
      case 'professional':
        return {
          label: t('Pro'),
          color:
            'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800',
        };
      case 'arcade':
        return {
          label: t('Arcade'),
          color:
            'bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-900/30 dark:text-purple-300 dark:border-purple-800',
        };
      default:
        return {
          label: t('Club'),
          color:
            'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
        };
    }
  };
  const mode = getModeBadge();

  return (
    <CardUI
      className={`flex flex-col h-full transition-all duration-300 border-t-4 ${status.style} group`}
    >
      <CardHeaderUI className='pb-3 relative'>
        <div className='flex justify-between items-start mb-3'>
          <div className='flex flex-wrap gap-2'>
            <BadgeUI
              variant='outline'
              className={`text-[10px] uppercase font-bold tracking-wider border ${mode.color}`}
            >
              {mode.label}
            </BadgeUI>

            {status.label && (
              <BadgeUI variant='secondary' className='text-[10px] gap-1'>
                {status.icon} {status.label}
              </BadgeUI>
            )}

            {room.communityName && (
              <BadgeUI
                variant='outline'
                className='text-[10px] gap-1 bg-indigo-50 text-indigo-700 border-indigo-100 dark:bg-indigo-950/30 dark:text-indigo-300 dark:border-indigo-900'
              >
                <Warehouse className='h-3 w-3' />
                <span className='truncate max-w-[120px]'>
                  {room.communityName}
                </span>
              </BadgeUI>
            )}
          </div>

          <div className='text-muted-foreground/50 group-hover:text-primary transition-colors'>
            {sportIcon}
          </div>
        </div>

        <CardTitleUI className='text-lg leading-tight line-clamp-1 group-hover:text-primary transition-colors'>
          <Link href={`${hrefBase}/${room.id}`} className='hover:underline'>
            {room.name}
          </Link>
        </CardTitleUI>

        <CardDescriptionUI className='flex items-center gap-1 text-xs'>
          <span>{t('by')}</span>
          <span className='font-medium text-foreground'>
            {room.creatorName || t('Unknown')}
          </span>
          {room.creator === user?.uid && (
            <Crown className='h-3 w-3 text-amber-500' />
          )}
        </CardDescriptionUI>
      </CardHeaderUI>

      <CardContentUI className='flex-grow space-y-4'>
        <div className='grid grid-cols-2 gap-2'>
          <div className='bg-muted/40 p-2 rounded-md flex flex-col items-center justify-center border border-transparent group-hover:border-border transition-colors'>
            <div className='flex items-center gap-1.5 text-muted-foreground text-[10px] uppercase font-bold tracking-wider'>
              <Users className='h-3 w-3' /> {t('Members')}
            </div>
            <span className='text-lg font-bold'>{memberCount}</span>
          </div>
          <div className='bg-muted/40 p-2 rounded-md flex flex-col items-center justify-center border border-transparent group-hover:border-border transition-colors'>
            <div className='flex items-center gap-1.5 text-muted-foreground text-[10px] uppercase font-bold tracking-wider'>
              <CalendarDays className='h-3 w-3' /> {t('Created')}
            </div>
            {/* Using toLocaleDateString ensures localized format like 25.12.2025 */}
            <span className='text-xs font-medium mt-1'>
              {createdDate.toLocaleDateString(undefined, {
                month: 'short',
                year: 'numeric',
                day: 'numeric',
              })}
            </span>
          </div>
        </div>

        {isMember && (
          <div className='pt-3 border-t flex items-center justify-between text-sm'>
            <div className='flex items-center gap-2'>
              <div className='p-1 bg-primary/10 rounded-full text-primary'>
                <Trophy className='h-3 w-3' />
              </div>
              <div className='flex flex-col leading-none'>
                <span className='text-[10px] text-muted-foreground font-bold uppercase'>
                  Rating
                </span>
                <span className='font-bold'>
                  {Math.round(myRating || 1000)}
                </span>
              </div>
            </div>
            <div className='text-right leading-none'>
              <span className='block text-[10px] text-muted-foreground font-bold uppercase'>
                {t('Matches')}
              </span>
              <span className='font-bold'>{myMatches || 0}</span>
            </div>
          </div>
        )}
      </CardContentUI>

      <CardFooterUI className='pt-2 pb-4'>
        <ButtonUI
          asChild
          className='w-full shadow-sm'
          variant={status.btnVariant as any}
        >
          <Link href={`${hrefBase}/${room.id}`}>{status.btnText}</Link>
        </ButtonUI>

        <div className='absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity'>
          {room.isPublic ? (
            <TooltipProviderUI>
              <TooltipUI>
                <TooltipTriggerUI>
                  <Globe className='h-3 w-3 text-muted-foreground' />
                </TooltipTriggerUI>
                <TooltipContentUI side='left'>
                  <p>{t('Public Room')}</p>
                </TooltipContentUI>
              </TooltipUI>
            </TooltipProviderUI>
          ) : (
            <TooltipProviderUI>
              <TooltipUI>
                <TooltipTriggerUI>
                  <Lock className='h-3 w-3 text-muted-foreground' />
                </TooltipTriggerUI>
                <TooltipContentUI side='left'>
                  <p>{t('Private Room')}</p>
                </TooltipContentUI>
              </TooltipUI>
            </TooltipProviderUI>
          )}
        </div>
      </CardFooterUI>
    </CardUI>
  );
};
