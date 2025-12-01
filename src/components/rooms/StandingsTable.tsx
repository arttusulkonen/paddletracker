'use client';

import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  ScrollArea,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui';
import { useSport } from '@/contexts/SportContext';
import { Info, ShieldCheck } from 'lucide-react';
import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

type MiniMatch = { result: 'W' | 'L'; opponent: string; score: string };

interface StandingsTableProps {
  players: any[];
  latestSeason: any;
  roomCreatorId: string;
}

type ViewMode = 'regular' | 'liveFinal' | 'final';

export function StandingsTable({
  players,
  latestSeason,
  roomCreatorId,
}: StandingsTableProps) {
  const { t } = useTranslation();
  const { sport } = useSport();

  const [viewMode, setViewMode] = useState<ViewMode>(
    latestSeason ? 'final' : 'regular'
  );

  const [sortConfig, setSortConfig] = useState<{
    key: string;
    dir: 'asc' | 'desc';
  }>({ key: 'rating', dir: 'desc' });

  const sortedPlayers = useMemo(() => {
    return [...players].sort((a: any, b: any) => {
      if (a.ratingVisible !== b.ratingVisible) return a.ratingVisible ? -1 : 1;

      const { key, dir } = sortConfig;
      const factor = dir === 'asc' ? 1 : -1;

      if (key === 'winPct') {
        return factor * (parseFloat(a.winPct) - parseFloat(b.winPct));
      }
      if (key === 'name') {
        return factor * a.name.localeCompare(b.name);
      }
      return factor * ((a[key] ?? 0) - (b[key] ?? 0));
    });
  }, [players, sortConfig]);

  const handleSort = (key: string) => {
    setSortConfig((prev) => ({
      key,
      dir: prev.key === key && prev.dir === 'desc' ? 'asc' : 'desc',
    }));
  };

  return (
    <Card className='shadow-lg mb-8'>
      <CardHeader>
        <div className='flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4'>
          <CardTitle>{t('Standings')}</CardTitle>

          <div className='flex gap-2 bg-muted/20 p-1 rounded-lg'>
            <Button
              size='sm'
              variant={viewMode === 'regular' ? 'default' : 'ghost'}
              onClick={() => setViewMode('regular')}
            >
              {t('Regular')}
            </Button>
            <Button
              size='sm'
              variant={viewMode === 'liveFinal' ? 'default' : 'ghost'}
              onClick={() => setViewMode('liveFinal')}
            >
              {t('Live Final')}
            </Button>
            {latestSeason && (
              <Button
                size='sm'
                variant={viewMode === 'final' ? 'default' : 'ghost'}
                onClick={() => setViewMode('final')}
              >
                {t('Final Results')}
              </Button>
            )}
          </div>
        </div>

        <CardDescription>
          {viewMode === 'regular'
            ? t(
                'Current live standings sorted by Room Rating. This is the main leaderboard for daily games.'
              )
            : viewMode === 'liveFinal'
            ? t(
                'Projected Season Winner. Calculated using "Adjusted Points" which rewards high activity.'
              )
            : t('Official results of the last finalized season.')}
        </CardDescription>
      </CardHeader>

      <CardContent>
        {viewMode === 'regular' && (
          <RegularStandings
            players={sortedPlayers}
            onSort={handleSort}
            creatorId={roomCreatorId}
            sport={sport}
            t={t}
          />
        )}

        {viewMode === 'liveFinal' && (
          <LiveFinalStandings players={players} sport={sport} t={t} />
        )}

        {viewMode === 'final' && (
          <FinalStandings season={latestSeason} sport={sport} t={t} />
        )}
      </CardContent>
    </Card>
  );
}

