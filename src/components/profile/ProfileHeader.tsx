// src/components/profile/ProfileHeader.tsx
'use client';

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  Button,
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
  Dialog,
  DialogTrigger,
} from '@/components/ui';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import * as Friends from '@/lib/friends';
import { UserProfile } from '@/lib/types';
import { Settings } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ProfileSettingsDialog } from './ProfileSettingsDialog';

interface ProfileHeaderProps {
  targetProfile: UserProfile;
  friendStatus: 'none' | 'outgoing' | 'incoming' | 'friends';
  handleFriendAction: (action: 'add' | 'cancel' | 'accept' | 'remove') => void;
  isSelf: boolean;
  rank: string;
  medalSrc?: string;
  onUpdate: () => void;
}

export function ProfileHeader({
  targetProfile,
  friendStatus,
  handleFriendAction,
  isSelf,
  rank,
  medalSrc,
  onUpdate,
}: ProfileHeaderProps) {
  const { t } = useTranslation();
  const { userProfile } = useAuth();
  const displayName =
    targetProfile.displayName ?? targetProfile.name ?? t('Unknown Player');

  return (
    <Card>
      <CardHeader className='flex flex-col md:flex-row md:justify-between items-center gap-6'>
        <div className='flex items-center gap-6'>
          <Avatar className='h-32 w-32'>
            <AvatarImage src={targetProfile.photoURL ?? undefined} />
            <AvatarFallback className='text-4xl'>
              {displayName.charAt(0)}
            </AvatarFallback>
          </Avatar>
          <div className='text-left space-y-1'>
            <div className='flex items-center gap-3'>
              <CardTitle className='text-4xl'>{displayName}</CardTitle>
              {isSelf && (
                <Dialog>
                  <DialogTrigger asChild>
                    <Button variant='outline' size='icon'>
                      <Settings className='h-5 w-5' />
                    </Button>
                  </DialogTrigger>
                  <ProfileSettingsDialog
                    profile={targetProfile}
                    onUpdate={onUpdate}
                  />
                </Dialog>
              )}
            </div>
            {isSelf && <CardDescription>{targetProfile.email}</CardDescription>}
            {targetProfile.bio && (
              <p className='text-sm text-muted-foreground pt-1 max-w-lg'>
                {targetProfile.bio}
              </p>
            )}
            <div className='inline-flex items-center gap-2 rounded-md bg-muted py-1 px-2 text-sm'>
              <span className='font-medium'>{rank}</span>
            </div>
            {!isSelf && (
              <div className='pt-2 flex gap-2'>
                {friendStatus === 'none' && (
                  <Button onClick={() => handleFriendAction('add')}>
                    {t('Add Friend')}
                  </Button>
                )}
                {friendStatus === 'outgoing' && (
                  <Button onClick={() => handleFriendAction('cancel')}>
                    {t('Cancel Request')}
                  </Button>
                )}
                {friendStatus === 'incoming' && (
                  <Button onClick={() => handleFriendAction('accept')}>
                    {t('Accept Request')}
                  </Button>
                )}
                {friendStatus === 'friends' && (
                  <Button
                    variant='destructive'
                    onClick={() => handleFriendAction('remove')}
                  >
                    {t('Remove Friend')}
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>
        {medalSrc && (
          <img
            src={medalSrc}
            alt={rank}
            className='h-[140px] w-[140px] rounded-md'
          />
        )}
      </CardHeader>
    </Card>
  );
}
