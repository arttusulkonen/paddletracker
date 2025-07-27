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

export function StandingsTable({
  players,
  latestSeason,
  roomCreatorId,
}: StandingsTableProps) {
  const { t } = useTranslation();
  const { sport } = useSport();
  const [viewMode, setViewMode] = useState<'regular' | 'final'>(
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
      return factor * (a[key] - b[key]);
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
          {latestSeason && (
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
                variant={viewMode === 'final' ? 'default' : 'outline'}
                onClick={() => setViewMode('final')}
              >
                {t('Final')}
              </Button>
            </div>
          )}
        </div>
        <CardDescription>
          {viewMode === 'regular'
            ? t('Live season standings')
            : t('Season awards (final)')}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {viewMode === 'regular' ? (
          <RegularStandings
            players={sortedPlayers}
            onSort={handleSort}
            creatorId={roomCreatorId}
            sport={sport}
            t={t}
          />
        ) : (
          <FinalStandings season={latestSeason} sport={sport} t={t} />
        )}
        {/* The legend is now replaced by tooltips on each header */}
      </CardContent>
    </Card>
  );
}

// --- Sub-component for regular standings ---
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
    const pingPongSpecific = [
      {
        key: 'deltaRoom',
        label: 'Room Δ',
        isSortable: true,
        description:
          'The change in your Room Rating from the starting 1000 points. Example: If your rating is 1029, your Room Δ is +29.',
      },
      {
        key: 'globalDelta',
        label: 'Global Δ',
        isSortable: true,
        description:
          'The change in your overall global ELO rating since your first match in this season across all rooms.',
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
          'The average number of Room Rating points you gain or lose per game.',
      },
      {
        key: 'last5Form',
        label: 'Last 5 ←',
        isSortable: false,
        description: 'The result of your last five games (W=Win, L=Loss).',
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
      : common.concat(pingPongSpecific);
  }, [sport]);

  return (
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
              {sport === 'pingpong' ? (
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
                              mm.result === 'W' ? 'bg-green-500' : 'bg-red-500'
                            }`}
                            title={`${t(
                              mm.result === 'W' ? 'Win' : 'Loss'
                            )} ${t('vs')} ${mm.opponent} (${mm.score})`}
                          />
                        ))}
                    </div>
                  </TableCell>
                  <TableCell>
                    {p.ratingVisible ? p.longestWinStreak : '—'}
                  </TableCell>
                </>
              ) : (
                // Tennis
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
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </ScrollArea>
  );
}

// --- Sub-component for final standings ---
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
          'Your global ELO rating at the time of your first match in this season.',
      },
      {
        key: 'endGlobalElo',
        label: 'End Elo',
        description:
          'Your global ELO rating after your last match in this season.',
      },
      {
        key: 'eloDelta',
        label: 'Elo Δ',
        description:
          'The total change in your global ELO over the season (End Elo - Start Elo).',
      },
      {
        key: 'totalAddedPoints',
        label: 'Total Δ',
        description:
          "The sum of all ELO points won or lost specifically within this room's matches.",
      },
      {
        key: 'adjPoints',
        label: 'Adjusted Pts',
        description:
          "The main ranking metric. It's your 'Total Δ' adjusted by the number of games you played compared to the room average. This rewards both performance and activity.",
      },
    ],
    [sport]
  );

  if (!data.length) {
    return (
      <p className='text-muted-foreground text-center py-4'>
        {t('No final season data available.')}
      </p>
    );
  }

  return (
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
  );
}
