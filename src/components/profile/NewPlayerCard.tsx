// src/components/profile/NewPlayerCard.tsx
'use client';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui';
import { Rocket, Swords, Users } from 'lucide-react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';

interface NewPlayerCardProps {
  isSelf: boolean;
  playerName: string;
}

export function NewPlayerCard({ isSelf, playerName }: NewPlayerCardProps) {
  const { t } = useTranslation();

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
