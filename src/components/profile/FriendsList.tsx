// src/components/profile/FriendsList.tsx
'use client';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui';
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
        const sortedFriends = friendData.sort((a, b) =>
          (a.name || a.displayName || '').localeCompare(
            b.name || b.displayName || ''
          )
        );
        setFriends(sortedFriends);
      } else {
        setFriends([]);
      }
      setLoading(false);
    };
    fetchFriends();
  }, [targetProfile.friends]);

  if (loading) {
    return (
      <div className='grid grid-cols-3 gap-3'>
        {[...Array(3)].map((_, i) => (
          <div key={i} className='flex flex-col items-center space-y-2'>
            <div className='h-10 w-10 bg-muted rounded-full animate-pulse' />
          </div>
        ))}
      </div>
    );
  }

  if (friends.length === 0) {
    return (
      <div className='text-sm text-muted-foreground text-center py-4'>
        {t('No friends added yet.')}
      </div>
    );
  }

  return (
    <div className='grid grid-cols-3 gap-4'>
      {friends.slice(0, PREVIEW_COUNT).map((friend) => (
        <Link
          href={`/profile/${friend.uid}`}
          key={friend.uid}
          className='flex flex-col items-center text-center gap-1 group'
        >
          <Avatar className='h-12 w-12 border-2 border-transparent group-hover:border-primary transition-colors'>
            <AvatarImage src={friend.photoURL ?? undefined} />
            <AvatarFallback>
              {(friend.name || friend.displayName || '?').charAt(0)}
            </AvatarFallback>
          </Avatar>
          <p className='text-[10px] font-medium group-hover:text-primary truncate w-full leading-tight'>
            {friend.name || friend.displayName}
          </p>
        </Link>
      ))}
    </div>
  );
}
