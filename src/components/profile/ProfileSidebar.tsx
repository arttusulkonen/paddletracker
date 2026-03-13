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
    <div className='space-y-8'>
      
      <Card className="border-0 rounded-[2rem] glass-panel shadow-lg overflow-hidden">
        <CardHeader className='pb-4 px-6 pt-6 border-b border-black/5 dark:border-white/5 bg-muted/20'>
          <CardTitle className='text-lg font-extrabold tracking-tight flex items-center gap-3'>
            <div className="bg-primary/10 p-2 rounded-xl text-primary">
              {isCoach ? (
                <Briefcase className='h-5 w-5' />
              ) : (
                <Users className='h-5 w-5' />
              )}
            </div>
            {isCoach ? t('Managed Players') : t('Friends')}
          </CardTitle>
        </CardHeader>
        <CardContent className="px-6 pt-6 pb-6">
          <FriendsList targetProfile={targetProfile} />
          {!isCoach &&
            targetProfile.friends &&
            targetProfile.friends.length > 6 && (
              <Link
                href={`/profile/${targetProfile.uid}/friends`}
                className='mt-6 block'
              >
                <Button variant='outline' className='w-full h-11 rounded-xl text-xs font-bold uppercase tracking-widest bg-background/50 border-0 ring-1 ring-black/5 dark:ring-white/10 shadow-sm hover:bg-background/80 transition-all'>
                  {t('View All Friends')}
                </Button>
              </Link>
            )}
        </CardContent>
      </Card>

      <CommunitiesList targetUid={targetProfile.uid} />

      <Card className="border-0 rounded-[2rem] glass-panel shadow-lg overflow-hidden">
        <CardHeader className='pb-4 px-6 pt-6 border-b border-black/5 dark:border-white/5 bg-amber-500/5'>
          <CardTitle className='text-lg font-extrabold tracking-tight flex items-center gap-3'>
            <div className="bg-amber-500/10 p-2 rounded-xl text-amber-500">
               <Trophy className='h-5 w-5' />
            </div>
            {t('Active Rooms')}
          </CardTitle>
        </CardHeader>
        <CardContent className="px-6 pt-6 pb-6">
          <RoomsList
            targetUid={targetProfile.uid}
            onVisibleCountChange={setVisibleRoomsCount}
          />
          {visibleRoomsCount > 0 && (
            <Link
              href={`/profile/${targetProfile.uid}/rooms`}
              className='mt-6 block'
            >
              <Button variant='outline' className='w-full h-11 rounded-xl text-xs font-bold uppercase tracking-widest bg-background/50 border-0 ring-1 ring-black/5 dark:ring-white/10 shadow-sm hover:bg-background/80 transition-all'>
                {t('View All Rooms')}
              </Button>
            </Link>
          )}
        </CardContent>
      </Card>
    </div>
  );
}