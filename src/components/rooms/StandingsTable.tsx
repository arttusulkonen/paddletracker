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
} from '@/components/ui';
import { useSport } from '@/contexts/SportContext';
import { Crown } from 'lucide-react';
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
        <StandingsLegend viewMode={viewMode} sport={sport} t={t} />
      </CardContent>
    </Card>
  );
}

// Sub-component for regular standings
function RegularStandings({ players, onSort, creatorId, sport, t }: any) {
  // ✅ **ИСПРАВЛЕНИЕ**: Полные заголовки для пинг-понга
  const pingPongHeaders = [
    { key: 'name', label: 'Player', isSortable: true },
    { key: 'rating', label: 'Room Rating', isSortable: true },
    { key: 'deltaRoom', label: 'Room Δ', isSortable: true },
    { key: 'globalDelta', label: 'Global Δ', isSortable: true },
    { key: 'totalMatches', label: 'Games', isSortable: true },
    { key: 'wins', label: 'Wins', isSortable: true },
    { key: 'losses', label: 'Losses', isSortable: true },
    { key: 'winPct', label: 'Win %', isSortable: true },
    { key: 'avgPtsPerMatch', label: 'Avg Δ / Game', isSortable: true },
    { key: 'last5Form', label: 'Last 5 ←', isSortable: false },
    { key: 'longestWinStreak', label: 'Best Streak', isSortable: true },
  ];

  const tennisHeaders = [
    { key: 'name', label: 'Player', isSortable: true },
    { key: 'rating', label: 'Room Rating', isSortable: true },
    { key: 'totalMatches', label: 'Sets', isSortable: true },
    { key: 'wins', label: 'Wins', isSortable: true },
    { key: 'losses', label: 'Losses', isSortable: true },
    { key: 'winPct', label: 'Win %', isSortable: true },
    { key: 'aces', label: 'Aces', isSortable: true },
    { key: 'doubleFaults', label: 'DF', isSortable: true },
    { key: 'winners', label: 'Winners', isSortable: true },
  ];

  const headers = sport === 'tennis' ? tennisHeaders : pingPongHeaders;

  return (
    <ScrollArea>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>#</TableHead>
            {headers.map((h) => (
              <TableHead
                key={h.key}
                className={h.isSortable ? 'cursor-pointer' : ''}
                onClick={() => h.isSortable && onSort(h.key)}
              >
                {t(h.label)}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {players.map((p: any, i: number) => (
            <TableRow key={p.userId}>
              <TableCell>{i + 1}</TableCell>
              {/* ✅ **ИСПРАВЛЕНИЕ**: Динамическое отображение ячеек в зависимости от спорта */}
              {sport === 'pingpong' ? (
                <>
                  <TableCell>
                    <a
                      href={`/profile/${p.userId}`}
                      className='hover:underline'
                    >
                      {p.name}
                    </a>
                    {p.userId === creatorId && (
                      <Crown className='inline ml-1 h-4 w-4 text-yellow-500' />
                    )}
                  </TableCell>
                  <TableCell>{p.ratingVisible ? p.rating : '—'}</TableCell>
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
                  <TableCell>
                    <a
                      href={`/profile/${p.userId}`}
                      className='hover:underline'
                    >
                      {p.name}
                    </a>
                    {p.userId === creatorId && (
                      <Crown className='inline ml-1 h-4 w-4 text-yellow-500' />
                    )}
                  </TableCell>
                  <TableCell>{p.ratingVisible ? p.rating : '—'}</TableCell>
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

// Sub-component for final standings (без изменений)
function FinalStandings({ season, t }: any) {
  // This can be adapted for sport-specific final views later
  const data = Array.isArray(season.summary) ? season.summary : season.members;
  // ...
  return <p>{t('Final standings view not fully implemented yet.')}</p>;
}

// Sub-component for legend
function StandingsLegend({ viewMode, sport, t }: any) {
  // ✅ **ИСПРАВЛЕНИЕ**: Динамическая легенда
  const commonItems = [
    {
      key: 'Room Rating',
      desc: 'Elo score, recalculated based only on matches in this room (starting = 1000).',
    },
    { key: 'Win %', desc: '(Wins / Games) × 100.' },
  ];

  const pingPongItems = [
    { key: 'Room Δ', desc: 'vs. starting (1000): current room rating – 1000.' },
    {
      key: 'Global Δ',
      desc: 'Change in your overall Elo (across all rooms) since your first match this season.',
    },
    { key: 'Avg Δ / Game', desc: 'Average room Elo change per match.' },
    { key: 'Last 5', desc: 'W = win, L = loss for the last five games.' },
    { key: 'Best Streak', desc: 'Longest consecutive winning streak.' },
  ];

  const tennisItems = [
    { key: 'Sets / Wins / Losses', desc: 'Sets played and outcomes.' },
    { key: 'Aces', desc: 'Serves that result directly in a point.' },
    {
      key: 'DF (Double Faults)',
      desc: 'Two consecutive faults during a serve, resulting in the loss of the point.',
    },
    {
      key: 'Winners',
      desc: 'Shots that win the point outright, without the opponent touching the ball.',
    },
  ];

  const legendItems =
    sport === 'tennis'
      ? [...commonItems.slice(0, 1), ...tennisItems, ...commonItems.slice(1)]
      : [
          ...commonItems.slice(0, 1),
          ...pingPongItems.slice(0, 2),
          {
            key: 'Games / Wins / Losses',
            desc: 'Matches played and outcomes.',
          },
          ...commonItems.slice(1),
          ...pingPongItems.slice(2),
        ];

  return (
    <div className='mt-4 text-xs text-muted-foreground leading-relaxed space-y-1'>
      {legendItems.map((item) => (
        <p key={item.key}>
          <strong>{t(item.key)}</strong> — {t(item.desc)}
        </p>
      ))}
    </div>
  );
}
