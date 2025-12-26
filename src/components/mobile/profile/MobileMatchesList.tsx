'use client';

import { Badge, Card, CardContent, CardHeader, CardTitle } from '@/components/ui';
import { Sport } from '@/contexts/SportContext';
import type { Match } from '@/lib/types';
import { safeFormatDate } from '@/lib/utils/date';
import Link from 'next/link';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

export default function MobileMatchesList({
  matches,
  meUid,
}: {
  sport: Sport;
  matches: Match[];
  meUid: string;
}) {
  const { t } = useTranslation();
  const visible = useMemo(() => matches.slice(0, 20), [matches]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t('Recent Matches')}</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {visible.length === 0 ? (
          <p className="text-sm text-muted-foreground px-4 py-6 text-center">
            {t('No matches yet.')}
          </p>
        ) : (
          <ul className="divide-y">
            {visible.map((m) => {
              const isP1 = m.player1Id === meUid;
              const me = isP1 ? m.player1 : m.player2;
              const opp = isP1 ? m.player2 : m.player1;
              const win = me.scores > opp.scores;
              const delta = me.addedPoints ?? 0;
              const date = safeFormatDate(m.tsIso ?? m.timestamp ?? m.createdAt ?? (m as any).playedAt, 'dd.MM.yyyy HH:mm');
              return (
                <li key={m.id} className="px-4 py-3">
                  <div className="flex items-center justify-between">
                    <div className="min-w-0">
                      <p className="font-medium truncate">{opp.name}</p>
                      <p className="text-xs text-muted-foreground">{date}</p>
                    </div>
                    <div className="text-right">
                      <p className={`text-sm font-semibold ${win ? 'text-green-600' : 'text-destructive'}`}>
                        {me.scores}–{opp.scores} {win ? t('Win') : t('Loss')}
                      </p>
                      <p className={`text-xs ${m.isRanked === false ? 'text-muted-foreground' : delta >= 0 ? 'text-green-600' : 'text-destructive'}`}>
                        {m.isRanked === false ? '–' : delta > 0 ? `+${delta}` : delta}
                      </p>
                    </div>
                  </div>
                  {m.roomId && (
                    <div className="mt-2">
                      <Link href={`/rooms/${m.roomId}`}>
                        <Badge variant="outline" className="text-xs">{t('Open room')}</Badge>
                      </Link>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}