// src/components/profile/ProfileSidebar.tsx
'use client';

import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui';
import type { UserProfile } from '@/lib/types';
import { Trophy, Users } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FriendsList } from './FriendsList';
import { RoomsList } from './RoomsList';

interface ProfileSidebarProps {
  targetProfile: UserProfile;
  canViewProfile: boolean;
}

export function ProfileSidebar({
  targetProfile,
  canViewProfile,
}: ProfileSidebarProps) {
  const { t } = useTranslation();
  const [visibleRoomsCount, setVisibleRoomsCount] = useState<number>(0);

  if (!canViewProfile) return null;

  return (
    <div className='space-y-6'>
      {/* Friends Section */}
      <Card>
        <CardHeader className='pb-3'>
          <CardTitle className='text-lg flex items-center gap-2'>
            <Users className='h-5 w-5 text-primary' />
            {t('Friends')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <FriendsList targetProfile={targetProfile} />
          {targetProfile.friends && targetProfile.friends.length > 6 && (
            <Link
              href={`/profile/${targetProfile.uid}/friends`}
              className='mt-4 block'
            >
              <Button variant='ghost' className='w-full text-xs'>
                {t('View All Friends')}
              </Button>
            </Link>
          )}
        </CardContent>
      </Card>

      {/* Rooms Section */}
      <Card>
        <CardHeader className='pb-3'>
          <CardTitle className='text-lg flex items-center gap-2'>
            <Trophy className='h-5 w-5 text-amber-500' />
            {t('Active Rooms')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <RoomsList
            targetUid={targetProfile.uid}
            onVisibleCountChange={setVisibleRoomsCount}
          />
          {visibleRoomsCount > 0 && (
            <Link
              href={`/profile/${targetProfile.uid}/rooms`}
              className='mt-4 block'
            >
              <Button variant='ghost' className='w-full text-xs'>
                {t('View All Rooms')}
              </Button>
            </Link>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
