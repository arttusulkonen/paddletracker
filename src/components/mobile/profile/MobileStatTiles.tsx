'use client';

import { Card, CardContent } from '@/components/ui';
import { BarChart2, Percent, Trophy } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export default function MobileStatTiles({
  elo,
  winRate,
  totalMatches,
  wins,
  losses,
}: {
  elo: number;
  winRate: number;
  totalMatches: number;
  wins: number;
  losses: number;
}) {
  const { t } = useTranslation();
  return (
    <div className="grid grid-cols-3 gap-2">
      <Tile icon={<BarChart2 className="h-4 w-4" />} label={t('ELO')} value={Math.round(elo)} />
      <Tile icon={<Percent className="h-4 w-4" />} label={t('Win Rate')} value={`${winRate.toFixed(1)}%`} />
      <Tile icon={<Trophy className="h-4 w-4" />} label={t('W / L')} value={`${wins} / ${losses}`} />
    </div>
  );
}

function Tile({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="p-3 text-center space-y-1">
        <div className="flex items-center justify-center gap-1 text-muted-foreground text-xs">{icon}<span>{label}</span></div>
        <div className="text-lg font-semibold">{value}</div>
      </CardContent>
    </Card>
  );
}