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
import {
	Flame,
	Info,
	LayoutDashboard,
	ShieldCheck,
	Trophy,
} from 'lucide-react';
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
    latestSeason ? 'final' : 'liveFinal',
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
        return (
          factor * (parseFloat(a.winPct ?? '0') - parseFloat(b.winPct ?? '0'))
        );
      }
      if (key === 'name') {
        return factor * (a.name || '').localeCompare(b.name || '');
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
    <Card className='shadow-sm mb-8 border-0 rounded-2xl glass-panel overflow-hidden'>
      <CardHeader className='px-6 pt-6 pb-4 border-b border-border/40 bg-muted/5'>
        <div className='flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4'>
          <CardTitle className='text-lg font-extrabold tracking-tight flex items-center gap-2'>
            <div className='bg-primary/10 p-1.5 rounded-lg'>
              <LayoutDashboard className='text-primary h-4 w-4 hidden' />
            </div>
            {t('Standings')}
          </CardTitle>

          <div className='flex gap-1.5 bg-background/50 p-1 rounded-xl ring-1 ring-black/5 dark:ring-white/10 backdrop-blur-xl'>
            <Button
              size='sm'
              variant={viewMode === 'liveFinal' ? 'default' : 'ghost'}
              onClick={() => setViewMode('liveFinal')}
              className={`h-7 rounded-lg px-3 text-xs font-semibold ${viewMode === 'liveFinal' ? 'bg-green-500/15 text-green-700 dark:text-green-400 hover:bg-green-500/25 shadow-none' : ''}`}
            >
              <span className='inline-flex items-center gap-1.5'>
                {viewMode === 'liveFinal' && (
                  <span className='inline-block h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse' />
                )}
                {t('Live Final')}
              </span>
            </Button>
            <Button
              size='sm'
              variant={viewMode === 'regular' ? 'default' : 'ghost'}
              onClick={() => setViewMode('regular')}
              className='h-7 rounded-lg px-3 text-xs font-semibold shadow-none'
            >
              {t('Regular')}
            </Button>
            {latestSeason && (
              <Button
                size='sm'
                variant={viewMode === 'final' ? 'default' : 'ghost'}
                onClick={() => setViewMode('final')}
                className='h-7 rounded-lg px-3 text-xs font-semibold shadow-none'
              >
                {t('Final Results')}
              </Button>
            )}
          </div>
        </div>

        <CardDescription className='text-xs text-muted-foreground font-light mt-1'>
          {getDescription()}
        </CardDescription>
      </CardHeader>

      <CardContent className='p-0'>
        {viewMode === 'liveFinal' && (
          <LiveFinalStandings
            players={activePlayers}
            t={t}
            roomMode={roomMode}
          />
        )}

        {viewMode === 'regular' && (
          <RegularStandings
            players={sortedPlayers}
            onSort={handleSort}
            creatorId={roomCreatorId}
            sport={sport}
            roomMode={roomMode}
            t={t}
          />
        )}

        {viewMode === 'final' && (
          <FinalStandings season={latestSeason} t={t} roomMode={roomMode} />
        )}
      </CardContent>
    </Card>
  );
}

