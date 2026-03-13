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
    <div className='grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6'>
      <StatsTile
        icon={BarChart3}
        label={t('Total Matches')}
        value={overallStats.totalMatches}
        color='text-blue-600 dark:text-blue-400'
        bg='bg-blue-500/10'
        ring='ring-blue-500/20'
      />
      <StatsTile
        icon={Trophy}
        label={t('Total Wins')}
        value={overallStats.totalWins}
        color='text-amber-600 dark:text-amber-400'
        bg='bg-amber-500/10'
        ring='ring-amber-500/20'
      />
      <StatsTile
        icon={Zap}
        label={t('Win Rate')}
        value={`${overallStats.winRate.toFixed(0)}%`}
        color='text-violet-600 dark:text-violet-400'
        bg='bg-violet-500/10'
        ring='ring-violet-500/20'
      />
      <StatsTile
        icon={Trophy}
        label={t('Best Sport')}
        value={overallStats.bestSport.name}
        subtext={`${Math.round(overallStats.bestSport.elo)} ELO`}
        color='text-emerald-600 dark:text-emerald-400'
        bg='bg-emerald-500/10'
        ring='ring-emerald-500/20'
      />
    </div>
  );
};

function StatsTile({ icon: Icon, label, value, subtext, color, bg, ring }: any) {
  return (
    <Card className='border-0 shadow-sm hover:shadow-lg transition-all duration-300 rounded-[2rem] glass-panel group overflow-hidden relative'>
      <div className={`absolute inset-0 opacity-0 group-hover:opacity-50 transition-opacity duration-500 ${bg}`} />
      <CardContent className='p-6 flex flex-col items-center text-center relative z-10'>
        <div className={`p-3 rounded-2xl mb-4 ring-1 ${color} ${bg} ${ring} shadow-sm group-hover:scale-110 transition-transform duration-300 ease-out`}>
          <Icon className="w-6 h-6" />
        </div>
        <div className='text-3xl font-black text-foreground tracking-tight mb-1'>{value}</div>
        <div className='text-[10px] font-bold text-muted-foreground uppercase tracking-widest opacity-80'>
          {label}
        </div>
        {subtext && (
          <div className='text-xs font-semibold text-muted-foreground mt-2 bg-muted/50 px-2 py-0.5 rounded-full'>
            {subtext}
          </div>
        )}
      </CardContent>
    </Card>
  );
}