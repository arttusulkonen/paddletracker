// src/components/RecordBlock.tsx
'use client';

import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
	Button,
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
	Label,
} from '@/components/ui';
import { useSport } from '@/contexts/SportContext';
import { useToast } from '@/hooks/use-toast';
import { processAndSaveMatches } from '@/lib/elo';
import type { Room } from '@/lib/types';
import { Plus, Sword, Trash2, User } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
	BadmintonMatchData,
	BadmintonRowInput,
} from './record-blocks/BadmintonRecordBlock';
import {
	PingPongMatchData,
	PingPongRowInput,
} from './record-blocks/PingPongRecordBlock';
import {
	TennisRowInput,
	TennisSetData,
} from './record-blocks/TennisRecordBlock';

function PlayerSelect({
  label,
  value,
  onChange,
  list,
  t,
  disabledIds = [],
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  list: { userId: string; name: string; rating: number }[];
  t: (key: string) => string;
  disabledIds?: string[];
}) {
  return (
    <div className='space-y-1.5 w-full'>
      <Label className='text-[10px] font-bold text-muted-foreground uppercase tracking-widest px-1'>
        {label}
      </Label>
      <select
        className='w-full h-10 border-0 rounded-xl bg-muted/50 px-3 font-semibold text-sm ring-1 ring-black/5 dark:ring-white/10 focus:ring-2 focus:ring-primary/40 outline-none transition-all cursor-pointer'
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value='' disabled>
          {t('Select player...')}
        </option>
        {list
          .filter((o) => !disabledIds.includes(o.userId))
          .map((o) => (
            <option key={o.userId} value={o.userId}>
              {o.name} ({Math.round(o.rating)})
            </option>
          ))}
      </select>
    </div>
  );
}

type GameData = PingPongMatchData | TennisSetData | BadmintonMatchData;
type MatchupDraft = {
  id: string;
  player1Id: string;
  player2Id: string;
  games: GameData[];
};

export const isGameInvalid = (
  game: any,
  validateScore: (s1: number, s2: number) => { isValid: boolean },
) => {
  const s1 = String(game?.score1 ?? '').trim();
  const s2 = String(game?.score2 ?? '').trim();

  if (s1 === '' || s2 === '') return true;

  const a = Number(s1);
  const b = Number(s2);

  if (isNaN(a) || isNaN(b) || a < 0 || b < 0 || a === b) return true;

  return !validateScore(a, b).isValid;
};