function LiveFinalStandings({ players, t, roomMode }: any) {
  const rows = useMemo(() => {
    const activePlayers = players.filter((p: any) => (p.totalMatches ?? 0) > 0);

    const sorted = [...activePlayers].sort((a: any, b: any) => {
      if (roomMode === 'professional' || roomMode === 'derby') {
        if (b.rating !== a.rating) return (b.rating ?? 0) - (a.rating ?? 0);
        const bWin = parseFloat(b.winPct ?? '0');
        const aWin = parseFloat(a.winPct ?? '0');
        if (bWin !== aWin) return bWin - aWin;
        return (b.wins ?? 0) - (a.wins ?? 0);
      } else if (roomMode === 'arcade') {
        if (b.wins !== a.wins) return (b.wins ?? 0) - (a.wins ?? 0);
        const bWin = parseFloat(b.winPct ?? '0');
        const aWin = parseFloat(a.winPct ?? '0');
        if (bWin !== aWin) return bWin - aWin;
        return (b.totalMatches ?? 0) - (a.totalMatches ?? 0);
      } else {
        if (b.adjPointsLive !== a.adjPointsLive)
          return (b.adjPointsLive ?? 0) - (a.adjPointsLive ?? 0);
        if (b.rating !== a.rating) return (b.rating ?? 0) - (a.rating ?? 0);
        const bWin = parseFloat(b.winPct ?? '0');
        const aWin = parseFloat(a.winPct ?? '0');
        return bWin - aWin;
      }
    });

    return sorted.map((r: any, i: number) => ({ ...r, place: i + 1 }));
  }, [players, roomMode]);

  const headers = [
    { key: 'place', label: 'Rank' },
    { key: 'name', label: 'Player' },
    { key: 'totalMatches', label: 'Games' },
    { key: 'wins', label: 'W' },
    { key: 'losses', label: 'L' },
    { key: 'rating', label: 'Room ELO' },
    ...(roomMode !== 'professional'
      ? [{ key: 'adjPointsLive', label: 'Adj Pts' }]
      : []),
    { key: 'globalElo', label: 'Global ELO' },
  ];

  return (
    <div className='overflow-x-auto'>
      <ScrollArea className='w-full max-h-[500px]'>
        <Table>
          <TableHeader className='bg-muted/5 sticky top-0 z-10 backdrop-blur-sm'>
            <TableRow className='border-b border-border/50 hover:bg-transparent'>
              {headers.map((h) => (
                <TableHead
                  key={h.key}
                  className={`py-2 px-3 h-auto text-[9px] uppercase tracking-widest font-bold text-muted-foreground ${h.key === 'name' ? 'text-left' : 'text-center'}`}
                >
                  {t(h.label)}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r: any, index: number) => {
              const isLeader = index === 0;
              return (
                <TableRow
                  key={r.userId}
                  className={`border-b border-border/40 transition-colors hover:bg-muted/30 ${isLeader && roomMode === 'derby' ? 'bg-red-500/5 hover:bg-red-500/10 border-l-2 border-l-red-500' : ''}`}
                >
                  <TableCell className='text-center py-2 px-3'>
                    <div
                      className={`font-mono font-bold w-5 h-5 mx-auto flex items-center justify-center rounded-full text-xs ${index === 0 ? 'bg-yellow-500/20 text-yellow-600' : index === 1 ? 'bg-slate-300/30 text-slate-500' : index === 2 ? 'bg-amber-600/20 text-amber-700' : 'text-muted-foreground'}`}
                    >
                      {r.place}
                    </div>
                  </TableCell>
                  <TableCell className='text-left py-2 px-3 font-semibold text-sm'>
                    <div className='flex items-center gap-2'>
                      <span className='truncate'>{r.name}</span>
                      {r.currentStreak >= 3 && (
                        <span className='text-[8px] font-bold uppercase tracking-wider bg-orange-500/10 text-orange-600 px-1.5 py-0.5 rounded flex items-center gap-0.5 shrink-0'>
                          <Flame className='w-2.5 h-2.5 fill-current animate-pulse' />{' '}
                          {r.currentStreak}
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className='text-center py-2 px-3 font-mono text-xs'>
                    {r.totalMatches ?? 0}
                  </TableCell>
                  <TableCell className='text-center py-2 px-3 font-bold text-emerald-500 text-xs'>
                    {r.wins ?? 0}
                  </TableCell>
                  <TableCell className='text-center py-2 px-3 font-bold text-red-500 text-xs'>
                    {r.losses ?? 0}
                  </TableCell>

                  <TableCell className='text-center py-2 px-3'>
                    <div className='flex flex-col items-center justify-center'>
                      <span
                        className={`font-black text-sm ${roomMode === 'professional' || roomMode === 'derby' ? 'text-primary' : ''}`}
                      >
                        {Math.round(r.rating ?? 1000)}
                      </span>
                      {(roomMode === 'derby' ||
                        roomMode === 'professional') && (
                        <div className='flex items-center gap-1 mt-0.5'>
                          <span className='text-[9px] text-muted-foreground font-medium'>
                            S:
                            {Math.round(
                              (r.rating ?? 1000) - (r.deltaRoom || 0),
                            )}
                          </span>
                          <span
                            className={`text-[9px] font-bold flex items-center ${(r.deltaRoom || 0) > 0 ? 'text-emerald-500' : (r.deltaRoom || 0) < 0 ? 'text-red-500' : 'text-muted-foreground'}`}
                          >
                            <span className='mr-px'>Δ</span>
                            {(r.deltaRoom || 0) > 0 ? '+' : ''}
                            {Math.round(r.deltaRoom || 0)}
                          </span>
                        </div>
                      )}
                    </div>
                  </TableCell>

                  {roomMode !== 'professional' && (
                    <TableCell className='text-center py-2 px-3'>
                      <div className='flex flex-col items-center justify-center'>
                        <span className='font-black text-green-600 dark:text-green-400 text-base'>
                          {r.adjPointsLive?.toFixed(1) ?? '—'}
                        </span>
                        <span className='text-[8px] uppercase tracking-widest font-bold text-muted-foreground'>
                          {t('adj')}
                        </span>
                      </div>
                    </TableCell>
                  )}

                  <TableCell className='text-center py-2 px-3'>
                    <div className='flex flex-col items-center justify-center'>
                      <span className='font-bold text-sm text-foreground'>
                        {Math.round(r.globalElo ?? 1000)}
                      </span>
                      <div className='flex items-center gap-1 mt-0.5'>
                        <span className='text-[9px] text-muted-foreground font-medium'>
                          S:
                          {Math.round(
                            (r.globalElo ?? 1000) - (r.globalDelta || 0),
                          )}
                        </span>
                        <span
                          className={`text-[9px] font-bold flex items-center ${(r.globalDelta || 0) > 0 ? 'text-emerald-500' : (r.globalDelta || 0) < 0 ? 'text-red-500' : 'text-muted-foreground'}`}
                        >
                          <span className='mr-px'>Δ</span>
                          {(r.globalDelta || 0) > 0 ? '+' : ''}
                          {Math.round(r.globalDelta || 0)}
                        </span>
                      </div>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </ScrollArea>

      <div className='mt-6 mx-6 mb-6 p-4 bg-muted/20 rounded-xl border border-border/40 shadow-sm'>
        <h4 className='font-bold text-xs mb-2 flex items-center gap-1.5 tracking-wide'>
          <Trophy className='w-3.5 h-3.5 text-primary' />
          {t('How the Season Winner is decided')}
        </h4>

        {roomMode === 'professional' ? (
          <ul className='list-none space-y-1.5 text-xs text-muted-foreground font-light'>
            <li className='flex gap-1.5'>
              <span className='text-primary font-bold'>•</span>{' '}
              <span>
                <strong>{t('Main Criteria')}:</strong>{' '}
                {t('Highest Room Rating')}.
              </span>
            </li>
            <li className='flex gap-1.5'>
              <span className='text-primary font-bold'>•</span>{' '}
              <span>
                <strong>{t('Tie-breakers')}:</strong> {t('Win Rate')} &rarr;{' '}
                {t('Total Wins')}.
              </span>
            </li>
          </ul>
        ) : roomMode === 'derby' ? (
          <ul className='list-none space-y-1.5 text-xs text-muted-foreground font-light'>
            <li className='flex gap-1.5'>
              <span className='text-primary font-bold'>•</span>{' '}
              <span>
                <strong>{t('Main Criteria')}:</strong>{' '}
                {t('Highest Room Rating')}.
              </span>
            </li>
            <li className='flex gap-1.5'>
              <span className='text-primary font-bold'>•</span>{' '}
              <span>
                <strong>{t('Points Engine')}:</strong>{' '}
                {t(
                  'Breaking win streaks (Bounties) and beating your historical nemesis grant massive multipliers.',
                )}
              </span>
            </li>
          </ul>
        ) : roomMode === 'arcade' ? (
          <ul className='list-none space-y-1.5 text-xs text-muted-foreground font-light'>
            <li className='flex gap-1.5'>
              <span className='text-primary font-bold'>•</span>{' '}
              <span>
                <strong>{t('Main Criteria')}:</strong> {t('Most Wins')}.
              </span>
            </li>
          </ul>
        ) : (
          <ul className='list-none space-y-1.5 text-xs text-muted-foreground font-light'>
            <li className='flex gap-1.5'>
              <span className='text-primary font-bold'>•</span>{' '}
              <span>
                <strong>{t('Main Criteria')}:</strong>{' '}
                {t('Adjusted Points (Adj Pts)')}.
              </span>
            </li>
            <li className='flex gap-1.5'>
              <span className='text-primary font-bold'>•</span>{' '}
              <span>
                <strong>{t('Formula')}:</strong>{' '}
                <code className='bg-muted px-1 py-px rounded text-[10px] text-foreground font-mono'>
                  (Rating - 1000) × √(Games / Average)
                </code>
              </span>
            </li>
          </ul>
        )}
      </div>
    </div>
  );
}

function RegularStandings({
  players,
  onSort,
  creatorId,
  sport,
  roomMode,
  t,
}: any) {
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
        label: 'Room ELO',
        isSortable: true,
        description: 'Current Room ELO, Initial ELO, and points delta.',
      },
      ...(roomMode !== 'professional'
        ? [
            {
              key: 'adjPointsLive',
              label: 'Adj Pts',
              isSortable: true,
              description:
                'Calculated using "Adjusted Points" which rewards high activity.',
            },
          ]
        : []),
      {
        key: 'globalElo',
        label: 'Global ELO',
        isSortable: true,
        description: 'Current Global ELO, Initial ELO, and points delta.',
      },
    ];

    const standardSpecific = [
      {
        key: 'totalMatches',
        label: 'Games',
        isSortable: true,
        description: 'Total games played in this room.',
      },
      { key: 'wins', label: 'W', isSortable: true, description: 'Total wins.' },
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
      { key: 'wins', label: 'W', isSortable: true, description: 'Sets won.' },
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
  }, [sport, roomMode]);

  return (
    <div className='overflow-x-auto'>
      <ScrollArea className='w-full max-h-[500px]'>
        <Table>
          <TableHeader className='bg-muted/5 sticky top-0 z-10 backdrop-blur-sm'>
            <TableRow className='border-b border-border/50 hover:bg-transparent'>
              <TableHead className='w-10 text-center py-2 px-3 h-auto text-[9px] uppercase tracking-widest font-bold text-muted-foreground'>
                #
              </TableHead>
              {headers.map((h) => (
                <TableHead
                  key={h.key}
                  className='py-2 px-3 h-auto text-[9px] uppercase tracking-widest font-bold text-muted-foreground'
                >
                  <TooltipProvider delayDuration={0}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div
                          className={`flex items-center gap-1 cursor-pointer hover:text-primary transition-colors ${
                            h.key === 'name'
                              ? 'justify-start'
                              : 'justify-center'
                          }`}
                          onClick={() => h.isSortable && onSort(h.key)}
                        >
                          <span>{t(h.label)}</span>
                          {h.description && (
                            <Info className='h-2.5 w-2.5 opacity-40' />
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
                className='hover:bg-muted/30 border-b border-border/40 transition-colors'
              >
                <TableCell className='text-center py-2 px-3 font-mono text-xs text-muted-foreground'>
                  {i + 1}
                </TableCell>
                <TableCell className='py-2 px-3'>
                  <div className='flex flex-col'>
                    <div className='flex items-center gap-1.5'>
                      <a
                        href={`/profile/${p.userId}`}
                        className='hover:underline font-semibold text-sm truncate'
                      >
                        {p.name}
                      </a>
                      {p.userId === creatorId && (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <ShieldCheck className='h-3 w-3 text-primary shrink-0' />
                            </TooltipTrigger>
                            <TooltipContent className='glass-panel border-0 text-xs'>
                              <p>{t('Room Creator')}</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                    </div>
                    {p.currentStreak !== undefined && p.currentStreak >= 3 && (
                      <div className='flex gap-1 mt-0.5'>
                        <span className='text-[8px] font-bold uppercase tracking-wider bg-orange-500/10 text-orange-600 px-1 py-px rounded flex items-center gap-0.5'>
                          <Flame className='w-2 h-2 fill-current animate-pulse' />{' '}
                          {p.currentStreak}
                        </span>
                      </div>
                    )}
                  </div>
                </TableCell>

                <TableCell className='text-center py-2 px-3'>
                  <div className='flex flex-col items-center justify-center'>
                    <span className='font-black text-primary text-base'>
                      {p.ratingVisible ? Math.round(p.rating ?? 1000) : '—'}
                    </span>
                    {p.ratingVisible && (
                      <div className='flex items-center gap-1 mt-0.5'>
                        {(roomMode === 'derby' ||
                          roomMode === 'professional') && (
                          <span className='text-[9px] text-muted-foreground font-medium'>
                            S:
                            {Math.round(
                              (p.rating ?? 1000) - (p.deltaRoom || 0),
                            )}
                          </span>
                        )}
                        <span
                          className={`text-[9px] font-bold flex items-center ${(p.deltaRoom || 0) > 0 ? 'text-emerald-500' : (p.deltaRoom || 0) < 0 ? 'text-red-500' : 'text-muted-foreground'}`}
                        >
                          <span className='mr-px'>Δ</span>
                          {(p.deltaRoom || 0) > 0 ? '+' : ''}
                          {Math.round(p.deltaRoom || 0)}
                        </span>
                      </div>
                    )}
                  </div>
                </TableCell>

                {roomMode !== 'professional' && (
                  <TableCell className='text-center py-2 px-3'>
                    <div className='flex flex-col items-center justify-center'>
                      <span className='font-black text-green-600 dark:text-green-400 text-lg'>
                        {p.ratingVisible && (p.totalMatches ?? 0) > 0
                          ? p.adjPointsLive?.toFixed(1)
                          : '—'}
                      </span>
                      <span className='text-[8px] uppercase tracking-widest font-bold text-muted-foreground'>
                        {t('adj')}
                      </span>
                    </div>
                  </TableCell>
                )}

                <TableCell className='text-center py-2 px-3'>
                  <div className='flex flex-col items-center justify-center'>
                    <span className='font-bold text-sm text-foreground'>
                      {p.ratingVisible ? Math.round(p.globalElo || 1000) : '—'}
                    </span>
                    {p.ratingVisible && (
                      <div className='flex items-center gap-1 mt-0.5'>
                        <span className='text-[9px] text-muted-foreground font-medium'>
                          S:
                          {Math.round(
                            (p.globalElo || 1000) - (p.globalDelta || 0),
                          )}
                        </span>
                        <span
                          className={`text-[9px] font-bold flex items-center ${(p.globalDelta || 0) > 0 ? 'text-emerald-500' : (p.globalDelta || 0) < 0 ? 'text-red-500' : 'text-muted-foreground'}`}
                        >
                          <span className='mr-px'>Δ</span>
                          {(p.globalDelta || 0) > 0 ? '+' : ''}
                          {Math.round(p.globalDelta || 0)}
                        </span>
                      </div>
                    )}
                  </div>
                </TableCell>

                {sport === 'tennis' ? (
                  <>
                    <TableCell className='text-center py-2 px-3 font-mono text-xs'>
                      {p.totalMatches ?? 0}
                    </TableCell>
                    <TableCell className='text-center py-2 px-3 text-emerald-500 font-bold text-xs'>
                      {p.wins ?? 0}
                    </TableCell>
                    <TableCell className='text-center py-2 px-3 text-red-500 font-bold text-xs'>
                      {p.losses ?? 0}
                    </TableCell>
                    <TableCell className='text-center py-2 px-3 font-bold text-xs'>
                      {p.ratingVisible ? `${p.winPct ?? 0}%` : '—'}
                    </TableCell>
                    <TableCell className='text-center py-2 px-3 font-mono text-xs'>
                      {p.aces ?? 0}
                    </TableCell>
                    <TableCell className='text-center py-2 px-3 font-mono text-xs'>
                      {p.doubleFaults ?? 0}
                    </TableCell>
                    <TableCell className='text-center py-2 px-3 font-mono text-xs'>
                      {p.winners ?? 0}
                    </TableCell>
                  </>
                ) : (
                  <>
                    <TableCell className='text-center py-2 px-3 font-mono text-xs'>
                      {p.totalMatches ?? 0}
                    </TableCell>
                    <TableCell className='text-center py-2 px-3 font-bold text-emerald-500 text-xs'>
                      {p.wins ?? 0}
                    </TableCell>
                    <TableCell className='text-center py-2 px-3 font-bold text-red-500 text-xs'>
                      {p.losses ?? 0}
                    </TableCell>
                    <TableCell className='text-center py-2 px-3 font-black text-xs'>
                      {p.ratingVisible ? `${p.winPct ?? 0}%` : '—'}
                    </TableCell>
                    <TableCell className='text-center py-2 px-3 font-mono text-[10px]'>
                      {p.ratingVisible
                        ? (p.avgPtsPerMatch ?? 0).toFixed(1)
                        : '—'}
                    </TableCell>
                    <TableCell className='text-center py-2 px-3'>
                      <div className='flex gap-0.5 justify-center'>
                        {(p.last5Form || [])
                          .slice()
                          .reverse()
                          .map((mm: MiniMatch, idx: number) => (
                            <div
                              key={idx}
                              className={`w-2 h-2 rounded-full shadow-sm ${mm.result === 'W' ? 'bg-emerald-500' : 'bg-red-500'}`}
                              title={`${mm.result === 'W' ? 'Win' : 'Loss'} vs ${mm.opponent}`}
                            />
                          ))}
                      </div>
                    </TableCell>
                    <TableCell className='text-center py-2 px-3 font-bold text-muted-foreground text-xs'>
                      {p.ratingVisible ? (p.longestWinStreak ?? 0) : '—'}
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

function FinalStandings({ season, t, roomMode }: any) {
  const data = useMemo(() => {
    const summary = Array.isArray(season?.summary) ? season.summary : [];
    return summary;
  }, [season]);

  if (!data.length) {
    return (
      <p className='text-muted-foreground text-center py-10 font-light text-sm'>
        {t('No finalized results found for this season.')}
      </p>
    );
  }

  return (
    <div className='overflow-x-auto'>
      <Table>
        <TableHeader className='bg-muted/5'>
          <TableRow className='border-b border-border/40 hover:bg-transparent'>
            <TableHead className='w-10 text-center py-2 px-3 h-auto text-[9px] uppercase tracking-widest font-bold text-muted-foreground'>
              #
            </TableHead>
            <TableHead className='py-2 px-3 h-auto text-[9px] uppercase tracking-widest font-bold text-muted-foreground'>
              {t('Player')}
            </TableHead>
            <TableHead className='text-center py-2 px-3 h-auto text-[9px] uppercase tracking-widest font-bold text-muted-foreground'>
              {t('Games')}
            </TableHead>
            <TableHead className='text-center py-2 px-3 h-auto text-[9px] uppercase tracking-widest font-bold text-muted-foreground'>
              {t('W')}
            </TableHead>
            <TableHead className='text-center py-2 px-3 h-auto text-[9px] uppercase tracking-widest font-bold text-muted-foreground'>
              {t('L')}
            </TableHead>
            <TableHead className='text-center py-2 px-3 h-auto text-[9px] uppercase tracking-widest font-bold text-muted-foreground'>
              {t('Rating')}
            </TableHead>
            {roomMode !== 'professional' && (
              <TableHead className='text-center py-2 px-3 h-auto text-[9px] uppercase tracking-widest font-bold text-muted-foreground'>
                {t('Adj Pts')}
              </TableHead>
            )}
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((r: any) => (
            <TableRow
              key={r.userId}
              className='border-b border-border/40 hover:bg-muted/30 transition-colors'
            >
              <TableCell className='text-center py-2 px-3 text-lg'>
                {r.place === 1 ? (
                  '🥇'
                ) : r.place === 2 ? (
                  '🥈'
                ) : r.place === 3 ? (
                  '🥉'
                ) : (
                  <span className='text-sm font-mono font-bold text-muted-foreground'>
                    {r.place}
                  </span>
                )}
              </TableCell>
              <TableCell className='font-semibold text-sm py-2 px-3'>
                <div className='flex flex-col'>
                  <span>{r.name}</span>
                  {r.longestWinStreak > 4 && (
                    <span className='text-[8px] font-bold uppercase tracking-wider text-orange-600 bg-orange-500/10 px-1 py-px rounded w-fit mt-0.5 flex items-center gap-0.5'>
                      <Flame className='w-2 h-2 fill-current animate-pulse' />{' '}
                      {r.longestWinStreak}
                    </span>
                  )}
                </div>
              </TableCell>
              <TableCell className='text-center py-2 px-3 font-mono text-xs'>
                {r.matchesPlayed ?? 0}
              </TableCell>
              <TableCell className='text-center py-2 px-3 font-bold text-emerald-500 text-xs'>
                {r.wins ?? 0}
              </TableCell>
              <TableCell className='text-center py-2 px-3 font-bold text-red-500 text-xs'>
                {r.losses ?? 0}
              </TableCell>
              <TableCell className='text-center py-2 px-3 font-black text-base text-primary'>
                {Math.round(r.roomRating ?? 1000)}
              </TableCell>
              {roomMode !== 'professional' && (
                <TableCell className='text-center py-2 px-3 font-black text-green-600 dark:text-green-400 text-lg'>
                  {r.adjPoints?.toFixed(1) ?? '—'}
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <div className='mt-6 text-center text-[10px] font-semibold text-muted-foreground uppercase tracking-widest bg-muted/20 w-fit mx-auto px-3 py-1.5 rounded-full'>
        {t('Season finalized on')} {season.dateFinished}
      </div>
    </div>
  );
}
