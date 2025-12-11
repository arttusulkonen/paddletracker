// src/components/rooms/RoomCard.tsx
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
} from '@/components/ui';
import { Room } from '@/lib/types';
import { safeFormatDate } from '@/lib/utils/date';
import { Archive, CheckCircle2, Globe, Lock, Play } from 'lucide-react';
import Link from 'next/link';
import React from 'react';
import { useTranslation } from 'react-i18next';

interface RoomCardProps {
  room: Room & {
    id: string;
    createdRaw?: string;
    isFinished?: boolean;
    createdAt?: string;
  };
  myMatches?: number;
  myRating?: number;
  hrefBase?: string;
}

const getRoomStatus = (room: Room & { isFinished?: boolean }) => {
  const { t } = useTranslation();

  if (room.isArchived) {
    return {
      label: t('Archived'),
      icon: <Archive className='h-4 w-4' />,
      cardClass: 'opacity-60 bg-muted/50 border-dashed',
      badgeVariant: 'outline',
      buttonText: t('View History'),
      buttonVariant: 'secondary',
    };
  }
  if (room.isFinished) {
    return {
      label: t('Season Finished'),
      icon: <CheckCircle2 className='h-4 w-4 text-amber-600' />,
      cardClass: 'border-amber-500/50 bg-amber-50 dark:bg-amber-900/10',
      badgeVariant: 'secondary',
      buttonText: t('View Results'),
      buttonVariant: 'default',
    };
  }
  return {
    label: t('Active'),
    icon: <Play className='h-4 w-4 text-green-600' />,
    cardClass: 'border-green-500/50 bg-green-50 dark:bg-green-900/10',
    badgeVariant: 'default',
    buttonText: t('Enter Room'),
    buttonVariant: 'default',
  };
};

export const RoomCard: React.FC<RoomCardProps> = ({
  room,
  myMatches,
  myRating,
  hrefBase = '/rooms',
}) => {
  const { t } = useTranslation();
  const status = getRoomStatus(room);

  const normalizeDateStr = (str: string) =>
    str.includes(' ') ? str : `${str} 00.00.00`;

  return (
    <Card
      className={`flex flex-col h-full transition-shadow hover:shadow-xl ${status.cardClass}`}
    >
      <CardHeader>
        <div className='flex justify-between items-start gap-2'>
          <CardTitle className='truncate'>{room.name}</CardTitle>
          <div className='flex flex-col items-end gap-2 shrink-0'>
            <Badge
              variant={status.badgeVariant as any}
              className='flex items-center gap-1'
            >
              {status.icon} {status.label}
            </Badge>
            <Badge
              variant={room.isPublic ? 'outline' : 'secondary'}
              className='flex items-center gap-1'
            >
              {room.isPublic ? (
                <Globe className='h-3 w-3' />
              ) : (
                <Lock className='h-3 w-3' />
              )}
              {room.isPublic ? t('Public') : t('Private')}
            </Badge>
          </div>
        </div>
        <CardDescription>
          {t('Created by:')} {room.creatorName}
        </CardDescription>
        <CardDescription>
          {t('Created:')}{' '}
          {(room as any).createdAt
            ? safeFormatDate((room as any).createdAt as string, 'dd.MM.yyyy')
            : room.createdRaw
            ? safeFormatDate(normalizeDateStr(room.createdRaw), 'dd.MM.yyyy')
            : (room as any).roomCreated}
        </CardDescription>
      </CardHeader>
      <CardContent className='flex-grow'>
        <p className='text-sm text-muted-foreground'>
          {t('Members', { context: 'cardLabel' })}: {room.members.length}
        </p>
        {myMatches !== undefined && (
          <p className='text-sm text-muted-foreground'>
            {t('Matches played:')} {myMatches ?? '–'}
          </p>
        )}
        {myRating !== undefined && (
          <p className='text-sm text-muted-foreground'>
            {t('Your rating:')} {myRating ?? '–'}
          </p>
        )}
      </CardContent>
      <CardFooter>
        <Button
          asChild
          className='w-full'
          variant={status.buttonVariant as any}
        >
          <Link href={`${hrefBase}/${room.id}`}>{status.buttonText}</Link>
        </Button>
      </CardFooter>
    </Card>
  );
};
