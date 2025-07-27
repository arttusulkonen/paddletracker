// src/components/profile/FriendsList.tsx
'use client';

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui';
import { useAuth } from '@/contexts/AuthContext';
import * as Friends from '@/lib/friends';
import type { UserProfile } from '@/lib/types';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

interface FriendsListProps {
  targetProfile: UserProfile;
}

const PREVIEW_COUNT = 6;

export function FriendsList({ targetProfile }: FriendsListProps) {
  const { t } = useTranslation();
  const [friends, setFriends] = useState<(UserProfile & { uid: string })[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchFriends = async () => {
      setLoading(true);
      if (targetProfile.friends && targetProfile.friends.length > 0) {
        const friendData = await Friends.getMultipleUsersLite(
          targetProfile.friends
        );
        setFriends(friendData.sort((a, b) => a.name.localeCompare(b.name)));
      } else {
        setFriends([]);
      }
      setLoading(false);
    };
    fetchFriends();
  }, [targetProfile.friends]);

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <div className='h-6 w-24 bg-muted rounded animate-pulse' />
        </CardHeader>
        <CardContent className='grid grid-cols-3 gap-4'>
          {[...Array(3)].map((_, i) => (
            <div key={i} className='flex flex-col items-center space-y-2'>
              <div className='h-12 w-12 bg-muted rounded-full animate-pulse' />
              <div className='h-4 w-16 bg-muted rounded animate-pulse' />
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  if (friends.length === 0) {
    return null; 
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {t('Friends')} ({friends.length})
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className='grid grid-cols-3 gap-x-2 gap-y-4'>
          {friends.slice(0, PREVIEW_COUNT).map((friend) => (
            <Link
              href={`/profile/${friend.uid}`}
              key={friend.uid}
              className='flex flex-col items-center text-center gap-2 group'
            >
              <Avatar className='h-14 w-14'>
                <AvatarImage src={friend.photoURL ?? undefined} />
                <AvatarFallback>{friend.name.charAt(0)}</AvatarFallback>
              </Avatar>
              <p className='text-xs font-medium group-hover:underline truncate w-full'>
                {friend.name}
              </p>
            </Link>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
