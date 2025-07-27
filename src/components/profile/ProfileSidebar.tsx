// src/components/profile/ProfileSidebar.tsx
'use client';

import { Button } from '@/components/ui';
import type { UserProfile } from '@/lib/types';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { FriendsList } from './FriendsList';
import { RoomsList } from './RoomsList';

interface ProfileSidebarProps {
  targetProfile: UserProfile;
}

export function ProfileSidebar({ targetProfile }: ProfileSidebarProps) {
  const { t } = useTranslation();

  return (
    <div className='space-y-6'>
      <div>
        <FriendsList targetProfile={targetProfile} />
        {targetProfile.friends && targetProfile.friends.length > 0 && (
          <Link
            href={`/profile/${targetProfile.uid}/friends`}
            passHref
            className='mt-4 block'
          >
            <Button variant='outline' className='w-full'>
              {t('View All Friends')}
            </Button>
          </Link>
        )}
      </div>

      <div className='space-y-4'>
        <RoomsList targetUid={targetProfile.uid} />
        <Link href={`/profile/${targetProfile.uid}/rooms`} passHref className='mt-4 block'>
          <Button variant='outline' className='w-full'>
            {t('View All Rooms')}
          </Button>
        </Link>
      </div>
    </div>
  );
}
