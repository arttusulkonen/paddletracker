'use client';

import {
	Badge,
	Button,
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from '@/components/ui';
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
    createdAt?: string; // В базе данных это строка "25.12.2025..."
    creatorName?: string;
    communityName?: string;
  };
  myMatches?: number;
  myRating?: number;
  hrefBase?: string;
}

// Хелпер для парсинга финского формата дат "DD.MM.YYYY HH.MM.SS"
const parseCustomDate = (dateInput: string | number | undefined | null): Date => {
  if (!dateInput) return new Date();

  // Если это уже число (timestamp)
  if (typeof dateInput === 'number') return new Date(dateInput);

  // Если это Firestore Timestamp (объект)
  if (typeof dateInput === 'object' && 'toDate' in (dateInput as any)) {
    return (dateInput as any).toDate();
  }

  const str = String(dateInput).trim();

  // Проверяем формат "25.12.2025" или "25.12.2025 12.30.45"
  const finnishFormatRegex = /^(\d{1,2})\.(\d{1,2})\.(\d{4})/;
  const match = str.match(finnishFormatRegex);

  if (match) {
    const day = parseInt(match[1], 10);
    const month = parseInt(match[2], 10) - 1; // Месяцы в JS от 0 до 11
    const year = parseInt(match[3], 10);

    let hours = 0;
    let minutes = 0;
    let seconds = 0;

    // Пытаемся найти время
    const timePart = str.split(' ')[1];
    if (timePart) {
      // Заменяем двоеточия на точки, если они есть, и сплитим
      const t = timePart.replace(/:/g, '.').split('.').map(Number);
      if (t.length >= 2) {
        hours = t[0];
        minutes = t[1];
        seconds = t[2] || 0;
      }
    }

    return new Date(year, month, day, hours, minutes, seconds);
  }

  // Если формат другой, пробуем стандартный парсер
  const standardDate = new Date(str);
  if (!isNaN(standardDate.getTime())) {
    return standardDate;
  }

  return new Date(); // Fallback
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
  
  // Используем memberIds, так как он надежнее
  const memberCount = room.memberIds?.length || 0;

  // Парсим дату создания
  const createdDate = parseCustomDate(room.createdAt || room.roomCreated);

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
        return { label: t('Pro'), color: 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800' };
      case 'arcade':
        return { label: t('Arcade'), color: 'bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-900/30 dark:text-purple-300 dark:border-purple-800' };
      default:
        return { label: t('Club'), color: 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700' };
    }
  };
  const mode = getModeBadge();

  return (
    <Card className={`flex flex-col h-full transition-all duration-300 border-t-4 ${status.style} group`}>
      <CardHeader className="pb-3 relative">
        <div className="flex justify-between items-start mb-3">
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline" className={`text-[10px] uppercase font-bold tracking-wider border ${mode.color}`}>
              {mode.label}
            </Badge>

            {status.label && (
              <Badge variant="secondary" className="text-[10px] gap-1">
                {status.icon} {status.label}
              </Badge>
            )}

            {room.communityName && (
               <Badge variant="outline" className="text-[10px] gap-1 bg-indigo-50 text-indigo-700 border-indigo-100 dark:bg-indigo-950/30 dark:text-indigo-300 dark:border-indigo-900">
                  <Warehouse className="h-3 w-3" />
                  <span className="truncate max-w-[120px]">{room.communityName}</span>
               </Badge>
            )}
          </div>

          <div className="text-muted-foreground/50 group-hover:text-primary transition-colors">
            {sportIcon}
          </div>
        </div>

        <CardTitle className="text-lg leading-tight line-clamp-1 group-hover:text-primary transition-colors">
          <Link href={`${hrefBase}/${room.id}`} className="hover:underline">
            {room.name}
          </Link>
        </CardTitle>
        
        <CardDescription className="flex items-center gap-1 text-xs">
          <span>{t('by')}</span>
          <span className="font-medium text-foreground">{room.creatorName || t('Unknown')}</span>
          {room.creator === user?.uid && <Crown className="h-3 w-3 text-amber-500" />}
        </CardDescription>
      </CardHeader>

      <CardContent className="flex-grow space-y-4">
        <div className="grid grid-cols-2 gap-2">
           <div className="bg-muted/40 p-2 rounded-md flex flex-col items-center justify-center border border-transparent group-hover:border-border transition-colors">
              <div className="flex items-center gap-1.5 text-muted-foreground text-[10px] uppercase font-bold tracking-wider">
                 <Users className="h-3 w-3" /> {t('Members')}
              </div>
              <span className="text-lg font-bold">{memberCount}</span>
           </div>
           <div className="bg-muted/40 p-2 rounded-md flex flex-col items-center justify-center border border-transparent group-hover:border-border transition-colors">
              <div className="flex items-center gap-1.5 text-muted-foreground text-[10px] uppercase font-bold tracking-wider">
                 <CalendarDays className="h-3 w-3" /> {t('Created')}
              </div>
              <span className="text-xs font-medium mt-1">
                {createdDate.toLocaleDateString(undefined, {
                   month: 'short', year: '2-digit', day: 'numeric'
                })}
              </span>
           </div>
        </div>

        {isMember && (
           <div className="pt-3 border-t flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                 <div className="p-1 bg-primary/10 rounded-full text-primary">
                    <Trophy className="h-3 w-3" />
                 </div>
                 <div className="flex flex-col leading-none">
                    <span className="text-[10px] text-muted-foreground font-bold uppercase">Rating</span>
                    <span className="font-bold">{Math.round(myRating || 1000)}</span>
                 </div>
              </div>
              <div className="text-right leading-none">
                 <span className="block text-[10px] text-muted-foreground font-bold uppercase">{t('Matches')}</span>
                 <span className="font-bold">{myMatches || 0}</span>
              </div>
           </div>
        )}
      </CardContent>

      <CardFooter className="pt-2 pb-4">
        <Button asChild className="w-full shadow-sm" variant={status.btnVariant as any}>
          <Link href={`${hrefBase}/${room.id}`}>
             {status.btnText}
          </Link>
        </Button>
        
        <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
           {room.isPublic ? (
              <TooltipProvider>
                 <Tooltip>
                    <TooltipTrigger><Globe className="h-3 w-3 text-muted-foreground" /></TooltipTrigger>
                    <TooltipContent side="left"><p>{t('Public Room')}</p></TooltipContent>
                 </Tooltip>
              </TooltipProvider>
           ) : (
              <TooltipProvider>
                 <Tooltip>
                    <TooltipTrigger><Lock className="h-3 w-3 text-muted-foreground" /></TooltipTrigger>
                    <TooltipContent side="left"><p>{t('Private Room')}</p></TooltipContent>
                 </Tooltip>
              </TooltipProvider>
           )}
        </div>
      </CardFooter>
    </Card>
  );
};