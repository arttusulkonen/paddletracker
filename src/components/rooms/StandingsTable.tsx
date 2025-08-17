// src/components/rooms/StandingsTable.tsx
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
      if (key === 'winPct')
        return factor * (parseFloat(a.winPct) - parseFloat(b.winPct));
      if (['name'].includes(key)) return factor * a.name.localeCompare(b.name);
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

          <div className='flex gap-2'>
            <Button
              size='sm'
              variant={viewMode === 'regular' ? 'default' : 'outline'}
              onClick={() => setViewMode('regular')}
            >
              {t('Regular')}
            </Button>
            <Button
              size='sm'
              variant={viewMode === 'liveFinal' ? 'default' : 'outline'}
              onClick={() => setViewMode('liveFinal')}
            >
              {t('Live Final')}
            </Button>
            {latestSeason && (
              <Button
                size='sm'
                variant={viewMode === 'final' ? 'default' : 'outline'}
                onClick={() => setViewMode('final')}
              >
                {t('Final')}
              </Button>
            )}
          </div>
        </div>

        <CardDescription>
          {viewMode === 'regular'
            ? t('Live season standings')
            : viewMode === 'liveFinal'
            ? t(
                'Preview of final standings calculated right now, using adjusted points (performance × activity).'
              )
            : t('Season awards (final)')}
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
          'Your ELO rating calculated only from matches within this room. Everyone starts at 1000.',
      },
    ];
    const rallyGameSpecific = [
      {
        key: 'deltaRoom',
        label: 'Room Δ',
        isSortable: true,
        description:
          'Change in Room Rating from the starting 1000 points. Example: rating 1029 ⇒ Room Δ +29.',
      },
      {
        key: 'globalDelta',
        label: 'Global Δ',
        isSortable: true,
        description:
          'Change in overall global ELO since your first match in this season across all rooms.',
      },
      {
        key: 'totalMatches',
        label: 'Games',
        isSortable: true,
        description:
          "Total number of games you've played this season in this room.",
      },
      {
        key: 'wins',
        label: 'Wins',
        isSortable: true,
        description: 'Total wins this season.',
      },
      {
        key: 'losses',
        label: 'Losses',
        isSortable: true,
        description: 'Total losses this season.',
      },
      {
        key: 'winPct',
        label: 'Win %',
        isSortable: true,
        description:
          'Percentage of games won. Calculated as (Wins / Total Games) * 100.',
      },
      {
        key: 'avgPtsPerMatch',
        label: 'Avg Δ / Game',
        isSortable: true,
        description:
          'Average change in Room Rating per game during this season.',
      },
      {
        key: 'last5Form',
        label: 'Last 5 ←',
        isSortable: false,
        description: 'Result of your last five games (W=Win, L=Loss).',
      },
      {
        key: 'longestWinStreak',
        label: 'Best Streak',
        isSortable: true,
        description: 'Your longest consecutive winning streak this season.',
      },
    ];
    const tennisSpecific = [
      {
        key: 'totalMatches',
        label: 'Sets',
        isSortable: true,
        description:
          "Total number of sets you've played this season in this room.",
      },
      {
        key: 'wins',
        label: 'Wins',
        isSortable: true,
        description: 'Total sets won this season.',
      },
      {
        key: 'losses',
        label: 'Losses',
        isSortable: true,
        description: 'Total sets lost this season.',
      },
      {
        key: 'winPct',
        label: 'Win %',
        isSortable: true,
        description:
          'Percentage of sets won. Calculated as (Wins / Total Sets) * 100.',
      },
      {
        key: 'aces',
        label: 'Aces',
        isSortable: true,
        description: 'Serves that result directly in a point.',
      },
      {
        key: 'doubleFaults',
        label: 'DF',
        isSortable: true,
        description:
          'Two consecutive faults during a serve, resulting in the loss of the point.',
      },
      {
        key: 'winners',
        label: 'Winners',
        isSortable: true,
        description:
          'Shots that win the point outright, without the opponent touching the ball.',
      },
    ];

    return sport === 'tennis'
      ? [...common, ...tennisSpecific]
      : common.concat(rallyGameSpecific);
  }, [sport, t]);

  return (
    <div className='overflow-x-auto'>
      <ScrollArea>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>#</TableHead>
              {headers.map((h) => (
                <TableHead key={h.key}>
                  <TooltipProvider delayDuration={100}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div
                          className='flex items-center gap-1 cursor-pointer'
                          onClick={() => h.isSortable && onSort(h.key)}
                        >
                          <span>{t(h.label)}</span>
                          <Info className='h-3 w-3 text-muted-foreground' />
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className='max-w-xs'>{t(h.description)}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {players.map((p: any, i: number) => (
              <TableRow key={p.userId}>
                <TableCell>{i + 1}</TableCell>
                <TableCell>
                  <a
                    href={`/profile/${p.userId}`}
                    className='hover:underline flex items-center gap-2'
                  >
                    {p.name}
                    {p.userId === creatorId && (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <ShieldCheck className='h-4 w-4 text-primary' />
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>{t('Room Creator')}</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )}
                  </a>
                </TableCell>
                <TableCell>{p.ratingVisible ? p.rating : '—'}</TableCell>

                {sport === 'tennis' ? (
                  <>
                    <TableCell>{p.totalMatches}</TableCell>
                    <TableCell>{p.wins}</TableCell>
                    <TableCell>{p.losses}</TableCell>
                    <TableCell>
                      {p.ratingVisible ? `${p.winPct}%` : '—'}
                    </TableCell>
                    <TableCell>{p.aces ?? 0}</TableCell>
                    <TableCell>{p.doubleFaults ?? 0}</TableCell>
                    <TableCell>{p.winners ?? 0}</TableCell>
                  </>
                ) : (
                  <>
                    <TableCell>
                      {p.ratingVisible ? p.deltaRoom.toFixed(0) : '—'}
                    </TableCell>
                    <TableCell>
                      {p.ratingVisible ? p.globalDelta.toFixed(0) : '—'}
                    </TableCell>
                    <TableCell>{p.totalMatches}</TableCell>
                    <TableCell>{p.wins}</TableCell>
                    <TableCell>{p.losses}</TableCell>
                    <TableCell>
                      {p.ratingVisible ? `${p.winPct}%` : '—'}
                    </TableCell>
                    <TableCell>
                      {p.ratingVisible ? p.avgPtsPerMatch.toFixed(2) : '—'}
                    </TableCell>
                    <TableCell>
                      <div className='flex gap-1'>
                        {(p.last5Form || [])
                          .slice()
                          .reverse()
                          .map((mm: MiniMatch, idx: number) => (
                            <span
                              key={idx}
                              className={`inline-block w-2 h-2 rounded-full ${
                                mm.result === 'W'
                                  ? 'bg-green-500'
                                  : 'bg-red-500'
                              }`}
                              title={t(
                                '{{result}} vs {{opponent}} ({{score}})',
                                {
                                  result:
                                    mm.result === 'W' ? t('Win') : t('Loss'),
                                  opponent: mm.opponent,
                                  score: mm.score,
                                }
                              )}
                            />
                          ))}
                      </div>
                    </TableCell>
                    <TableCell>
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
      return {
        userId: p.userId,
        name: p.name,
        matchesPlayed,
        wins: Number(p.wins ?? 0),
        losses: Number(p.losses ?? 0),
        winRate:
          matchesPlayed > 0 ? (Number(p.wins ?? 0) / matchesPlayed) * 100 : 0,
        totalAddedPoints: Number(p.deltaRoom ?? 0),
        longestWinStreak: Number(p.longestWinStreak ?? 0),
        roomRating: Number(p.rating ?? 1000),
      };
    });

    const avgM =
      base.reduce((sum: number, r: any) => sum + (r.matchesPlayed || 0), 0) /
        (base.length || 1) || 0.000001;

    const adjFactor = (ratio: number) => {
      if (!isFinite(ratio) || ratio <= 0) return 0;
      return Math.sqrt(ratio);
    };

    const withAdj = base.map((r: any) => ({
      ...r,
      adjPoints: r.totalAddedPoints * adjFactor(r.matchesPlayed / avgM),
    }));

    withAdj.sort(
      (a: any, b: any) =>
        b.adjPoints - a.adjPoints ||
        b.totalAddedPoints - a.totalAddedPoints ||
        b.wins - a.wins ||
        a.losses - b.losses ||
        b.longestWinStreak - a.longestWinStreak
    );

    return withAdj.map((r: any, i: number) => ({ ...r, place: i + 1 }));
  }, [players]);

  const headers = useMemo(
    () => [
      {
        key: 'place',
        label: 'Rank',
        description:
          'Live preview ranking if the season were finalized right now.',
      },
      {
        key: 'name',
        label: 'Player',
        description: "The player's display name.",
      },
      {
        key: 'matchesPlayed',
        label: sport === 'tennis' ? 'Sets' : 'Games',
        description:
          'Total number of games (or sets) played so far in this season.',
      },
      {
        key: 'wins',
        label: 'Wins',
        description: 'Wins so far.',
      },
      {
        key: 'losses',
        label: 'Losses',
        description: 'Losses so far.',
      },
      {
        key: 'winRate',
        label: 'Win %',
        description:
          'Percentage of games won so far. (Wins / Total Games) * 100.',
      },
      {
        key: 'longestWinStreak',
        label: 'Best Streak',
        description: 'Longest consecutive win streak so far.',
      },
      {
        key: 'roomRating',
        label: 'Room Rating',
        description:
          'Current Room Rating based only on this room matches (starts at 1000).',
      },
      {
        key: 'totalAddedPoints',
        label: 'Total Δ',
        description:
          'Sum of changes in Room Rating since 1000 in this season (equivalent to Room Δ).',
      },
      {
        key: 'adjPoints',
        label: 'Adjusted Pts',
        description:
          'Adjusted total that balances performance and activity: Total Δ × √(your games / room average).',
      },
    ],
    [sport, t]
  );

  return (
    <div className='overflow-x-auto'>
      <ScrollArea>
        <Table>
          <TableHeader>
            <TableRow>
              {headers.map((h) => (
                <TableHead key={h.key}>
                  <TooltipProvider delayDuration={100}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className='flex items-center gap-1'>
                          <span>{t(h.label)}</span>
                          <Info className='h-3 w-3 text-muted-foreground' />
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className='max-w-xs'>{t(h.description)}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r: any) => (
              <TableRow key={r.userId}>
                <TableCell>{r.place}</TableCell>
                <TableCell>
                  <a href={`/profile/${r.userId}`} className='hover:underline'>
                    {r.name}
                  </a>
                </TableCell>
                <TableCell>{r.matchesPlayed}</TableCell>
                <TableCell>{r.wins}</TableCell>
                <TableCell>{r.losses}</TableCell>
                <TableCell>{r.winRate.toFixed(1)}%</TableCell>
                <TableCell>{r.longestWinStreak ?? '—'}</TableCell>
                <TableCell>{r.roomRating?.toFixed(0) ?? '—'}</TableCell>
                <TableCell>{r.totalAddedPoints?.toFixed(0) ?? '—'}</TableCell>
                <TableCell>{r.adjPoints?.toFixed(2) ?? '—'}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </ScrollArea>

      <p className='text-xs text-muted-foreground mt-3'>
        {t(
          "Live Final is a preview of final standings if the season ended right now. It uses the same 'Adjusted Pts' formula as at season close: Total Δ × √(your games / room average). This prevents very low-activity players from winning only due to a perfect small sample."
        )}
      </p>
    </div>
  );
}

function FinalStandings({ season, sport, t }: any) {
  const data = useMemo(
    () => (Array.isArray(season?.summary) ? season.summary : []),
    [season]
  );

  const headers = useMemo(
    () => [
      {
        key: 'place',
        label: 'Rank',
        description: 'Your final ranking for the season.',
      },
      {
        key: 'name',
        label: 'Player',
        description: "The player's display name.",
      },
      {
        key: 'matchesPlayed',
        label: sport === 'tennis' ? 'Sets' : 'Games',
        description:
          'Total number of games (or sets) played by the player during the season.',
      },
      {
        key: 'wins',
        label: 'Wins',
        description: 'Total number of wins during the season.',
      },
      {
        key: 'losses',
        label: 'Losses',
        description: 'Total number of losses during the season.',
      },
      {
        key: 'winRate',
        label: 'Win %',
        description:
          'Percentage of games won. Calculated as (Wins / Total Games) * 100.',
      },
      {
        key: 'longestWinStreak',
        label: 'Best Streak',
        description:
          'The longest consecutive winning streak during the season.',
      },
      {
        key: 'startGlobalElo',
        label: 'Start Elo',
        description:
          'Global ELO at the time of the first match in this season.',
      },
      {
        key: 'endGlobalElo',
        label: 'End Elo',
        description: 'Global ELO after the last match in this season.',
      },
      {
        key: 'eloDelta',
        label: 'Elo Δ',
        description:
          'Total change in global ELO over the season (End Elo - Start Elo).',
      },
      {
        key: 'totalAddedPoints',
        label: 'Total Δ',
        description:
          "Sum of ELO points won or lost specifically within this room's matches.",
      },
      {
        key: 'adjPoints',
        label: 'Adjusted Pts',
        description:
          'Main ranking metric at season close: Total Δ adjusted by the number of games vs room average.',
      },
    ],
    [sport, t]
  );

  if (!data.length) {
    return (
      <p className='text-muted-foreground text-center py-4'>
        {t('No final season data available.')}
      </p>
    );
  }

  return (
    <div className='overflow-x-auto'>
      <ScrollArea>
        <Table>
          <TableHeader>
            <TableRow>
              {headers.map((h) => (
                <TableHead key={h.key}>
                  <TooltipProvider delayDuration={100}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className='flex items-center gap-1'>
                          <span>{t(h.label)}</span>
                          <Info className='h-3 w-3 text-muted-foreground' />
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className='max-w-xs'>{t(h.description)}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((r: any) => (
              <TableRow key={r.userId}>
                <TableCell>{r.place}</TableCell>
                <TableCell>
                  <a href={`/profile/${r.userId}`} className='hover:underline'>
                    {r.name}
                  </a>
                </TableCell>
                <TableCell>{r.matchesPlayed}</TableCell>
                <TableCell>{r.wins}</TableCell>
                <TableCell>{r.losses}</TableCell>
                <TableCell>{(r.winRate ?? 0).toFixed(1)}%</TableCell>
                <TableCell>{r.longestWinStreak ?? '—'}</TableCell>
                <TableCell>{r.startGlobalElo?.toFixed(0) ?? '—'}</TableCell>
                <TableCell>{r.endGlobalElo?.toFixed(0) ?? '—'}</TableCell>
                <TableCell>
                  {(r.endGlobalElo - r.startGlobalElo).toFixed(0)}
                </TableCell>
                <TableCell>{r.totalAddedPoints?.toFixed(2) ?? '—'}</TableCell>
                <TableCell>{r.adjPoints?.toFixed(2) ?? '—'}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </ScrollArea>
    </div>
  );
}
