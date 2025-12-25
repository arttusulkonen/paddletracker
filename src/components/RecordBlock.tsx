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
import { useEffect, useState } from 'react';
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

// Helper component moved/updated
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
    <div className='space-y-2 w-full'>
      <Label>{label}</Label>
      <select
        className='w-full border rounded p-2 bg-input'
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value=''>{t('Select')}</option>
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

// New Types
type GameData = PingPongMatchData | TennisSetData | BadmintonMatchData;
type MatchupDraft = {
  id: string;
  player1Id: string;
  player2Id: string;
  games: GameData[];
};

// New internal component to handle a single matchup block
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
    
    const lastSide1 = (lastGame as PingPongMatchData | BadmintonMatchData)?.side1 || 'left';
    // Alternate sides for pingpong/badminton to simplify input
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
  
  const isMatchupReady = matchup.player1Id && matchup.player2Id && matchup.games.length > 0;
  
  const invalidGame = matchup.games.find(({ score1, score2 }: any) => {
    const a = +score1;
    const b = +score2;
    if (isNaN(a) || isNaN(b) || a < 0 || b < 0 || a === b) return true;
    return !config.validateScore(a, b).isValid;
  });
  
  const p1Name = members.find(m => m.userId === matchup.player1Id)?.name;
  const p2Name = members.find(m => m.userId === matchup.player2Id)?.name;

  let headerClass = 'flex items-center gap-2 font-bold text-lg p-2 rounded-t-lg transition-colors';
  if (invalidGame) {
    headerClass += ' bg-amber-100 dark:bg-amber-950/20 text-amber-600 border-b border-amber-300';
  } else if (isMatchupReady) {
    headerClass += ' bg-primary/5 dark:bg-primary/10 text-primary border-b border-primary/20';
  } else {
    headerClass += ' bg-muted text-muted-foreground border-b border-border';
  }

  return (
    <Card className='shadow-lg border-2'>
      <div className={headerClass}>
        <User size={18} />
        <span className='truncate flex-1'>
          {p1Name || t('Player 1')} vs {p2Name || t('Player 2')}
        </span>
        {removable && (
          <Button
            variant='ghost'
            size='icon'
            className='h-8 w-8 hover:text-destructive'
            onClick={onRemove}
            title={t('Remove Matchup')}
          >
            <Trash2 className='h-4 w-4' />
          </Button>
        )}
      </div>

      <CardContent className='p-4 space-y-4'>
        <div className='flex flex-col sm:flex-row gap-4 items-end'>
          <PlayerSelect
            label={t('Player 1')}
            value={matchup.player1Id}
            onChange={(id) => updatePlayer('player1Id', id)}
            list={listP1}
            t={t}
          />
          <PlayerSelect
            label={t('Player 2')}
            value={matchup.player2Id}
            onChange={(id) => updatePlayer('player2Id', id)}
            list={listP2}
            t={t}
          />
        </div>

        <div className='space-y-3 pt-4 border-t mt-4'>
          <Label className='font-semibold text-muted-foreground'>
            {t(sport === 'tennis' ? 'Set Results' : 'Game Results')}
          </Label>
          <div className='space-y-4'>
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
            className='flex items-center gap-2 w-full mt-4'
            onClick={addGameRow}
          >
            <Plus /> {sport === 'tennis' ? t('Add Set') : t('Add Game')}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function RecordBlock({
  members,
  roomId,
  room,
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

  // FIX: Removed filtering. Creator/Coach is a player.
  const playableMembers = members; 

  const createInitialGame = () =>
    sport === 'tennis'
      ? ({ score1: '', score2: '' } as TennisSetData)
      : ({ score1: '', score2: '', side1: 'left', side2: 'right' } as
          | PingPongMatchData
          | BadmintonMatchData);

  const createInitialMatchup = (): MatchupDraft => ({
    id: Date.now().toString(), 
    player1Id: '',
    player2Id: '',
    games: [createInitialGame()],
  });

  const [matchupDrafts, setMatchupDrafts] = useState<MatchupDraft[]>(() => [
    createInitialMatchup(),
  ]);
  const [isRecording, setIsRecording] = useState(false);

  useEffect(() => {
    setMatchupDrafts([createInitialMatchup()]);
  }, [sport]);

  const addMatchup = () => {
    setMatchupDrafts((prev) => [...prev, createInitialMatchup()]);
  };

  const removeMatchup = (id: string) => {
    setMatchupDrafts((prev) => prev.filter((m) => m.id !== id));
  };

  const updateMatchup = (updatedMatchup: MatchupDraft) => {
    setMatchupDrafts((prev) =>
      prev.map((m) => (m.id === updatedMatchup.id ? updatedMatchup : m))
    );
  };

  const saveMatches = async () => {
    const validDrafts = matchupDrafts.filter(
      (m) =>
        m.player1Id &&
        m.player2Id &&
        m.player1Id !== m.player2Id &&
        m.games.length > 0
    );

    if (validDrafts.length === 0) {
      toast({
        title: t('No valid matches to record'),
        description: t('Please select two different players and enter at least one game/set result for a matchup.'),
        variant: 'destructive',
      });
      return;
    }
    
    let allGamesValid = true;
    let firstInvalidGame: GameData | undefined = undefined;
    
    for (const draft of validDrafts) {
      const invalidGame = draft.games.find(({ score1, score2 }: any) => {
        const a = +score1;
        const b = +score2;
        if (isNaN(a) || isNaN(b) || a < 0 || b < 0 || a === b) return true;
        return !config.validateScore(a, b).isValid;
      });
      if (invalidGame) {
        allGamesValid = false;
        firstInvalidGame = invalidGame;
        break;
      }
    }
    
    if (!allGamesValid) {
      const { message } = config.validateScore(
        +(firstInvalidGame as any).score1,
        +(firstInvalidGame as any).score2
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
        room,
        draft.player1Id,
        draft.player2Id,
        draft.games as any,
        members,
        sport,
        config
      );
      if (success) successCount++;
    }

    if (successCount > 0) {
      toast({
        title: t('Matches recorded'),
        description: t('{{count}} matchups successfully recorded.', { count: successCount }),
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
  const totalMatchupsReady = matchupDrafts.filter(m => m.player1Id && m.player2Id && m.player1Id !== m.player2Id && m.games.length > 0 && !m.games.find(({ score1, score2 }: any) => {
    const a = +score1;
    const b = +score2;
    if (isNaN(a) || isNaN(b) || a < 0 || b < 0 || a === b) return true;
    return !config.validateScore(a, b).isValid;
  })).length;

  return (
    <Card className='shadow-md flex flex-col h-full'>
      <CardHeader>
        <CardTitle className='flex items-center gap-2'>
          <Sword className='text-accent' /> {t('Record Matches')}
        </CardTitle>
        <CardDescription>
          {t('Record one or more matchups with their game/set results.')}
        </CardDescription>
      </CardHeader>
      
      <CardContent className='space-y-6 flex-grow'>
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

        <div className='flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mt-4 pt-4 border-t'>
          <Button
            variant='outline'
            className='flex items-center gap-2'
            onClick={addMatchup}
            disabled={isRecording}
          >
            <Plus /> {t('Add Matchup')}
          </Button>
          <div className='flex flex-col items-end gap-2'>
            <span className='text-sm text-muted-foreground'>
              {t('Ready to record')}: <strong>{totalMatchupsReady} / {matchupDrafts.length}</strong> {t('matchups')} ({totalGames} {t('games')})
            </span>
            <Button
              className='w-full sm:w-auto sm:max-w-xs'
              disabled={isRecording || totalMatchupsReady === 0}
              onClick={saveMatches}
            >
              {isRecording ? t('Recording…') : t('Record All & Update ELO')}
            </Button>
          </div>
        </div>
      </CardContent>
      
      {sport === 'tennis' && (
        <CardFooter className='flex-col items-start gap-4 border-t pt-4 text-xs text-muted-foreground'>
          <p className='font-semibold'>{t('Tennis Terms:')}</p>
          <ul className='list-disc pl-5 space-y-1'>
            <li>
              <strong>{t('Aces')}:</strong>{' '}
              {t('Serves that result directly in a point.')}
            </li>
            <li>
              <strong>{t('Double Faults')}:</strong>{' '}
              {t(
                'Two consecutive faults during a serve, resulting in the loss of the point.'
              )}
            </li>
            <li>
              <strong>{t('Winners')}:</strong>{' '}
              {t(
                'Shots that win the point outright, without the opponent touching the ball.'
              )}
            </li>
          </ul>
        </CardFooter>
      )}

      {(isCreator || isGlobalAdmin) && (
        <CardFooter className='justify-end border-t pt-4 mt-auto'>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant='destructive'>{t('Finish Season')}</Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  {t('Are you absolutely sure?')}
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {t(
                    'This action will close the current season for this room. All standings will be finalized, and no new matches can be recorded for this season. This cannot be undone.'
                  )}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{t('Cancel')}</AlertDialogCancel>
                <AlertDialogAction onClick={onFinishSeason}>
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