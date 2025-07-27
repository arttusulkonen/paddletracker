// src/components/profile/OverallStatsCard.tsx
'use client';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui';
import { sportConfig } from '@/contexts/SportContext';
import type { Sport, UserProfile } from '@/lib/types';
import { BarChart, Trophy, Zap } from 'lucide-react';
import React from 'react';
import { useTranslation } from 'react-i18next';

interface OverallStatsCardProps {
  profile: UserProfile;
}

export const OverallStatsCard: React.FC<OverallStatsCardProps> = ({
  profile,
}) => {
  const { t } = useTranslation();

  const overallStats = React.useMemo(() => {
    let totalMatches = 0;
    let totalWins = 0;
    let bestSport = { name: 'N/A', elo: 0 };

    if (profile.sports) {
      for (const sportKey in profile.sports) {
        const sportData = profile.sports[sportKey as Sport];
        if (sportData) {
          totalWins += sportData.wins ?? 0;
          totalMatches += (sportData.wins ?? 0) + (sportData.losses ?? 0);
          if ((sportData.globalElo ?? 0) > bestSport.elo) {
            bestSport = {
              name: sportConfig[sportKey as Sport]?.name || sportKey,
              elo: sportData.globalElo ?? 0,
            };
          }
        }
      }
    }
    const winRate = totalMatches > 0 ? (totalWins / totalMatches) * 100 : 0;
    return { totalMatches, totalWins, winRate, bestSport };
  }, [profile.sports]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('Career Overview')}</CardTitle>
        <CardDescription>
          {t("A summary of the player's performance across all sports.")}
        </CardDescription>
      </CardHeader>
      <CardContent className='grid grid-cols-2 md:grid-cols-4 gap-4 text-center'>
        <div className='flex flex-col items-center p-4 bg-muted/50 rounded-lg'>
          <BarChart className='h-8 w-8 text-primary mb-2' />
          <p className='text-2xl font-bold'>{overallStats.totalMatches}</p>
          <p className='text-sm text-muted-foreground'>{t('Total Matches')}</p>
        </div>
        <div className='flex flex-col items-center p-4 bg-muted/50 rounded-lg'>
          <Trophy className='h-8 w-8 text-yellow-500 mb-2' />
          <p className='text-2xl font-bold'>{overallStats.totalWins}</p>
          <p className='text-sm text-muted-foreground'>{t('Total Wins')}</p>
        </div>
        <div className='flex flex-col items-center justify-center p-4 bg-muted/50 rounded-lg'>
          <p className='text-2xl font-bold'>
            {overallStats.winRate.toFixed(1)}%
          </p>
          <p className='text-sm text-muted-foreground'>
            {t('Overall Win Rate')}
          </p>
        </div>
        <div className='flex flex-col items-center justify-center p-4 bg-muted/50 rounded-lg'>
          <Zap className='h-8 w-8 text-green-500 mb-2' />
          <p className='text-xl font-bold'>{overallStats.bestSport.name}</p>
          <p className='text-sm text-muted-foreground'>
            {t('Best Sport (by ELO)')}
          </p>
        </div>
      </CardContent>
    </Card>
  );
};
