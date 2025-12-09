'use client';

import {
	Button,
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from '@/components/ui';
import type { UserProfile } from '@/lib/types';
import { Briefcase, Trophy, Users } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CommunitiesList } from './CommunitiesList';
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

  const isCoach =
    targetProfile.accountType === 'coach' ||
    targetProfile.roles?.includes('coach');

  return (
    <div className='space-y-6'>
      {/* Friends / Players Section */}
      <Card>
        <CardHeader className='pb-3'>
          <CardTitle className='text-lg flex items-center gap-2'>
            {isCoach ? (
              <Briefcase className='h-5 w-5 text-primary' />
            ) : (
              <Users className='h-5 w-5 text-primary' />
            )}
            {isCoach ? t('Managed Players') : t('Friends')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <FriendsList targetProfile={targetProfile} />
          {/* Show View All link logic remains similar or can be adapted */}
          {!isCoach && targetProfile.friends && targetProfile.friends.length > 6 && (
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

      {/* Communities (Only for coaches) */}
      {isCoach && (
         <CommunitiesList targetUid={targetProfile.uid} />
      )}

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