// src/components/profile/OverallStatsCard.tsx
'use client';

import { Card, CardContent } from '@/components/ui';
import { sportConfig } from '@/contexts/SportContext';
import type { Sport, UserProfile } from '@/lib/types';
import { BarChart3, Trophy, Zap } from 'lucide-react';
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
    <div className='grid grid-cols-2 md:grid-cols-4 gap-4'>
      <StatsTile
        icon={BarChart3}
        label={t('Total Matches')}
        value={overallStats.totalMatches}
        color='bg-blue-100 text-blue-700'
      />
      <StatsTile
        icon={Trophy}
        label={t('Total Wins')}
        value={overallStats.totalWins}
        color='bg-amber-100 text-amber-700'
      />
      <StatsTile
        icon={Zap}
        label={t('Win Rate')}
        value={`${overallStats.winRate.toFixed(0)}%`}
        color='bg-violet-100 text-violet-700'
      />
      <StatsTile
        icon={Trophy}
        label={t('Best Sport')}
        value={overallStats.bestSport.name}
        subtext={`${overallStats.bestSport.elo} ELO`}
        color='bg-emerald-100 text-emerald-700'
      />
    </div>
  );
};

function StatsTile({ icon: Icon, label, value, subtext, color }: any) {
  return (
    <Card className='border-none shadow-sm hover:shadow-md transition-shadow'>
      <CardContent className='p-4 flex flex-col items-center text-center'>
        <div className={`p-2 rounded-full mb-2 ${color}`}>
          <Icon size={20} />
        </div>
        <div className='text-2xl font-bold text-slate-900'>{value}</div>
        <div className='text-xs font-medium text-muted-foreground uppercase tracking-wide'>
          {label}
        </div>
        {subtext && (
          <div className='text-xs text-muted-foreground mt-1'>{subtext}</div>
        )}
      </CardContent>
    </Card>
  );
}
