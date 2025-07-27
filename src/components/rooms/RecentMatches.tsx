// src/components/rooms/RecentMatches.tsx
'use client';

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  ScrollArea,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui';
import type { Match } from '@/lib/types';
import { safeFormatDate } from '@/lib/utils/date';
import { ShieldCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface RecentMatchesProps {
  matches: Match[];
}

export function RecentMatches({ matches }: RecentMatchesProps) {
  const { t } = useTranslation();

  return (
    <Card className='shadow-lg'>
      <CardHeader>
        <CardTitle className='flex items-center gap-2'>
          <ShieldCheck className='text-primary' />
          {t('Recent Matches')}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {matches.length ? (
          <ScrollArea className='h-[800px]'>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('Players')}</TableHead>
                  <TableHead>{t('Score')}</TableHead>
                  <TableHead>{t('Room Δ')}</TableHead>
                  <TableHead>{t('Elo Δ')}</TableHead>
                  <TableHead>{t('Winner')}</TableHead>
                  <TableHead>{t('Date')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {matches.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell>
                      {m.player1.name} – {m.player2.name}
                    </TableCell>
                    <TableCell>
                      {m.player1.scores} – {m.player2.scores}
                    </TableCell>
                    <TableCell>
                      {m.player1.roomAddedPoints} | {m.player2.roomAddedPoints}
                    </TableCell>
                    <TableCell>
                      {m.player1.newRating} | {m.player2.newRating}
                    </TableCell>
                    <TableCell className='font-semibold'>{m.winner}</TableCell>
                    <TableCell>
                      {safeFormatDate(
                        m.timestamp ?? (m as any).createdAt ?? (m as any).tsIso,
                        'dd.MM.yyyy HH:mm:ss'
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ScrollArea>
        ) : (
          <p className='text-center py-8 text-muted-foreground'>
            {t('No recent matches')}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
