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
import { Flame, Info, ShieldCheck, Trophy } from 'lucide-react';
import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

type MiniMatch = { result: 'W' | 'L'; opponent: string; score: string };

interface StandingsTableProps {
  players: any[];
  latestSeason: any;
  roomCreatorId: string;
  roomMode?: 'professional' | 'arcade' | 'office' | 'derby';
}

type ViewMode = 'regular' | 'liveFinal' | 'final';

export function StandingsTable({
  players,
  latestSeason,
  roomCreatorId,
  roomMode = 'office',
}: StandingsTableProps) {
  const { t } = useTranslation();
  const { sport } = useSport();

  const [viewMode, setViewMode] = useState<ViewMode>(
    latestSeason ? 'final' : 'regular',
  );

  const activePlayers = useMemo(
    () => players.filter((p: any) => p.accountType !== 'coach'),
    [players],
  );

  const [sortConfig, setSortConfig] = useState<{
    key: string;
    dir: 'asc' | 'desc';
  }>({ key: 'rating', dir: 'desc' });

  const sortedPlayers = useMemo(() => {
    return [...activePlayers].sort((a: any, b: any) => {
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
  }, [activePlayers, sortConfig]);

  const handleSort = (key: string) => {
    setSortConfig((prev) => ({
      key,
      dir: prev.key === key && prev.dir === 'desc' ? 'asc' : 'desc',
    }));
  };

  const getDescription = () => {
    if (viewMode === 'liveFinal') {
      if (roomMode === 'professional')
        return t(
          'Projected Season Winner. Based on highest Rating (Strict ELO).',
        );
      if (roomMode === 'arcade')
        return t('Projected Season Winner. Based on Total Wins.');
      if (roomMode === 'derby')
        return t(
          'Projected Season Winner. Based on highest Rating (with Derby bonuses).',
        );
      return t(
        'Projected Season Winner. Calculated using "Adjusted Points" which rewards high activity.',
      );
    }

    if (viewMode === 'final')
      return t('Official results of the last finalized season.');

    if (roomMode === 'arcade')
      return t(
        'Arcade Standings: Just for fun! These stats do not affect global rank.',
      );
    if (roomMode === 'professional')
      return t(
        'Professional Standings: Serious business. Strict ELO rules apply.',
      );
    if (roomMode === 'derby')
      return t(
        'Derby Standings: Micro-league where streaks and rivalries swing the points.',
      );
    return t(
      'Office Standings: Casual competitive. Losses are slightly forgiven.',
    );
  };

  return (
    <Card className='shadow-2xl mb-12 border-0 rounded-[2rem] glass-panel overflow-hidden'>
      <CardHeader className='px-8 pt-8 pb-4'>
        <div className='flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6'>
          <CardTitle className='text-3xl font-extrabold tracking-tight'>
            {t('Standings')}
          </CardTitle>

          <div className='flex gap-2 bg-muted/30 p-1.5 rounded-2xl ring-1 ring-black/5 dark:ring-white/10 backdrop-blur-xl'>
            <Button
              size='sm'
              variant={viewMode === 'regular' ? 'default' : 'ghost'}
              onClick={() => setViewMode('regular')}
              className='rounded-xl px-4 font-semibold'
            >
              {t('Regular')}
            </Button>
            <Button
              size='sm'
              variant={viewMode === 'liveFinal' ? 'default' : 'ghost'}
              onClick={() => setViewMode('liveFinal')}
              className='rounded-xl px-4 font-semibold'
            >
              {t('Live Final')}
            </Button>
            {latestSeason && (
              <Button
                size='sm'
                variant={viewMode === 'final' ? 'default' : 'ghost'}
                onClick={() => setViewMode('final')}
                className='rounded-xl px-4 font-semibold'
              >
                {t('Final Results')}
              </Button>
            )}
          </div>
        </div>

        <CardDescription className='text-base text-muted-foreground font-light'>
          {getDescription()}
        </CardDescription>
      </CardHeader>

      <CardContent className='px-0 sm:px-8 pb-8'>
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
          <LiveFinalStandings
            players={activePlayers}
            t={t}
            roomMode={roomMode}
          />
        )}

        {viewMode === 'final' && (
          <FinalStandings season={latestSeason} t={t} roomMode={roomMode} />
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
  }, [sport]);

  return (
    <div className='overflow-x-auto'>
      <ScrollArea className='w-full whitespace-nowrap pb-4'>
        <Table>
          <TableHeader>
            <TableRow className='border-b-0 hover:bg-transparent'>
              <TableHead className='w-12 text-center text-[10px] uppercase tracking-widest font-bold text-muted-foreground'>
                #
              </TableHead>
              {headers.map((h) => (
                <TableHead
                  key={h.key}
                  className='text-[10px] uppercase tracking-widest font-bold text-muted-foreground'
                >
                  <TooltipProvider delayDuration={0}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div
                          className={`flex items-center gap-1.5 cursor-pointer hover:text-primary transition-colors ${
                            h.key === 'name'
                              ? 'justify-start'
                              : 'justify-center'
                          }`}
                          onClick={() => h.isSortable && onSort(h.key)}
                        >
                          <span>{t(h.label)}</span>
                          {h.description && (
                            <Info className='h-3 w-3 opacity-40' />
                          )}
                        </div>
                      </TooltipTrigger>
                      <TooltipContent className='glass-panel border-0'>
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
              <TableRow
                key={p.userId}
                className='hover:bg-muted/30 border-b-border/40 transition-colors'
              >
                <TableCell className='text-center font-mono text-muted-foreground'>
                  {i + 1}
                </TableCell>
                <TableCell>
                  <div className='flex flex-col'>
                    <div className='flex items-center gap-2'>
                      <a
                        href={`/profile/${p.userId}`}
                        className='hover:underline font-semibold text-base'
                      >
                        {p.name}
                      </a>
                      {p.userId === creatorId && (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <ShieldCheck className='h-3.5 w-3.5 text-primary' />
                            </TooltipTrigger>
                            <TooltipContent className='glass-panel border-0'>
                              <p>{t('Room Creator')}</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                    </div>
                    {/* Исправлен баг с "0", теперь проверяем на undefined явно и рендерим только если стрик >= 3 */}
                    {p.currentStreak !== undefined && p.currentStreak >= 3 && (
                      <div className='flex gap-1 mt-1'>
                        <span className='text-[9px] font-bold uppercase tracking-wider bg-orange-500/10 text-orange-600 px-1.5 py-0.5 rounded flex items-center gap-1'>
                          <Flame className='w-2.5 h-2.5 fill-current animate-pulse' />{' '}
                          {p.currentStreak}
                        </span>
                      </div>
                    )}
                  </div>
                </TableCell>
                <TableCell className='text-center font-black text-primary text-lg'>
                  {p.ratingVisible ? Math.round(p.rating) : '—'}
                </TableCell>

                {sport === 'tennis' ? (
                  <>
                    <TableCell className='text-center font-mono'>
                      {p.totalMatches}
                    </TableCell>
                    <TableCell className='text-center text-emerald-500 font-bold'>
                      {p.wins}
                    </TableCell>
                    <TableCell className='text-center text-red-500 font-bold'>
                      {p.losses}
                    </TableCell>
                    <TableCell className='text-center font-bold'>
                      {p.ratingVisible ? `${p.winPct}%` : '—'}
                    </TableCell>
                    <TableCell className='text-center font-mono'>
                      {p.aces ?? 0}
                    </TableCell>
                    <TableCell className='text-center font-mono'>
                      {p.doubleFaults ?? 0}
                    </TableCell>
                    <TableCell className='text-center font-mono'>
                      {p.winners ?? 0}
                    </TableCell>
                  </>
                ) : (
                  <>
                    <TableCell className='text-center text-sm font-semibold'>
                      {p.ratingVisible ? (
                        p.deltaRoom > 0 ? (
                          <span className='text-emerald-500'>
                            +{p.deltaRoom.toFixed(0)}
                          </span>
                        ) : (
                          <span className='text-red-500'>
                            {p.deltaRoom.toFixed(0)}
                          </span>
                        )
                      ) : (
                        <span className='text-muted-foreground'>—</span>
                      )}
                    </TableCell>
                    <TableCell className='text-center text-xs font-medium text-muted-foreground'>
                      {p.ratingVisible
                        ? p.globalDelta > 0
                          ? `+${p.globalDelta.toFixed(0)}`
                          : p.globalDelta.toFixed(0)
                        : '—'}
                    </TableCell>
                    <TableCell className='text-center font-mono'>
                      {p.totalMatches}
                    </TableCell>
                    <TableCell className='text-center font-bold text-emerald-500'>
                      {p.wins}
                    </TableCell>
                    <TableCell className='text-center font-bold text-red-500'>
                      {p.losses}
                    </TableCell>
                    <TableCell className='text-center font-black'>
                      {p.ratingVisible ? `${p.winPct}%` : '—'}
                    </TableCell>
                    <TableCell className='text-center font-mono text-xs'>
                      {p.ratingVisible ? p.avgPtsPerMatch.toFixed(1) : '—'}
                    </TableCell>
                    <TableCell className='text-center'>
                      <div className='flex gap-1 justify-center'>
                        {(p.last5Form || [])
                          .slice()
                          .reverse()
                          .map((mm: MiniMatch, idx: number) => (
                            <div
                              key={idx}
                              className={`w-2.5 h-2.5 rounded-full shadow-sm ${
                                mm.result === 'W'
                                  ? 'bg-emerald-500'
                                  : 'bg-red-500'
                              }`}
                              title={`${
                                mm.result === 'W' ? 'Win' : 'Loss'
                              } vs ${mm.opponent}`}
                            />
                          ))}
                      </div>
                    </TableCell>
                    <TableCell className='text-center font-bold text-muted-foreground'>
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

function LiveFinalStandings({ players, t, roomMode }: any) {
  const rows = useMemo(() => {
    const base = players.map((p: any) => {
      const matchesPlayed = Number(
        typeof p.totalMatches === 'number'
          ? p.totalMatches
          : (p.wins ?? 0) + (p.losses ?? 0),
      );
      const roomRating = Number(p.rating ?? 1000);

      let totalAddedPoints = 0;

      if (matchesPlayed === 0) {
        totalAddedPoints = 0;
      } else if (typeof p.deltaRoom === 'number') {
        totalAddedPoints = p.deltaRoom;
      } else {
        totalAddedPoints = roomRating - 1000;
      }

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
      0,
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
      const aPlayed = a.matchesPlayed > 0;
      const bPlayed = b.matchesPlayed > 0;
      if (aPlayed !== bPlayed) return aPlayed ? -1 : 1;

      if (roomMode === 'professional' || roomMode === 'derby') {
        if (b.roomRating !== a.roomRating) return b.roomRating - a.roomRating;
        if (b.winRate !== a.winRate) return b.winRate - a.winRate;
        return b.wins - a.wins;
      } else if (roomMode === 'arcade') {
        if (b.wins !== a.wins) return b.wins - a.wins;
        if (b.winRate !== a.winRate) return b.winRate - a.winRate;
        return b.matchesPlayed - a.matchesPlayed;
      } else {
        if (b.adjPoints !== a.adjPoints) return b.adjPoints - a.adjPoints;
        if (b.roomRating !== a.roomRating) return b.roomRating - a.roomRating;
        return b.winRate - a.winRate;
      }
    });

    return withAdj.map((r: any, i: number) => ({ ...r, place: i + 1 }));
  }, [players, roomMode]);

  const headers = [
    { key: 'place', label: 'Rank' },
    { key: 'name', label: 'Player' },
    { key: 'matchesPlayed', label: 'Games' },
    { key: 'wins', label: 'W' },
    { key: 'losses', label: 'L' },
    { key: 'roomRating', label: 'Rating' },
    { key: 'totalAddedPoints', label: 'Net Pts' },
    ...(roomMode === 'office' ? [{ key: 'adjPoints', label: 'Adj Pts' }] : []),
  ];

  return (
    <div className='overflow-x-auto'>
      <Table>
        <TableHeader>
          <TableRow className='border-b-0 hover:bg-transparent'>
            {headers.map((h) => (
              <TableHead
                key={h.key}
                className='text-center text-[10px] uppercase tracking-widest font-bold text-muted-foreground'
              >
                {t(h.label)}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r: any, index: number) => (
            <TableRow
              key={r.userId}
              className={`border-b-border/40 hover:bg-muted/30 transition-colors ${r.matchesPlayed === 0 ? 'opacity-50' : ''}`}
            >
              <TableCell className='text-center'>
                <div
                  className={`font-mono font-bold w-6 h-6 mx-auto flex items-center justify-center rounded-full ${index === 0 ? 'bg-yellow-500/20 text-yellow-600' : index === 1 ? 'bg-slate-300/30 text-slate-500' : index === 2 ? 'bg-amber-600/20 text-amber-700' : 'text-muted-foreground'}`}
                >
                  {r.place}
                </div>
              </TableCell>
              <TableCell className='text-left font-semibold text-base'>
                {r.name}
              </TableCell>
              <TableCell className='text-center font-mono'>
                {r.matchesPlayed}
              </TableCell>
              <TableCell className='text-center font-bold text-emerald-500'>
                {r.wins}
              </TableCell>
              <TableCell className='text-center font-bold text-red-500'>
                {r.losses}
              </TableCell>
              <TableCell
                className={`text-center ${
                  roomMode === 'professional' || roomMode === 'derby'
                    ? 'font-black text-primary text-xl'
                    : 'font-medium'
                }`}
              >
                {Math.round(r.roomRating)}
              </TableCell>
              <TableCell className='text-center font-semibold text-muted-foreground'>
                {r.totalAddedPoints > 0 ? (
                  <span className='text-emerald-500'>
                    +{Math.round(r.totalAddedPoints)}
                  </span>
                ) : (
                  <span className='text-red-500'>
                    {Math.round(r.totalAddedPoints)}
                  </span>
                )}
              </TableCell>

              {roomMode === 'office' && (
                <TableCell className='text-center font-black text-primary text-xl'>
                  {r.matchesPlayed > 0 ? r.adjPoints.toFixed(1) : '—'}
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <div className='mt-8 p-5 bg-background/50 rounded-[1.5rem] border-0 ring-1 ring-black/5 dark:ring-white/10 shadow-inner'>
        <h4 className='font-bold text-sm mb-3 flex items-center gap-2 tracking-wide'>
          <Trophy className='w-4 h-4 text-primary' />
          {t('How the Season Winner is decided')}
        </h4>

        {roomMode === 'professional' ? (
          <ul className='list-none space-y-2 text-sm text-muted-foreground font-light'>
            <li className='flex gap-2'>
              <span className='text-primary font-bold'>•</span>{' '}
              <span>
                <strong>{t('Main Criteria')}:</strong>{' '}
                {t('Highest Room Rating')}.
              </span>
            </li>
            <li className='flex gap-2'>
              <span className='text-primary font-bold'>•</span>{' '}
              <span>
                <strong>{t('Tie-breakers')}:</strong> {t('Win Rate')} &rarr;{' '}
                {t('Total Wins')}.
              </span>
            </li>
            <li className='flex gap-2'>
              <span className='text-primary font-bold'>•</span>{' '}
              <span>
                <strong>{t('Why?')}:</strong>{' '}
                {t(
                  'Standard competitive rules. The highest ELO takes the crown.',
                )}
              </span>
            </li>
          </ul>
        ) : roomMode === 'derby' ? (
          <ul className='list-none space-y-2 text-sm text-muted-foreground font-light'>
            <li className='flex gap-2'>
              <span className='text-primary font-bold'>•</span>{' '}
              <span>
                <strong>{t('Main Criteria')}:</strong>{' '}
                {t('Highest Room Rating')}.
              </span>
            </li>
            <li className='flex gap-2'>
              <span className='text-primary font-bold'>•</span>{' '}
              <span>
                <strong>{t('Points Engine')}:</strong>{' '}
                {t(
                  'Breaking win streaks (Bounties) and beating your historical nemesis grant massive multipliers.',
                )}
              </span>
            </li>
            <li className='flex gap-2'>
              <span className='text-primary font-bold'>•</span>{' '}
              <span>
                <strong>{t('Tie-breakers')}:</strong> {t('Win Rate')} &rarr;{' '}
                {t('Total Wins')}.
              </span>
            </li>
          </ul>
        ) : roomMode === 'arcade' ? (
          <ul className='list-none space-y-2 text-sm text-muted-foreground font-light'>
            <li className='flex gap-2'>
              <span className='text-primary font-bold'>•</span>{' '}
              <span>
                <strong>{t('Main Criteria')}:</strong> {t('Most Wins')}.
              </span>
            </li>
            <li className='flex gap-2'>
              <span className='text-primary font-bold'>•</span>{' '}
              <span>
                <strong>{t('Tie-breakers')}:</strong> {t('Win Rate')} &rarr;{' '}
                {t('Total Games')}.
              </span>
            </li>
            <li className='flex gap-2'>
              <span className='text-primary font-bold'>•</span>{' '}
              <span>
                <strong>{t('Why?')}:</strong>{' '}
                {t(
                  'Arcade mode is about playing a lot and winning a lot. Rating is secondary.',
                )}
              </span>
            </li>
          </ul>
        ) : (
          <ul className='list-none space-y-2 text-sm text-muted-foreground font-light'>
            <li className='flex gap-2'>
              <span className='text-primary font-bold'>•</span>{' '}
              <span>
                <strong>{t('Main Criteria')}:</strong>{' '}
                {t('Adjusted Points (Adj Pts)')}.
              </span>
            </li>
            <li className='flex gap-2'>
              <span className='text-primary font-bold'>•</span>{' '}
              <span>
                <strong>{t('Formula')}:</strong>{' '}
                <code className='bg-muted px-1.5 py-0.5 rounded text-xs text-foreground font-mono'>
                  (Rating - 1000) × √(Games / Average)
                </code>
              </span>
            </li>
            <li className='flex gap-2'>
              <span className='text-primary font-bold'>•</span>{' '}
              <span>
                <strong>{t('Why?')}:</strong>{' '}
                {t(
                  'This system rewards both skill AND activity. A player with a lower rating who plays a lot can beat a player with a higher rating who rarely plays.',
                )}
              </span>
            </li>
          </ul>
        )}
      </div>
    </div>
  );
}

function FinalStandings({ season, t, roomMode }: any) {
  const data = useMemo(() => {
    const summary = Array.isArray(season?.summary) ? season.summary : [];
    return summary;
  }, [season]);

  if (!data.length) {
    return (
      <p className='text-muted-foreground text-center py-10 font-light'>
        {t('No finalized results found for this season.')}
      </p>
    );
  }

  return (
    <div className='overflow-x-auto'>
      <Table>
        <TableHeader>
          <TableRow className='border-b-0 hover:bg-transparent'>
            <TableHead className='w-12 text-center text-[10px] uppercase tracking-widest font-bold text-muted-foreground'>
              #
            </TableHead>
            <TableHead className='text-[10px] uppercase tracking-widest font-bold text-muted-foreground'>
              {t('Player')}
            </TableHead>
            <TableHead className='text-center text-[10px] uppercase tracking-widest font-bold text-muted-foreground'>
              {t('Games')}
            </TableHead>
            <TableHead className='text-center text-[10px] uppercase tracking-widest font-bold text-muted-foreground'>
              {t('W')}
            </TableHead>
            <TableHead className='text-center text-[10px] uppercase tracking-widest font-bold text-muted-foreground'>
              {t('L')}
            </TableHead>
            <TableHead className='text-center text-[10px] uppercase tracking-widest font-bold text-muted-foreground'>
              {t('Rating')}
            </TableHead>
            {roomMode === 'office' && (
              <TableHead className='text-center text-[10px] uppercase tracking-widest font-bold text-muted-foreground'>
                {t('Adj Pts')}
              </TableHead>
            )}
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((r: any) => (
            <TableRow
              key={r.userId}
              className='border-b-border/40 hover:bg-muted/30 transition-colors'
            >
              <TableCell className='text-center text-2xl'>
                {r.place === 1 ? (
                  '🥇'
                ) : r.place === 2 ? (
                  '🥈'
                ) : r.place === 3 ? (
                  '🥉'
                ) : (
                  <span className='text-base font-mono font-bold text-muted-foreground'>
                    {r.place}
                  </span>
                )}
              </TableCell>
              <TableCell className='font-semibold text-base'>
                <div className='flex flex-col'>
                  <span>{r.name}</span>
                  {r.longestWinStreak > 4 && (
                    <span className='text-[9px] font-bold uppercase tracking-wider text-orange-600 bg-orange-500/10 px-1.5 py-0.5 rounded w-fit mt-1 flex items-center gap-1'>
                      <Flame className='w-2.5 h-2.5 fill-current animate-pulse' />{' '}
                      {r.longestWinStreak} {t('streak')}
                    </span>
                  )}
                </div>
              </TableCell>
              <TableCell className='text-center font-mono'>
                {r.matchesPlayed}
              </TableCell>
              <TableCell className='text-center font-bold text-emerald-500'>
                {r.wins}
              </TableCell>
              <TableCell className='text-center font-bold text-red-500'>
                {r.losses}
              </TableCell>
              <TableCell
                className={`text-center ${
                  roomMode === 'professional' || roomMode === 'derby'
                    ? 'font-black text-xl text-primary'
                    : 'font-medium'
                }`}
              >
                {Math.round(r.roomRating)}
              </TableCell>
              {roomMode === 'office' && (
                <TableCell className='text-center font-black text-primary text-xl'>
                  {r.adjPoints?.toFixed(1)}
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <div className='mt-8 text-center text-xs font-semibold text-muted-foreground uppercase tracking-widest bg-muted/30 w-fit mx-auto px-4 py-2 rounded-full'>
        {t('Season finalized on')} {season.dateFinished}
      </div>
    </div>
  );
}
