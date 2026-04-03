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
import { Flame, ShieldCheck } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

interface RecentMatchesProps {
  matches: Match[];
  defaultPlayer?: string;
  compact?: boolean; // Добавили поддержку компактного режима
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

export function RecentMatches({
  matches,
  defaultPlayer,
  compact = false,
}: RecentMatchesProps) {
  const { t } = useTranslation();
  const [selectedPlayer, setSelectedPlayer] = useState<string>(
    defaultPlayer ?? '',
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
        m.player1.name === selectedPlayer || m.player2.name === selectedPlayer,
    );
  }, [matches, selectedPlayer]);

  const cumulativeByMatchId = useMemo(() => {
    if (compact) return {}; // В компактном режиме нам не нужны сложные вычисления

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
  }, [matches, compact]);

  // Если режим компактный, мы возвращаем только самое важное (без Card обертки, так как она уже есть в page.tsx)
  if (compact) {
    return (
      <div className='flex flex-col h-full bg-transparent'>
        <div className='px-5 pt-5 pb-3 flex flex-col gap-3 border-b border-border/40 shrink-0 bg-muted/5'>
          <div className='flex items-center justify-between gap-4'>
            <div className='flex flex-col'>
              <span className='text-[10px] font-black uppercase tracking-widest text-muted-foreground'>
                {t('Matches')}
              </span>
              <span className='text-xs font-bold text-foreground'>
                {selectedPlayer
                  ? t('{{count}} match(es)', { count: filtered.length })
                  : t('{{count}} match(es) total', { count: matches.length })}
              </span>
            </div>

            <select
              className='h-8 max-w-[120px] rounded-lg border-0 bg-background px-3 text-[10px] font-bold shadow-sm focus:ring-2 focus:ring-primary/20 outline-none transition-all cursor-pointer ring-1 ring-border/50'
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
          </div>
        </div>

        <div className='flex-1 overflow-hidden'>
          {filtered.length ? (
            <ScrollArea className='h-full w-full'>
              <div className='flex flex-col'>
                {filtered.map((m) => {
                  const roomDeltaP1 = roomDelta(m.player1);
                  const roomDeltaP2 = roomDelta(m.player2);
                  const isP1Winner = m.player1.scores > m.player2.scores;

                  return (
                    <div
                      key={m.id}
                      className='flex flex-col p-4 border-b border-border/40 hover:bg-muted/30 transition-colors gap-2.5'
                    >
                      <div className='flex justify-between items-center w-full'>
                        <span className='text-[8px] uppercase tracking-widest font-black text-muted-foreground/60'>
                          {safeFormatDate(
                            (m as any).timestamp ??
                              (m as any).createdAt ??
                              (m as any).tsIso,
                            'MMM d, HH:mm',
                          )}
                        </span>

                        <div className='flex items-center gap-1 font-mono text-[10px] bg-background px-1.5 py-0.5 rounded shadow-sm border border-border/50'>
                          <span
                            className={
                              roomDeltaP1 > 0
                                ? 'text-emerald-500 font-bold'
                                : 'text-red-500 opacity-80'
                            }
                          >
                            {roomDeltaP1 >= 0
                              ? `+${Math.round(roomDeltaP1)}`
                              : Math.round(roomDeltaP1)}
                          </span>
                          <span className='text-muted-foreground/30 mx-0.5'>
                            |
                          </span>
                          <span
                            className={
                              roomDeltaP2 > 0
                                ? 'text-emerald-500 font-bold'
                                : 'text-red-500 opacity-80'
                            }
                          >
                            {roomDeltaP2 >= 0
                              ? `+${Math.round(roomDeltaP2)}`
                              : Math.round(roomDeltaP2)}
                          </span>
                        </div>
                      </div>

                      <div className='flex items-center justify-between w-full'>
                        <div
                          className={`font-bold text-sm truncate flex-1 ${isP1Winner ? 'text-foreground' : 'text-muted-foreground'}`}
                        >
                          {m.player1.name}
                        </div>
                        <div className='font-mono font-black text-sm bg-muted/40 px-2 py-0.5 rounded-md mx-3 shrink-0 text-primary'>
                          {m.player1.scores} - {m.player2.scores}
                        </div>
                        <div
                          className={`font-bold text-sm truncate flex-1 text-right ${!isP1Winner ? 'text-foreground' : 'text-muted-foreground'}`}
                        >
                          {m.player2.name}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          ) : (
            <div className='flex flex-col items-center justify-center h-full text-center py-10 px-4'>
              <History className='h-8 w-8 text-muted-foreground/30 mb-3' />
              <p className='text-xs font-bold text-foreground mb-1'>
                {selectedPlayer
                  ? t('No matches found for {{player}}', {
                      player: selectedPlayer,
                    })
                  : t('No recent matches')}
              </p>
            </div>
          )}
        </div>
      </div>
    );
  }

  // STANDARD FULL VIEW (For older pages where it was used as a wide table)
  return (
    <Card className='shadow-xl border-0 rounded-[2rem] glass-panel overflow-hidden mb-6'>
      <CardHeader className='px-6 pt-6 pb-4'>
        <div className='flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4'>
          <CardTitle className='flex items-center gap-2.5 text-2xl font-extrabold tracking-tight'>
            <div className='bg-primary/10 p-2 rounded-lg'>
              <ShieldCheck className='text-primary h-5 w-5' />
            </div>
            {t('Recent Matches')}
          </CardTitle>

          <div className='flex items-center gap-2 bg-muted/30 p-1.5 rounded-xl ring-1 ring-black/5 dark:ring-white/10 backdrop-blur-xl'>
            <label
              htmlFor='player-filter'
              className='text-[9px] uppercase tracking-widest font-bold text-muted-foreground ml-2 hidden md:block'
            >
              {t('Filter')}
            </label>
            <select
              id='player-filter'
              className='h-8 rounded-lg border-0 bg-background px-3 text-xs font-semibold shadow-sm focus:ring-2 focus:ring-primary/20 outline-none transition-all'
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
                className='h-8 rounded-lg px-3 text-xs font-semibold hover:bg-destructive/10 hover:text-destructive hover:border-transparent transition-all'
              >
                {t('Reset')}
              </Button>
            )}
          </div>
        </div>

        <div className='text-xs text-muted-foreground font-medium mt-2'>
          {selectedPlayer
            ? t('{{count}} match(es) for {{player}}', {
                count: filtered.length,
                player: selectedPlayer,
              })
            : t('{{count}} match(es) total', { count: matches.length })}
        </div>
      </CardHeader>

      <CardContent className='px-0 sm:px-6 pb-6'>
        {filtered.length ? (
          <ScrollArea className='h-[600px] w-full'>
            <Table>
              <TableHeader>
                <TableRow className='border-b-0 hover:bg-transparent'>
                  <TableHead className='p-2 align-middle text-[9px] uppercase tracking-widest font-bold text-muted-foreground'>
                    {t('Players')}
                  </TableHead>
                  <TableHead className='p-2 align-middle text-[9px] uppercase tracking-widest font-bold text-muted-foreground text-center'>
                    {t('Score')}
                  </TableHead>
                  <TableHead className='p-2 align-middle text-[9px] uppercase tracking-widest font-bold text-muted-foreground text-center'>
                    {t('Room Δ')}
                  </TableHead>
                  <TableHead className='p-2 align-middle text-[9px] uppercase tracking-widest font-bold text-muted-foreground text-center'>
                    {t('Elo Δ')}
                  </TableHead>
                  <TableHead className='p-2 align-middle text-[9px] uppercase tracking-widest font-bold text-muted-foreground text-center'>
                    Gained (Δ){' '}
                    <span className='opacity-50 block text-[7px]'>
                      (Since joining)
                    </span>
                  </TableHead>
                  <TableHead className='p-2 align-middle text-[9px] uppercase tracking-widest font-bold text-muted-foreground text-center'>
                    Lost (Δ){' '}
                    <span className='opacity-50 block text-[7px]'>
                      (Since joining)
                    </span>
                  </TableHead>
                  <TableHead className='p-2 align-middle text-[9px] uppercase tracking-widest font-bold text-muted-foreground'>
                    {t('Winner')}
                  </TableHead>
                  <TableHead className='p-2 align-middle text-[9px] uppercase tracking-widest font-bold text-muted-foreground'>
                    {t('Date')}
                  </TableHead>
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

                  const isEpicGainP1 = roomDeltaP1 >= 30;
                  const isEpicGainP2 = roomDeltaP2 >= 30;

                  const isP1Winner = m.player1.scores > m.player2.scores;

                  return (
                    <TableRow
                      key={m.id}
                      className='border-b-border/40 hover:bg-muted/30 transition-colors'
                    >
                      <TableCell className='p-2 align-middle font-semibold text-xs whitespace-nowrap'>
                        <span
                          className={
                            isP1Winner
                              ? 'text-foreground'
                              : 'text-muted-foreground'
                          }
                        >
                          {m.player1.name}
                        </span>
                        <span className='mx-1.5 opacity-30 text-[9px]'>VS</span>
                        <span
                          className={
                            !isP1Winner
                              ? 'text-foreground'
                              : 'text-muted-foreground'
                          }
                        >
                          {m.player2.name}
                        </span>
                      </TableCell>

                      <TableCell className='p-2 align-middle text-center font-mono font-bold text-sm bg-muted/10 rounded-lg'>
                        {m.player1.scores}{' '}
                        <span className='opacity-30 px-1'>-</span>{' '}
                        {m.player2.scores}
                      </TableCell>

                      <TableCell className='p-2 align-middle text-center'>
                        <div className='flex items-center justify-center gap-1 font-mono text-xs'>
                          <span
                            className={
                              isEpicGainP1
                                ? 'text-orange-500 font-bold flex items-center gap-0.5 bg-orange-500/10 px-1 rounded'
                                : roomDeltaP1 > 0
                                  ? 'text-emerald-500'
                                  : 'text-red-500 opacity-80'
                            }
                          >
                            {roomDeltaP1 >= 0
                              ? `+${Math.round(roomDeltaP1)}`
                              : Math.round(roomDeltaP1)}
                            {isEpicGainP1 && (
                              <Flame className='w-2.5 h-2.5 fill-current animate-pulse' />
                            )}
                          </span>
                          <span className='text-muted-foreground/30 mx-0.5'>
                            |
                          </span>
                          <span
                            className={
                              isEpicGainP2
                                ? 'text-orange-500 font-bold flex items-center gap-0.5 bg-orange-500/10 px-1 rounded'
                                : roomDeltaP2 > 0
                                  ? 'text-emerald-500'
                                  : 'text-red-500 opacity-80'
                            }
                          >
                            {roomDeltaP2 >= 0
                              ? `+${Math.round(roomDeltaP2)}`
                              : Math.round(roomDeltaP2)}
                            {isEpicGainP2 && (
                              <Flame className='w-2.5 h-2.5 fill-current animate-pulse' />
                            )}
                          </span>
                        </div>
                      </TableCell>

                      <TableCell className='p-2 align-middle text-center font-mono text-[10px] text-muted-foreground'>
                        {eloP1 >= 0 ? `+${eloP1}` : eloP1} |{' '}
                        {eloP2 >= 0 ? `+${eloP2}` : eloP2}
                      </TableCell>

                      <TableCell className='p-2 align-middle text-center text-emerald-500 font-mono text-[10px]'>
                        +{cg1} | +{cg2}
                      </TableCell>

                      <TableCell className='p-2 align-middle text-center text-red-500 font-mono text-[10px] opacity-80'>
                        -{cl1} | -{cl2}
                      </TableCell>

                      <TableCell className='p-2 align-middle font-bold text-xs'>
                        <span className='bg-primary/10 text-primary px-2 py-0.5 rounded-full'>
                          {m.winner}
                        </span>
                      </TableCell>

                      <TableCell className='p-2 align-middle text-[10px] text-muted-foreground whitespace-nowrap font-medium'>
                        {safeFormatDate(
                          (m as any).timestamp ??
                            (m as any).createdAt ??
                            (m as any).tsIso,
                          'MMM d, HH:mm',
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </ScrollArea>
        ) : (
          <div className='flex flex-col items-center justify-center py-16 text-center'>
            <div className='bg-muted/50 p-4 rounded-full mb-3 ring-1 ring-black/5 dark:ring-white/10'>
              <ShieldCheck className='h-8 w-8 text-muted-foreground/50' />
            </div>
            <p className='text-base font-semibold text-foreground mb-1'>
              {selectedPlayer
                ? t('No matches found for {{player}}', {
                    player: selectedPlayer,
                  })
                : t('No recent matches')}
            </p>
            <p className='text-muted-foreground text-xs max-w-sm'>
              {t(
                'Matches recorded in this room will appear here in chronological order.',
              )}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
