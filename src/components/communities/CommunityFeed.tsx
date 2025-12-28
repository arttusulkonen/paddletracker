// src/components/communities/CommunityFeed.tsx
'use client';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { db } from '@/lib/firebase';
import { FeedItem } from '@/lib/types';
import { formatDistanceToNow } from 'date-fns';
import { enUS, fi, ko, ru } from 'date-fns/locale';
import {
	collection,
	limit,
	onSnapshot,
	orderBy,
	query,
} from 'firebase/firestore';
import { Globe, Trophy, UserPlus, Users, Warehouse, Zap } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

export default function CommunityFeed() {
  const { communityId } = useParams();
  const [items, setItems] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const { t, i18n } = useTranslation();

  useEffect(() => {
    if (!communityId) return;

    const q = query(
      collection(db!, 'communities', communityId as string, 'feed'),
      orderBy('timestamp', 'desc'),
      limit(20)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const newItems = snapshot.docs.map((doc) => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          // Нормализуем метаданные + приводим типы
          meta: data.meta || data.metadata || {},
        } as unknown as FeedItem; // <--- ИСПРАВЛЕНИЕ TS ОШИБКИ
      });
      setItems(newItems);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [communityId]);

  const getDateLocale = () => {
    switch (i18n.language) {
      case 'fi':
        return fi;
      case 'ru':
        return ru;
      case 'ko':
        return ko;
      default:
        return enUS;
    }
  };

  const safeDate = (val: any): Date | null => {
    if (!val) return null;
    if (typeof val.toDate === 'function') return val.toDate();
    if (typeof val === 'object' && 'seconds' in val)
      return new Date(val.seconds * 1000);
    const d = new Date(val);
    return isNaN(d.getTime()) ? null : d;
  };

  const getIcon = (type: string) => {
    switch (type) {
      case 'match_finished':
      case 'match':
        return <Trophy className='h-3 w-3 text-yellow-600' />;
      case 'room_created':
      case 'room':
        return <Globe className='h-3 w-3 text-blue-500' />;
      case 'friend_added':
      case 'friend':
        return <UserPlus className='h-3 w-3 text-green-500' />;
      case 'ghost_claimed':
        return <Zap className='h-3 w-3 text-purple-500' />;
      default:
        return <Users className='h-3 w-3 text-muted-foreground' />;
    }
  };

  const renderEventLine = (item: FeedItem) => {
    const meta = item.metadata || (item as any).meta || {};

    // 1. МАТЧ
    if (item.type === 'match_finished' || item.type === 'match') {
      let p1Name = item.actorName || 'Unknown';
      let p2Name = item.targetName || 'Unknown';

      if (item.title && item.title.includes(' vs ')) {
        const parts = item.title.split(' vs ');
        if (parts.length === 2) {
          p1Name = parts[0];
          p2Name = parts[1];
        }
      }

      let score = meta.scores || '';
      if (!score && item.description && item.description.includes(': ')) {
        score = item.description.split(': ')[1];
      }

      return (
        <span className='inline-flex flex-wrap items-center gap-1'>
          <Link
            href={item.actorId ? `/profile/${item.actorId}` : '#'}
            className='font-semibold hover:underline text-foreground'
          >
            {p1Name}
          </Link>

          <span className='text-muted-foreground text-xs'>vs</span>
					{console.log('item.targetId:', item)}
          <Link
            href={item.targetId ? `/profile/${item.targetId}` : '#'}
            className='font-semibold hover:underline text-foreground'
          >
            {p2Name}
          </Link>

          {score && (
            <Badge variant='secondary' className='h-5 px-1.5 text-[10px] ml-1'>
              {score}
            </Badge>
          )}

          {meta.roomName && meta.roomId && (
            <>
              <span className='text-muted-foreground text-xs ml-1'>
                {t('in')}
              </span>
              <Link
                href={`/rooms/${meta.roomId}`}
                className='text-xs font-medium text-muted-foreground hover:text-primary hover:underline flex items-center gap-1'
              >
                {/* ИСПРАВЛЕНО: Вместо 📍 используем Warehouse или просто убираем иконку */}
                <Warehouse className='h-3 w-3 opacity-70' />
                {meta.roomName}
              </Link>
            </>
          )}
        </span>
      );
    }

    // 2. СОЗДАНИЕ КОМНАТЫ
    if (item.type === 'room_created' || item.type === 'room') {
      return (
        <span className='inline-flex flex-wrap items-center gap-1'>
          <Link
            href={item.actorId ? `/profile/${item.actorId}` : '#'}
            className='font-semibold hover:underline text-foreground'
          >
            {item.actorName || item.title?.split(' ')[0] || 'User'}
          </Link>
          <span>{t('created_room')}</span>
          {meta.roomId && (
            <Link
              href={`/rooms/${meta.roomId}`}
              className='font-medium hover:underline text-blue-600 dark:text-blue-400'
            >
              {item.description
                ?.replace('Room "', '')
                .replace('" is now available.', '') || 'New Room'}
            </Link>
          )}
        </span>
      );
    }

    // 3. ДРУЗЬЯ
    if (item.type === 'friend_added' || item.type === 'friend') {
      const friendName =
        item.targetName || item.description?.split('with ')[1] || 'someone';

      return (
        <span className='inline-flex flex-wrap items-center gap-1'>
          <Link
            href={item.actorId ? `/profile/${item.actorId}` : '#'}
            className='font-semibold hover:underline text-foreground'
          >
            {item.actorName || 'User'}
          </Link>
          <span>{t('added_friend')}</span>
          <Link
            href={item.targetId ? `/profile/${item.targetId}` : '#'}
            className='font-semibold hover:underline text-foreground'
          >
            {friendName}
          </Link>
        </span>
      );
    }

    // 4. CLAIM GHOST
    if (item.type === 'ghost_claimed') {
      return (
        <span className='inline-flex flex-wrap items-center gap-1'>
          <span>{item.description || item.title}</span>
        </span>
      );
    }

    return (
      <span className='text-foreground'>{item.title || item.content}</span>
    );
  };

  if (loading) {
    return (
      <div className='space-y-4 pt-2'>
        {[1, 2, 3].map((i) => (
          <div key={i} className='flex items-center gap-3'>
            <Skeleton className='h-8 w-8 rounded-full' />
            <div className='space-y-1 flex-1'>
              <Skeleton className='h-3 w-3/4' />
              <Skeleton className='h-2 w-1/2' />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className='text-center py-8 text-muted-foreground text-sm'>
        {t('no_activity_yet')}
      </div>
    );
  }

  return (
    <ScrollArea className='h-[500px] pr-2 -mr-2'>
      <div className='flex flex-col pl-4 pr-4'>
        {items.map((item) => {
          const displayName = item.title || item.actorName || 'System';
          const displayInitial = displayName.charAt(0) || '?';
          // @ts-ignore
          const avatarUrl = item.actorAvatars?.[0] || item.actorAvatar;
          const dateObj = safeDate(item.timestamp);

          return (
            <div
              key={item.id}
              className='group flex items-start gap-3 py-3 hover:bg-muted/40 rounded-lg px-2 -mx-2 transition-colors'
            >
              <div className='relative mt-0.5'>
                <Avatar className='h-8 w-8 border border-border/50'>
                  <AvatarImage src={avatarUrl || undefined} />
                  <AvatarFallback className='text-[10px]'>
                    {displayInitial}
                  </AvatarFallback>
                </Avatar>
                <div className='absolute -bottom-1 -right-1 bg-background rounded-full p-0.5 border border-border'>
                  {getIcon(item.type)}
                </div>
              </div>

              <div className='flex-1 min-w-0 flex flex-col justify-center min-h-[32px]'>
                <div className='text-sm leading-snug'>
                  {renderEventLine(item)}
                </div>
                <div className='text-[10px] text-muted-foreground mt-0.5 flex items-center gap-2'>
                  {dateObj
                    ? formatDistanceToNow(dateObj, {
                        addSuffix: true,
                        locale: getDateLocale(),
                      })
                    : ''}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </ScrollArea>
  );
}
