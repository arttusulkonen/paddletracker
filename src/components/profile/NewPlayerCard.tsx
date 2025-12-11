'use client';

import {
	Button,
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '@/components/ui';
import type { UserProfile } from '@/lib/types';
import { Briefcase, Ghost, Rocket, Swords, Users } from 'lucide-react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';

interface NewPlayerCardProps {
  isSelf: boolean;
  profile: UserProfile | null;
}

export function NewPlayerCard({ isSelf, profile }: NewPlayerCardProps) {
  const { t } = useTranslation();

  if (!profile) return null;

  const isCoach =
    profile.accountType === 'coach' || profile.roles?.includes('coach');
  const isGhost = profile.isGhost;

  // --- 1. КАРТОЧКА ТРЕНЕРА ---
  if (isCoach) {
    return (
      <Card className='mt-6 text-center border-dashed border-2 bg-muted/5'>
        <CardHeader>
          <CardTitle className='flex items-center justify-center gap-3 text-2xl'>
            <Briefcase className='h-8 w-8 text-primary' />
            {isSelf ? t('Coach Dashboard') : t('Coach Profile')}
          </CardTitle>
          <CardDescription>
            {isSelf
              ? t(
                  'You are registered as a Coach/Organizer. You do not track your own match stats.'
                )
              : t(
                  'This user is a Coach / Organizer and manages other players.'
                )}
          </CardDescription>
        </CardHeader>
        {isSelf && (
          <CardContent className='space-y-4'>
            <p className='text-muted-foreground text-sm max-w-md mx-auto'>
              {t(
                'Use the management console to organize players, create communities, and invite members.'
              )}
            </p>
            <Link href='/manage/players'>
              <Button className='gap-2'>
                <Users className='h-4 w-4' />
                {t('Go to Management Console')}
              </Button>
            </Link>
          </CardContent>
        )}
      </Card>
    );
  }

  // --- 2. КАРТОЧКА ПРИЗРАЧНОГО ИГРОКА ---
  if (isGhost) {
    return (
      <Card className='mt-6 text-center bg-muted/10 border-none shadow-none'>
        <CardHeader>
          <CardTitle className='flex items-center justify-center gap-3 text-2xl'>
            <Ghost className='h-8 w-8 text-muted-foreground' />
            {t('Managed Profile')}
          </CardTitle>
          <CardDescription>
            {t(
              'This player profile is managed by a coach. Matches can be recorded, but the player has not claimed this account yet.'
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className='text-sm text-muted-foreground'>
            {t('Stats will appear here once matches are recorded.')}
          </p>
        </CardContent>
      </Card>
    );
  }

  // --- 3. СТАНДАРТНЫЙ НОВЫЙ ИГРОК ---
  return (
    <Card className='mt-6 text-center'>
      <CardHeader>
        <CardTitle className='flex items-center justify-center gap-3 text-2xl'>
          <Rocket className='h-8 w-8 text-primary' />
          {isSelf ? t('Ready for Action?') : t('A New Challenger!')}
        </CardTitle>
        <CardDescription>
          {isSelf
            ? t("You haven't played any matches yet. Let's get you started!")
            : t('This player has not played any matches yet.')}
        </CardDescription>
      </CardHeader>
      {isSelf && (
        <CardContent className='space-y-4'>
          <div className='flex items-start gap-3 text-left'>
            <Users className='h-5 w-5 text-blue-500 mt-1 shrink-0' />
            <div>
              <h4 className='font-semibold'>{t('1. Join a Room')}</h4>
              <p className='text-sm text-muted-foreground'>
                {t(
                  'Rooms are where you can find opponents and record your games. Explore public rooms or create your own.'
                )}{' '}
                <Link
                  href='/rooms'
                  className='font-semibold text-primary hover:underline'
                >
                  {t('Find Rooms')}
                </Link>
              </p>
            </div>
          </div>
          <div className='flex items-start gap-3 text-left'>
            <Swords className='h-5 w-5 text-green-500 mt-1 shrink-0' />
            <div>
              <h4 className='font-semibold'>{t('2. Play a Match')}</h4>
              <p className='text-sm text-muted-foreground'>
                {t(
                  'Once in a room, you can record matches against other members to start building your ELO rating and stats.'
                )}
              </p>
            </div>
          </div>
        </CardContent>
      )}
    </Card>
  );
}
