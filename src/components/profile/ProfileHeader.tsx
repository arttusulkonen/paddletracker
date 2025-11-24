// src/components/profile/ProfileHeader.tsx
'use client';

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  Button,
  Card,
  CardContent,
  Dialog,
  DialogTrigger,
  Progress,
} from '@/components/ui';
import { useAuth } from '@/contexts/AuthContext';
import type { UserProfile } from '@/lib/types';
import { Check, Settings, UserMinus, UserPlus, X } from 'lucide-react';
import Image from 'next/image';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ProfileSettingsDialog } from './ProfileSettingsDialog';

interface ProfileHeaderProps {
  targetProfile: UserProfile;
  friendStatus: 'none' | 'outgoing' | 'incoming' | 'friends';
  handleFriendAction: (action: 'add' | 'cancel' | 'accept' | 'remove') => void;
  isSelf: boolean;
  rank: string | null;
  medalSrc: string | null;
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
  const displayName =
    targetProfile.displayName ?? targetProfile.name ?? t('Unknown Player');

  // Simple Progress Logic (can be refined with real rank thresholds)
  const elo = targetProfile.sports?.pingpong?.globalElo ?? 1000;
  const progress = elo % 100; // Примерная логика

  return (
    <Card className='overflow-hidden border-none shadow-lg'>
      {/* Cover Image / Gradient */}
      <div className='h-32 relative'>
        <div className='absolute inset-0 bg-black/10' />
      </div>

      <CardContent className='relative px-6 pb-6'>
        <div className='flex flex-col sm:flex-row items-start gap-6 -mt-12'>
          {/* Avatar */}
          <Avatar className='h-32 w-32 border-4 border-background shadow-xl'>
            <AvatarImage
              src={targetProfile.photoURL ?? undefined}
              className='object-cover'
            />
            <AvatarFallback className='text-4xl bg-muted'>
              {displayName[0]}
            </AvatarFallback>
          </Avatar>

          {/* Info */}
          <div className='flex-1 pt-14 sm:pt-12 space-y-2 w-full text-center sm:text-left'>
            <div className='flex flex-col sm:flex-row sm:items-center justify-between gap-4'>
              <div>
                <h1 className='text-3xl font-bold flex items-center justify-center sm:justify-start gap-3'>
                  {displayName}
                  {medalSrc && (
                    <Image
                      src={medalSrc}
                      alt='Rank'
                      width={32}
                      height={32}
                      className='inline-block sm:hidden'
                    />
                  )}
                </h1>
                {targetProfile.bio && (
                  <p className='text-muted-foreground mt-1 max-w-lg'>
                    {targetProfile.bio}
                  </p>
                )}
                {rank && (
                  <div className='mt-2 inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80'>
                    {rank}
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className='flex gap-2 justify-center sm:justify-end'>
                {isSelf ? (
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button variant='outline' size='sm' className='gap-2'>
                        <Settings className='h-4 w-4' /> {t('Edit Profile')}
                      </Button>
                    </DialogTrigger>
                    <ProfileSettingsDialog
                      profile={targetProfile}
                      onUpdate={onUpdate}
                    />
                  </Dialog>
                ) : (
                  <>
                    {friendStatus === 'none' && (
                      <Button
                        size='sm'
                        onClick={() => handleFriendAction('add')}
                        className='gap-2'
                      >
                        <UserPlus className='h-4 w-4' /> {t('Add Friend')}
                      </Button>
                    )}
                    {friendStatus === 'outgoing' && (
                      <Button
                        size='sm'
                        variant='secondary'
                        onClick={() => handleFriendAction('cancel')}
                        className='gap-2'
                      >
                        <X className='h-4 w-4' /> {t('Cancel Request')}
                      </Button>
                    )}
                    {friendStatus === 'incoming' && (
                      <Button
                        size='sm'
                        className='gap-2 bg-green-600 hover:bg-green-700'
                        onClick={() => handleFriendAction('accept')}
                      >
                        <Check className='h-4 w-4' /> {t('Accept')}
                      </Button>
                    )}
                    {friendStatus === 'friends' && (
                      <Button
                        size='sm'
                        variant='outline'
                        className='gap-2 text-destructive hover:text-destructive'
                        onClick={() => handleFriendAction('remove')}
                      >
                        <UserMinus className='h-4 w-4' /> {t('Unfriend')}
                      </Button>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Desktop Medal (Right side) */}
          {medalSrc && (
            <div className='hidden sm:block -mt-20 flex-shrink-0'>
              <Image
                src={medalSrc}
                alt={rank || 'Rank'}
                width={140}
                height={140}
                className='drop-shadow-2xl transform hover:scale-105 transition-transform duration-300'
              />
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