function RegularStandings({ players, onSort, creatorId, sport, t }: any) {
  const headers = useMemo(() => {
    const common = [
      {
        key: 'name',
        label: 'Player',
        isSortable: true,
        description: "The player's display name.",
      },
      {
        key: 'rating',
        label: 'Room Rating',
        isSortable: true,
        description:
          'Current ELO rating within this room. Everyone starts at 1000.',
      },
    ];

    const standardSpecific = [
      {
        key: 'deltaRoom',
        label: 'Room Δ',
        isSortable: true,
        description:
          'Total change in Room Rating since joining (Current - 1000).',
      },
      {
        key: 'globalDelta',
        label: 'Global Δ',
        isSortable: true,
        description: 'Change in global ELO since the first match in this room.',
      },
      {
        key: 'totalMatches',
        label: 'Games',
        isSortable: true,
        description: 'Total games played in this room.',
      },
      {
        key: 'wins',
        label: 'W',
        isSortable: true,
        description: 'Total wins.',
      },
      {
        key: 'losses',
        label: 'L',
        isSortable: true,
        description: 'Total losses.',
      },
      {
        key: 'winPct',
        label: 'Win %',
        isSortable: true,
        description: 'Wins / Total Games.',
      },
      {
        key: 'avgPtsPerMatch',
        label: 'Avg Δ',
        isSortable: true,
        description: 'Average rating change per game.',
      },
      {
        key: 'last5Form',
        label: 'Form',
        isSortable: false,
        description: 'Last 5 games (Green=Win, Red=Loss).',
      },
      {
        key: 'longestWinStreak',
        label: 'Streak',
        isSortable: true,
        description: 'Best consecutive win streak.',
      },
    ];

    const tennisSpecific = [
      {
        key: 'totalMatches',
        label: 'Sets',
        isSortable: true,
        description: 'Total sets played.',
      },
      {
        key: 'wins',
        label: 'W',
        isSortable: true,
        description: 'Sets won.',
      },
      {
        key: 'losses',
        label: 'L',
        isSortable: true,
        description: 'Sets lost.',
      },
      {
        key: 'winPct',
        label: 'Win %',
        isSortable: true,
        description: 'Sets won percentage.',
      },
      {
        key: 'aces',
        label: 'Aces',
        isSortable: true,
        description: 'Total aces.',
      },
      {
        key: 'doubleFaults',
        label: 'DF',
        isSortable: true,
        description: 'Double faults.',
      },
      {
        key: 'winners',
        label: 'Winners',
        isSortable: true,
        description: 'Clean winners.',
      },
    ];

    return sport === 'tennis'
      ? [...common, ...tennisSpecific]
      : [...common, ...standardSpecific];
  }, [sport, t]);

  return (
    <div className='overflow-x-auto'>
      <ScrollArea className='w-full whitespace-nowrap'>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className='w-10 text-center'>#</TableHead>
              {headers.map((h) => (
                <TableHead
                  key={h.key}
                  className='text-xs uppercase font-bold text-muted-foreground'
                >
                  <TooltipProvider delayDuration={0}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div
                          className={`flex items-center gap-1 cursor-pointer ${
                            h.key === 'name'
                              ? 'justify-start'
                              : 'justify-center'
                          }`}
                          onClick={() => h.isSortable && onSort(h.key)}
                        >
                          <span>{t(h.label)}</span>
                          {h.description && (
                            <Info className='h-3 w-3 opacity-50' />
                          )}
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className='max-w-xs text-xs'>{t(h.description)}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {players.map((p: any, i: number) => (
              <TableRow key={p.userId} className='hover:bg-muted/50'>
                <TableCell className='text-center font-medium text-muted-foreground'>
                  {i + 1}
                </TableCell>
                <TableCell>
                  <a
                    href={`/profile/${p.userId}`}
                    className='hover:underline flex items-center gap-2 font-medium'
                  >
                    {p.name}
                    {p.userId === creatorId && (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <ShieldCheck className='h-3 w-3 text-primary' />
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>{t('Room Creator')}</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )}
                  </a>
                </TableCell>
                <TableCell className='text-center font-bold text-primary'>
                  {p.ratingVisible ? Math.round(p.rating) : '—'}
                </TableCell>

                {sport === 'tennis' ? (
                  <>
                    <TableCell className='text-center'>
                      {p.totalMatches}
                    </TableCell>
                    <TableCell className='text-center text-green-600'>
                      {p.wins}
                    </TableCell>
                    <TableCell className='text-center text-red-600'>
                      {p.losses}
                    </TableCell>
                    <TableCell className='text-center font-medium'>
                      {p.ratingVisible ? `${p.winPct}%` : '—'}
                    </TableCell>
                    <TableCell className='text-center'>{p.aces ?? 0}</TableCell>
                    <TableCell className='text-center'>
                      {p.doubleFaults ?? 0}
                    </TableCell>
                    <TableCell className='text-center'>
                      {p.winners ?? 0}
                    </TableCell>
                  </>
                ) : (
                  <>
                    <TableCell className='text-center text-xs'>
                      {p.ratingVisible
                        ? p.deltaRoom > 0
                          ? `+${p.deltaRoom.toFixed(0)}`
                          : p.deltaRoom.toFixed(0)
                        : '—'}
                    </TableCell>
                    <TableCell className='text-center text-xs text-muted-foreground'>
                      {p.ratingVisible
                        ? p.globalDelta > 0
                          ? `+${p.globalDelta.toFixed(0)}`
                          : p.globalDelta.toFixed(0)
                        : '—'}
                    </TableCell>
                    <TableCell className='text-center'>
                      {p.totalMatches}
                    </TableCell>
                    <TableCell className='text-center font-semibold text-green-600'>
                      {p.wins}
                    </TableCell>
                    <TableCell className='text-center font-semibold text-red-600'>
                      {p.losses}
                    </TableCell>
                    <TableCell className='text-center font-bold'>
                      {p.ratingVisible ? `${p.winPct}%` : '—'}
                    </TableCell>
                    <TableCell className='text-center text-xs'>
                      {p.ratingVisible ? p.avgPtsPerMatch.toFixed(1) : '—'}
                    </TableCell>
                    <TableCell className='text-center'>
                      <div className='flex gap-0.5 justify-center'>
                        {(p.last5Form || [])
                          .slice()
                          .reverse()
                          .map((mm: MiniMatch, idx: number) => (
                            <div
                              key={idx}
                              className={`w-2 h-2 rounded-full ${
                                mm.result === 'W'
                                  ? 'bg-green-500'
                                  : 'bg-red-500'
                              }`}
                              title={`${
                                mm.result === 'W' ? 'Win' : 'Loss'
                              } vs ${mm.opponent}`}
                            />
                          ))}
                      </div>
                    </TableCell>
                    <TableCell className='text-center'>
                      {p.ratingVisible ? p.longestWinStreak : '—'}
                    </TableCell>
                  </>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </ScrollArea>
    </div>
  );
}

function LiveFinalStandings({ players, sport, t }: any) {
  const rows = useMemo(() => {
    const base = (players ?? []).map((p: any) => {
      const matchesPlayed = Number(p.totalMatches ?? p.wins + p.losses ?? 0);
      const roomRating = Number(p.rating ?? 1000);
      const totalAddedPoints = roomRating - 1000;

      return {
        userId: p.userId,
        name: p.name,
        matchesPlayed,
        wins: Number(p.wins ?? 0),
        losses: Number(p.losses ?? 0),
        winRate:
          matchesPlayed > 0 ? (Number(p.wins ?? 0) / matchesPlayed) * 100 : 0,
        totalAddedPoints,
        longestWinStreak: Number(p.longestWinStreak ?? 0),
        roomRating,
      };
    });

    const activePlayers = base.filter((p: any) => p.matchesPlayed > 0);
    const totalMatchesAll = activePlayers.reduce(
      (sum: number, r: any) => sum + r.matchesPlayed,
      0
    );
    const avgM =
      activePlayers.length > 0 ? totalMatchesAll / activePlayers.length : 1;

    const adjFactor = (ratio: number) => {
      if (!isFinite(ratio) || ratio <= 0) return 0;
      return Math.sqrt(ratio);
    };

    const withAdj = base.map((r: any) => ({
      ...r,
      adjPoints: r.totalAddedPoints * adjFactor(r.matchesPlayed / avgM),
    }));

    withAdj.sort((a: any, b: any) => {
      const aZero = a.matchesPlayed === 0;
      const bZero = b.matchesPlayed === 0;
      if (aZero !== bZero) return aZero ? 1 : -1;

      if (b.adjPoints !== a.adjPoints) return b.adjPoints - a.adjPoints;
      if (b.roomRating !== a.roomRating) return b.roomRating - a.roomRating;
      if (b.wins !== a.wins) return b.wins - a.wins;
      return b.winRate - a.winRate;
    });

    return withAdj.map((r: any, i: number) => ({ ...r, place: i + 1 }));
  }, [players]);

  const headers = [
    { key: 'place', label: 'Rank' },
    { key: 'name', label: 'Player' },
    { key: 'matchesPlayed', label: 'Games' },
    { key: 'wins', label: 'W' },
    { key: 'losses', label: 'L' },
    { key: 'roomRating', label: 'Rating' },
    { key: 'totalAddedPoints', label: 'Net Pts' },
    { key: 'adjPoints', label: 'Adj Pts' },
  ];

  return (
    <div className='overflow-x-auto'>
      <Table>
        <TableHeader>
          <TableRow>
            {headers.map((h) => (
              <TableHead
                key={h.key}
                className='text-center text-xs font-bold uppercase'
              >
                {t(h.label)}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r: any) => (
            <TableRow
              key={r.userId}
              className={r.matchesPlayed === 0 ? 'opacity-50' : ''}
            >
              <TableCell className='text-center font-medium'>
                {r.place}
              </TableCell>
              <TableCell className='text-left font-medium'>{r.name}</TableCell>
              <TableCell className='text-center'>{r.matchesPlayed}</TableCell>
              <TableCell className='text-center text-green-600'>
                {r.wins}
              </TableCell>
              <TableCell className='text-center text-red-600'>
                {r.losses}
              </TableCell>
              <TableCell className='text-center'>
                {Math.round(r.roomRating)}
              </TableCell>
              <TableCell className='text-center text-muted-foreground'>
                {r.totalAddedPoints > 0 ? '+' : ''}
                {Math.round(r.totalAddedPoints)}
              </TableCell>
              <TableCell className='text-center font-bold text-lg text-primary'>
                {r.matchesPlayed > 0 ? r.adjPoints.toFixed(1) : '—'}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <div className='mt-4 p-4 bg-primary/5 rounded-lg border border-primary/10'>
        <h4 className='font-bold text-sm mb-2 flex items-center gap-2'>
          🏆 {t('How the Season Winner is decided')}
        </h4>
        <ul className='list-disc pl-5 space-y-1 text-xs text-muted-foreground'>
          <li>
            <strong>{t('Main Criteria')}:</strong>{' '}
            {t('Adjusted Points (Adj Pts)')}.
          </li>
          <li>
            <strong>{t('Formula')}:</strong>{' '}
            <code>(Rating - 1000) × √(Games / Average)</code>
          </li>
          <li>
            <strong>{t('Why?')}:</strong>{' '}
            {t(
              'This system rewards both skill AND activity. A player with a lower rating who plays a lot can beat a player with a higher rating who rarely plays.'
            )}
          </li>
        </ul>
      </div>
    </div>
  );
}

function FinalStandings({ season, sport, t }: any) {
  const data = useMemo(
    () => (Array.isArray(season?.summary) ? season.summary : []),
    [season]
  );

  if (!data.length) {
    return (
      <p className='text-muted-foreground text-center py-8'>
        {t('No finalized results found for this season.')}
      </p>
    );
  }

  return (
    <div className='overflow-x-auto'>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className='w-12 text-center'>#</TableHead>
            <TableHead>{t('Player')}</TableHead>
            <TableHead className='text-center'>{t('Games')}</TableHead>
            <TableHead className='text-center'>{t('W')}</TableHead>
            <TableHead className='text-center'>{t('L')}</TableHead>
            <TableHead className='text-center'>{t('Rating')}</TableHead>
            <TableHead className='text-center'>{t('Adj Pts')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((r: any) => (
            <TableRow key={r.userId}>
              <TableCell className='text-center font-bold text-lg'>
                {r.place === 1
                  ? '🥇'
                  : r.place === 2
                  ? '🥈'
                  : r.place === 3
                  ? '🥉'
                  : r.place}
              </TableCell>
              <TableCell className='font-medium'>
                <div className='flex flex-col'>
                  <span>{r.name}</span>
                  {r.longestWinStreak > 4 && (
                    <span className='text-[10px] text-green-600 flex items-center gap-1'>
                      🔥 {r.longestWinStreak} {t('streak')}
                    </span>
                  )}
                </div>
              </TableCell>
              <TableCell className='text-center'>{r.matchesPlayed}</TableCell>
              <TableCell className='text-center text-green-600'>
                {r.wins}
              </TableCell>
              <TableCell className='text-center text-red-600'>
                {r.losses}
              </TableCell>
              <TableCell className='text-center text-muted-foreground'>
                {Math.round(r.roomRating)}
              </TableCell>
              <TableCell className='text-center font-bold text-primary text-lg'>
                {r.adjPoints?.toFixed(1)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <div className='mt-4 text-center text-sm text-muted-foreground'>
        {t('Season finalized on')} {season.dateFinished}
      </div>
    </div>
  );
}
