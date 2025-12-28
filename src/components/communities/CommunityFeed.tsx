// src/components/communities/CommunityFeed.tsx
'use client';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
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
	query
} from 'firebase/firestore';
import { Globe, Trophy, UserPlus, Users } from 'lucide-react';
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
      const newItems = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as FeedItem[];
      setItems(newItems);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [communityId]);

  const getDateLocale = () => {
    switch (i18n.language) {
      case 'fi': return fi;
      case 'ru': return ru;
      case 'ko': return ko;
      default: return enUS;
    }
  };

  const getIcon = (type: string) => {
    switch (type) {
      case 'match': return <Trophy className="h-4 w-4 text-yellow-500" />;
      case 'room': return <Globe className="h-4 w-4 text-blue-500" />;
      case 'friend': return <UserPlus className="h-4 w-4 text-green-500" />;
      default: return <Users className="h-4 w-4" />;
    }
  };

  const renderContent = (item: FeedItem) => {
    if (item.type === 'match') {
      return (
        <div className="flex flex-col gap-1">
          <span className="font-medium">
            {item.actorName} <span className="text-muted-foreground font-normal">vs</span> {item.targetName}
          </span>
          <div className="text-sm text-muted-foreground">
             {t('winner')}: <span className="font-medium text-foreground">{item.metadata?.winnerName || 'Unknown'}</span>
          </div>
          {item.metadata?.scores && (
            <Badge variant="secondary" className="w-fit mt-1">
              {item.metadata.scores}
            </Badge>
          )}
          {item.metadata?.roomName && (
             <span className="text-xs text-muted-foreground mt-1">
               📍 {item.metadata.roomName}
             </span>
          )}
        </div>
      );
    }

    if (item.type === 'room') {
      return (
        <div className="flex flex-col gap-1">
          <span>
            {t('created_room')}: <span className="font-medium">{item.targetName}</span>
          </span>
          <span className="text-xs text-muted-foreground capitalize">
            {item.sport}
          </span>
        </div>
      );
    }

    if (item.type === 'friend') {
      return (
        <div className="flex flex-col gap-1">
          <span>
            {t('added_friend')} <span className="font-medium">{item.targetName}</span>
          </span>
        </div>
      );
    }

    return <span>{item.content}</span>;
  };

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-24 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="text-center py-10 text-muted-foreground">
        {t('no_activity_yet')}
      </div>
    );
  }

  return (
    <ScrollArea className="h-[600px] pr-4">
      <div className="space-y-4">
        {items.map((item) => (
          <Card key={item.id} className="overflow-hidden">
            <CardContent className="p-4 flex gap-4 items-start">
              <Avatar className="h-10 w-10 border">
                <AvatarImage src={item.actorAvatar || undefined} />
                <AvatarFallback>{item.actorName.charAt(0)}</AvatarFallback>
              </Avatar>
              
              <div className="flex-1 space-y-1">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm">{item.actorName}</span>
                    <span className="text-muted-foreground text-xs">•</span>
                    <span className="text-xs text-muted-foreground">
                      {item.timestamp ? formatDistanceToNow(new Date(item.timestamp), { 
                        addSuffix: true, 
                        locale: getDateLocale() 
                      }) : ''}
                    </span>
                  </div>
                  {getIcon(item.type)}
                </div>
                
                <div className="text-sm">
                  {renderContent(item)}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </ScrollArea>
  );
}