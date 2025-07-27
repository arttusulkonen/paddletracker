// src/components/profile/ProfileSidebar.tsx
'use client';

import type { UserProfile } from '@/lib/types';
import { FriendsList } from './FriendsList';
import { RoomsList } from './RoomsList';

interface ProfileSidebarProps {
  targetProfile: UserProfile;
}

export function ProfileSidebar({ targetProfile }: ProfileSidebarProps) {
  return (
    <div className='space-y-6'>
      <FriendsList targetProfile={targetProfile} />
      <RoomsList targetUid={targetProfile.uid} />
    </div>
  );
}