function MatchupDraftBlock({
  matchup,
  members,
  sport,
  config,
  onUpdate,
  onRemove,
  removable,
  t,
}: {
  matchup: MatchupDraft;
  members: Room['members'];
  sport: string;
  config: any;
  onUpdate: (data: MatchupDraft) => void;
  onRemove: () => void;
  removable: boolean;
  t: (key: string) => string;
}) {
  const allMembers = members.map((m) => ({
    userId: m.userId,
    name: m.name,
    rating: m.rating,
  }));

  const listP1 = allMembers.filter((m) => m.userId !== matchup.player2Id);
  const listP2 = allMembers.filter((m) => m.userId !== matchup.player1Id);

  const updatePlayer = (field: 'player1Id' | 'player2Id', id: string) => {
    onUpdate({ ...matchup, [field]: id });
  };

  const createNextGame = (lastGame?: GameData): GameData => {
    if (sport === 'tennis') {
      return { score1: '', score2: '' } as TennisSetData;
    }

    const lastSide1 =
      (lastGame as PingPongMatchData | BadmintonMatchData)?.side1 || 'left';
    const newSide1 = lastSide1 === 'left' ? 'right' : 'left';
    const newSide2 = newSide1 === 'left' ? 'right' : 'left';

    return {
      score1: '',
      score2: '',
      side1: newSide1,
      side2: newSide2,
    } as PingPongMatchData | BadmintonMatchData;
  };

  const addGameRow = () => {
    const lastGame = matchup.games[matchup.games.length - 1];
    onUpdate({
      ...matchup,
      games: [...matchup.games, createNextGame(lastGame)],
    });
  };

  const removeGameRow = (i: number) => {
    onUpdate({
      ...matchup,
      games: matchup.games.filter((_, idx) => idx !== i),
    });
  };

  const updateGameRow = (i: number, data: GameData) => {
    onUpdate({
      ...matchup,
      games: matchup.games.map((row, index) => (index === i ? data : row)),
    });
  };

  const isMatchupReady =
    matchup.player1Id && matchup.player2Id && matchup.games.length > 0;

  const invalidGame = matchup.games.find((g) =>
    isGameInvalid(g, config.validateScore),
  );

  const p1Name = members.find((m) => m.userId === matchup.player1Id)?.name;
  const p2Name = members.find((m) => m.userId === matchup.player2Id)?.name;

  let headerClass =
    'flex items-center gap-3 font-extrabold text-base p-3 rounded-t-2xl transition-colors';

  let wrapperClass =
    'shadow-sm border-0 ring-1 ring-black/5 dark:ring-white/10 rounded-2xl bg-card overflow-hidden transition-all duration-300';

  if (invalidGame) {
    headerClass += ' bg-amber-500/10 text-amber-700 dark:text-amber-400';
    wrapperClass += ' ring-amber-500/30';
  } else if (isMatchupReady) {
    headerClass += ' bg-primary/10 text-primary';
    wrapperClass += ' ring-primary/30 shadow-md';
  } else {
    headerClass += ' bg-muted/50 text-muted-foreground';
  }

  return (
    <Card className={wrapperClass}>
      <div className={headerClass}>
        <div className='bg-background/50 p-1.5 rounded-lg backdrop-blur-md'>
          <User size={16} />
        </div>
        <span className='truncate flex-1 tracking-tight text-sm'>
          {p1Name || t('Player 1')}{' '}
          <span className='text-xs font-medium opacity-50 mx-1'>vs</span>{' '}
          {p2Name || t('Player 2')}
        </span>
        {removable && (
          <Button
            variant='ghost'
            size='icon'
            className='h-8 w-8 hover:bg-destructive/10 hover:text-destructive rounded-full transition-colors bg-background/50 backdrop-blur-md'
            onClick={onRemove}
            title={t('Remove Matchup')}
          >
            <Trash2 className='h-4 w-4' />
          </Button>
        )}
      </div>

      <CardContent className='p-4 space-y-4 bg-background/50'>
        <div className='flex flex-col sm:flex-row gap-3 items-center relative z-10'>
          <PlayerSelect
            label={t('Player 1')}
            value={matchup.player1Id}
            onChange={(id) => updatePlayer('player1Id', id)}
            list={listP1}
            t={t}
          />
          <div className='hidden sm:flex mt-5 bg-muted/50 h-6 w-6 rounded-full items-center justify-center text-[9px] font-black text-muted-foreground shrink-0'>
            VS
          </div>
          <PlayerSelect
            label={t('Player 2')}
            value={matchup.player2Id}
            onChange={(id) => updatePlayer('player2Id', id)}
            list={listP2}
            t={t}
          />
        </div>

        <div className='space-y-3 pt-4 border-t border-black/5 dark:border-white/5 relative z-10'>
          <Label className='text-[10px] font-bold text-muted-foreground uppercase tracking-widest px-1'>
            {t(sport === 'tennis' ? 'Set Results' : 'Game Results')}
          </Label>
          <div className='space-y-3'>
            {matchup.games.map((row, i) => {
              const rowProps = {
                data: row as any,
                onChange: (d: any) => updateGameRow(i, d),
                onRemove: () => removeGameRow(i),
                removable: matchup.games.length > 1,
              };

              if (sport === 'pingpong') {
                return (
                  <PingPongRowInput
                    key={i}
                    {...rowProps}
                    data={row as PingPongMatchData}
                    matchIndex={i}
                  />
                );
              }
              if (sport === 'badminton') {
                return (
                  <BadmintonRowInput
                    key={i}
                    {...rowProps}
                    data={row as BadmintonMatchData}
                    matchIndex={i}
                  />
                );
              }
              if (sport === 'tennis') {
                return (
                  <TennisRowInput
                    key={i}
                    {...rowProps}
                    data={row as TennisSetData}
                    setIndex={i}
                  />
                );
              }
              return null;
            })}
          </div>

          <Button
            variant='outline'
            className='flex items-center gap-2 w-full h-10 rounded-xl mt-4 border-dashed hover:bg-primary/5 hover:text-primary hover:border-primary/30 transition-all font-semibold text-xs'
            onClick={addGameRow}
          >
            <Plus className='w-4 h-4' />{' '}
            {sport === 'tennis' ? t('Add Set') : t('Add Game')}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function RecordBlock({
  members,
  roomId,
  isCreator,
  isGlobalAdmin,
  onFinishSeason,
}: {
  members: Room['members'];
  roomId: string;
  room: Room;
  isCreator: boolean;
  isGlobalAdmin: boolean;
  onFinishSeason: () => void;
}) {
  const { t } = useTranslation();
  const { sport, config } = useSport();
  const { toast } = useToast();

  const playableMembers = members.filter((m: any) => m.accountType !== 'coach');

  const createInitialGame = useCallback(
    () =>
      sport === 'tennis'
        ? ({ score1: '', score2: '' } as TennisSetData)
        : ({ score1: '', score2: '', side1: 'left', side2: 'right' } as
            | PingPongMatchData
            | BadmintonMatchData),
    [sport],
  );

  const createInitialMatchup = useCallback(
    (): MatchupDraft => ({
      id: Date.now().toString(),
      player1Id: '',
      player2Id: '',
      games: [createInitialGame()],
    }),
    [createInitialGame],
  );

  const [matchupDrafts, setMatchupDrafts] = useState<MatchupDraft[]>(() => [
    createInitialMatchup(),
  ]);
  const [isRecording, setIsRecording] = useState(false);

  useEffect(() => {
    setMatchupDrafts([createInitialMatchup()]);
  }, [sport, createInitialMatchup]);

  const addMatchup = () => {
    setMatchupDrafts((prev) => [...prev, createInitialMatchup()]);
  };

  const removeMatchup = (id: string) => {
    setMatchupDrafts((prev) => prev.filter((m) => m.id !== id));
  };

  const updateMatchup = (updatedMatchup: MatchupDraft) => {
    setMatchupDrafts((prev) =>
      prev.map((m) => (m.id === updatedMatchup.id ? updatedMatchup : m)),
    );
  };

  const saveMatches = async () => {
    const validDrafts = matchupDrafts.filter(
      (m) =>
        m.player1Id &&
        m.player2Id &&
        m.player1Id !== m.player2Id &&
        m.games.length > 0,
    );

    if (validDrafts.length === 0) {
      toast({
        title: t('No valid matches to record'),
        description: t(
          'Please select two different players and enter at least one game/set result for a matchup.',
        ),
        variant: 'destructive',
      });
      return;
    }

    let allGamesValid = true;
    let firstInvalidGame: GameData | undefined = undefined;

    for (const draft of validDrafts) {
      const invalidGame = draft.games.find((g) =>
        isGameInvalid(g, config.validateScore),
      );
      if (invalidGame) {
        allGamesValid = false;
        firstInvalidGame = invalidGame;
        break;
      }
    }

    if (!allGamesValid) {
      const { message } = config.validateScore(
        +(firstInvalidGame as any).score1,
        +(firstInvalidGame as any).score2,
      );
      toast({
        title: t('Check the score values in all matchups'),
        description: t(message || 'Invalid score format'),
        variant: 'destructive',
      });
      return;
    }

    setIsRecording(true);
    let successCount = 0;

    for (const draft of validDrafts) {
      const success = await processAndSaveMatches(
        roomId,
        draft.player1Id,
        draft.player2Id,
        draft.games as any,
        sport,
      );
      if (success) successCount++;
    }

    if (successCount > 0) {
      toast({
        title: t('Matches recorded'),
        description: t('{{count}} matchups successfully recorded.', {
          count: successCount,
        }),
      });
      setMatchupDrafts([createInitialMatchup()]);
    } else {
      toast({
        title: t('Error'),
        description: t('Failed to record any matches'),
        variant: 'destructive',
      });
    }

    setIsRecording(false);
  };

  const totalGames = matchupDrafts.reduce((sum, m) => sum + m.games.length, 0);

  const totalMatchupsReady = matchupDrafts.filter(
    (m) =>
      m.player1Id &&
      m.player2Id &&
      m.player1Id !== m.player2Id &&
      m.games.length > 0 &&
      !m.games.some((g) => isGameInvalid(g, config.validateScore)),
  ).length;

  return (
    <Card className='shadow-xl border-0 rounded-[2rem] flex flex-col h-full glass-panel relative overflow-hidden mb-12'>
      <div className='absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent mix-blend-overlay pointer-events-none' />

      <CardHeader className='px-6 pt-6 pb-4 relative z-10'>
        <CardTitle className='flex items-center gap-3 text-2xl font-extrabold tracking-tight'>
          <div className='bg-primary/10 p-2.5 rounded-xl ring-1 ring-primary/20 shadow-sm'>
            <Sword className='text-primary h-5 w-5' />
          </div>
          {t('Record Matches')}
        </CardTitle>
        <CardDescription className='text-sm font-light text-muted-foreground mt-1'>
          {t('Record one or more matchups with their game/set results.')}
        </CardDescription>
      </CardHeader>

      <CardContent className='px-4 sm:px-6 space-y-6 flex-grow relative z-10'>
        {matchupDrafts.map((matchup) => (
          <MatchupDraftBlock
            key={matchup.id}
            matchup={matchup}
            members={playableMembers}
            sport={sport}
            config={config}
            onUpdate={updateMatchup}
            onRemove={() => removeMatchup(matchup.id)}
            removable={matchupDrafts.length > 1}
            t={t}
          />
        ))}

        <div className='flex flex-col md:flex-row md:justify-between md:items-center gap-4 mt-6 pt-5 border-t border-black/5 dark:border-white/5'>
          <Button
            variant='outline'
            className='flex items-center gap-2 h-12 rounded-xl shadow-sm border-0 ring-1 ring-black/5 dark:ring-white/10 bg-white/50 dark:bg-white/5 hover:bg-white dark:hover:bg-white/10 transition-all font-semibold px-5 text-sm'
            onClick={addMatchup}
            disabled={isRecording}
          >
            <Plus className='w-4 h-4' /> {t('Add Matchup')}
          </Button>
          <div className='flex flex-col items-center md:items-end gap-2 w-full md:w-auto'>
            <span className='text-xs text-muted-foreground font-medium'>
              {t('Ready to record')}:{' '}
              <strong className='text-foreground text-sm px-1'>
                {totalMatchupsReady} / {matchupDrafts.length}
              </strong>{' '}
              {t('matchups')}{' '}
              <span className='opacity-50'>
                ({totalGames} {t('games')})
              </span>
            </span>
            <Button
              className='w-full md:w-auto h-12 rounded-xl px-8 text-sm font-bold shadow-md hover:shadow-lg active:scale-[0.98] transition-all disabled:opacity-50 disabled:active:scale-100'
              disabled={isRecording || totalMatchupsReady === 0}
              onClick={saveMatches}
            >
              {isRecording ? t('Recording…') : t('Record All & Update ELO')}
            </Button>
          </div>
        </div>
      </CardContent>

      {sport === 'tennis' && (
        <CardFooter className='flex-col items-start gap-3 border-t border-black/5 dark:border-white/5 px-6 py-5 text-xs text-muted-foreground relative z-10'>
          <p className='font-bold uppercase tracking-widest text-[9px]'>
            {t('Tennis Terms:')}
          </p>
          <ul className='list-disc pl-5 space-y-1.5 font-medium'>
            <li>
              <strong className='text-foreground'>{t('Aces')}:</strong>{' '}
              <span className='opacity-80'>
                {t('Serves that result directly in a point.')}
              </span>
            </li>
            <li>
              <strong className='text-foreground'>{t('Double Faults')}:</strong>{' '}
              <span className='opacity-80'>
                {t(
                  'Two consecutive faults during a serve, resulting in the loss of the point.',
                )}
              </span>
            </li>
            <li>
              <strong className='text-foreground'>{t('Winners')}:</strong>{' '}
              <span className='opacity-80'>
                {t(
                  'Shots that win the point outright, without the opponent touching the ball.',
                )}
              </span>
            </li>
          </ul>
        </CardFooter>
      )}

      {(isCreator || isGlobalAdmin) && (
        <CardFooter className='justify-end border-t border-black/5 dark:border-white/5 px-6 py-5 mt-auto relative z-10'>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant='destructive'
                size='sm'
                className='rounded-lg font-bold shadow-sm'
              >
                {t('Finish Season')}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent className='border-0 glass-panel rounded-[2rem] shadow-2xl'>
              <AlertDialogHeader>
                <AlertDialogTitle className='text-xl font-extrabold tracking-tight'>
                  {t('Are you absolutely sure?')}
                </AlertDialogTitle>
                <AlertDialogDescription className='text-sm font-medium'>
                  {t(
                    'This action will close the current season for this room. All standings will be finalized, and no new matches can be recorded for this season. This cannot be undone.',
                  )}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter className='mt-4'>
                <AlertDialogCancel className='h-10 rounded-xl text-sm border-0 ring-1 ring-black/5 dark:ring-white/10'>
                  {t('Cancel')}
                </AlertDialogCancel>
                <AlertDialogAction
                  onClick={onFinishSeason}
                  className='h-10 rounded-xl text-sm font-bold bg-destructive text-destructive-foreground hover:bg-destructive/90'
                >
                  {t('Yes, Finish Season')}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardFooter>
      )}
    </Card>
  );
}
