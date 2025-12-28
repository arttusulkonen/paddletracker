// src/components/rooms/RecentMatches.tsx
'use client';

import {
	Button,
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
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

interface RecentMatchesProps {
  matches: Match[];
  defaultPlayer?: string;
}

const tsToMs = (m: any): number => {
  const v =
    m?.tsIso ??
    m?.timestamp ??
    (typeof m?.createdAt === 'string' ? m.createdAt : undefined);
  const ms = typeof v === 'string' ? Date.parse(v) : NaN;
  return Number.isFinite(ms) ? ms : 0;
};

const num = (v: any, fallback = 0) =>
  typeof v === 'number' && Number.isFinite(v) ? v : fallback;

const roomDelta = (p: any): number => {
  const dRoom = num(p?.roomNewRating, NaN) - num(p?.roomOldRating, NaN);
  if (Number.isFinite(dRoom)) return dRoom;

  const dGlobal = num(p?.newRating, NaN) - num(p?.oldRating, NaN);
  if (Number.isFinite(dGlobal)) return dGlobal;

  if (Number.isFinite(num(p?.roomAddedPoints, NaN)))
    return num(p.roomAddedPoints);

  return 0;
};

export function RecentMatches({ matches, defaultPlayer }: RecentMatchesProps) {
  const { t } = useTranslation();
  const [selectedPlayer, setSelectedPlayer] = useState<string>(
    defaultPlayer ?? ''
  );

  const allPlayers = useMemo(() => {
    const set = new Set<string>();
    for (const m of matches) {
      if (m?.player1?.name) set.add(m.player1.name);
      if (m?.player2?.name) set.add(m.player2.name);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [matches]);

  const filtered = useMemo(() => {
    if (!selectedPlayer) return matches;
    return matches.filter(
      (m) =>
        m.player1.name === selectedPlayer || m.player2.name === selectedPlayer
    );
  }, [matches, selectedPlayer]);

  const cumulativeByMatchId = useMemo(() => {
    const chronological = [...matches].sort((a, b) => tsToMs(a) - tsToMs(b));

    const gained: Record<string, number> = {};
    const lost: Record<string, number> = {};

    const snapshot: Record<
      string,
      {
        p1: { gained: number; lost: number };
        p2: { gained: number; lost: number };
      }
    > = {};

    for (const m of chronological) {
      const p1Id = m.player1Id;
      const p2Id = m.player2Id;

      if (!(p1Id in gained)) gained[p1Id] = 0;
      if (!(p1Id in lost)) lost[p1Id] = 0;
      if (!(p2Id in gained)) gained[p2Id] = 0;
      if (!(p2Id in lost)) lost[p2Id] = 0;

      const d1 = roomDelta(m.player1);
      const d2 = roomDelta(m.player2);

      if (d1 >= 0) gained[p1Id] += d1;
      else lost[p1Id] += -d1;

      if (d2 >= 0) gained[p2Id] += d2;
      else lost[p2Id] += -d2;

      snapshot[m.id] = {
        p1: { gained: Math.round(gained[p1Id]), lost: Math.round(lost[p1Id]) },
        p2: { gained: Math.round(gained[p2Id]), lost: Math.round(lost[p2Id]) },
      };
    }

    return snapshot;
  }, [matches]);

  return (
    <Card className='shadow-lg'>
      <CardHeader className='gap-4'>
        <div className='flex items-center justify-between flex-wrap gap-3'>
          <CardTitle className='flex items-center gap-2'>
            <ShieldCheck className='text-primary' />
            {t('Recent Matches')}
          </CardTitle>

          <div className='flex items-center gap-2'>
            <label
              htmlFor='player-filter'
              className='text-sm text-muted-foreground'
            >
              {t('Filter by Player')}
            </label>
            <select
              id='player-filter'
              className='h-9 rounded-md border bg-background px-3 text-sm'
              value={selectedPlayer}
              onChange={(e) => setSelectedPlayer(e.target.value)}
            >
              <option value=''>{t('All players')}</option>
              {allPlayers.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
            {selectedPlayer && (
              <Button
                variant='outline'
                size='sm'
                onClick={() => setSelectedPlayer('')}
              >
                {t('Reset')}
              </Button>
            )}
          </div>
        </div>

        <div className='text-sm text-muted-foreground'>
          {selectedPlayer
            ? t('{{count}} match(es) for {{player}}', {
                count: filtered.length,
                player: selectedPlayer,
              })
            : t('{{count}} match(es) total', { count: matches.length })}
        </div>
      </CardHeader>

      <CardContent>
        {filtered.length ? (
          <ScrollArea className='h-[800px]'>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('Players')}</TableHead>
                  <TableHead>{t('Score')}</TableHead>
                  <TableHead>{t('Room Δ')}</TableHead>
                  <TableHead>{t('Elo Δ')}</TableHead>
                  <TableHead>Gained (Δ) (Since joining room)</TableHead>
                  <TableHead>Lost (Δ) (Since joining room)</TableHead>
                  <TableHead>{t('Winner')}</TableHead>
                  <TableHead>{t('Date')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((m) => {
                  const roomDeltaP1 = roomDelta(m.player1);
                  const roomDeltaP2 = roomDelta(m.player2);

                  const eloDeltaP1 =
                    num(m.player1?.newRating, NaN) -
                    num(m.player1?.oldRating, NaN);
                  const eloDeltaP2 =
                    num(m.player2?.newRating, NaN) -
                    num(m.player2?.oldRating, NaN);
                  const eloP1 = Number.isFinite(eloDeltaP1)
                    ? Math.round(eloDeltaP1)
                    : 0;
                  const eloP2 = Number.isFinite(eloDeltaP2)
                    ? Math.round(eloDeltaP2)
                    : 0;

                  const snap = cumulativeByMatchId[m.id];
                  const cg1 = snap?.p1.gained ?? 0;
                  const cl1 = snap?.p1.lost ?? 0;
                  const cg2 = snap?.p2.gained ?? 0;
                  const cl2 = snap?.p2.lost ?? 0;

                  return (
                    <TableRow key={m.id}>
                      <TableCell>
                        {m.player1.name} – {m.player2.name}
                      </TableCell>

                      <TableCell>
                        {m.player1.scores} – {m.player2.scores}
                      </TableCell>

                      <TableCell>
                        {roomDeltaP1 >= 0
                          ? `+${Math.round(roomDeltaP1)}`
                          : Math.round(roomDeltaP1)}{' '}
                        |{' '}
                        {roomDeltaP2 >= 0
                          ? `+${Math.round(roomDeltaP2)}`
                          : Math.round(roomDeltaP2)}
                      </TableCell>

                      <TableCell>
                        {eloP1 >= 0 ? `+${eloP1}` : eloP1} |{' '}
                        {eloP2 >= 0 ? `+${eloP2}` : eloP2}
                      </TableCell>

                      <TableCell className='text-green-600 font-medium'>
                        +{cg1} | +{cg2}
                      </TableCell>

                      <TableCell className='text-red-600 font-medium'>
                        -{cl1} | -{cl2}
                      </TableCell>

                      <TableCell className='font-semibold'>
                        {m.winner}
                      </TableCell>

                      <TableCell>
                        {safeFormatDate(
                          (m as any).timestamp ??
                            (m as any).createdAt ??
                            (m as any).tsIso,
                          'dd.MM.yyyy HH:mm:ss'
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </ScrollArea>
        ) : (
          <p className='text-center py-8 text-muted-foreground'>
            {selectedPlayer
              ? t('No matches found for {{player}}', { player: selectedPlayer })
              : t('No recent matches')}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
