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
      <CardHeader className='flex flex-col md:flex-row md:justify-between items-center gap-6 p-4 sm:p-6'>
        <div className='flex flex-col sm:flex-row items-center gap-4 sm:gap-6 w-full'>
          <Avatar className='h-24 w-24 sm:h-28 sm:w-28 md:h-32 md:w-32 border-4 border-background'>
            <AvatarImage src={targetProfile.photoURL ?? undefined} />
            <AvatarFallback className='text-3xl md:text-4xl'>
              {displayName.charAt(0)}
            </AvatarFallback>
          </Avatar>

          <div className='flex-grow text-center sm:text-left space-y-2'>
            <div className='flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 justify-center sm:justify-start'>
              <CardTitle className='text-2xl sm:text-3xl md:text-4xl'>
                {displayName}
              </CardTitle>
              {isSelf && (
                <Dialog>
                  <DialogTrigger asChild>
                    <Button
                      variant='outline'
                      size='icon'
                      className='mx-auto sm:mx-0'
                    >
                      <Settings className='h-4 w-4 sm:h-5 sm:w-5' />
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
              <p className='text-sm text-muted-foreground pt-1 max-w-lg mx-auto sm:mx-0'>
                {targetProfile.bio}
              </p>
            )}

            <div className='inline-flex items-center gap-2 rounded-md bg-muted py-1 px-2 text-sm'>
              <span className='font-medium'>{rank}</span>
            </div>

            {!isSelf && (
              <div className='pt-2 flex flex-col sm:flex-row gap-2 w-full max-w-xs mx-auto sm:mx-0'>
                {friendStatus === 'none' && (
                  <Button
                    className='w-full'
                    onClick={() => handleFriendAction('add')}
                  >
                    {t('Add Friend')}
                  </Button>
                )}
                {friendStatus === 'outgoing' && (
                  <Button
                    className='w-full'
                    onClick={() => handleFriendAction('cancel')}
                  >
                    {t('Cancel Request')}
                  </Button>
                )}
                {friendStatus === 'incoming' && (
                  <Button
                    className='w-full'
                    onClick={() => handleFriendAction('accept')}
                  >
                    {t('Accept Request')}
                  </Button>
                )}
                {friendStatus === 'friends' && (
                  <Button
                    className='w-full'
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
          <div className='flex-shrink-0'>
            <img
              src={medalSrc}
              alt={rank}
              className='h-28 w-28 md:h-[140px] md:w-[140px] rounded-md'
            />
          </div>
        )}
      </CardHeader>
    </Card>
  );
}
