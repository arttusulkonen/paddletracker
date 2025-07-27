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
import { Plus, Sword } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
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
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  list: { userId: string; name: string; rating: number }[];
  t: (key: string) => string;
}) {
  return (
    <div className='space-y-2'>
      <Label>{label}</Label>
      <select
        className='w-full border rounded p-2 bg-input'
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value=''>{t('Select')}</option>
        {list.map((o) => (
          <option key={o.userId} value={o.userId}>
            {o.name} ({Math.round(o.rating)})
          </option>
        ))}
      </select>
    </div>
  );
}

// ✅ Обновлены пропсы компонента
export function RecordBlock({
  members,
  roomId,
  room,
  isCreator,
  onFinishSeason,
}: {
  members: Room['members'];
  roomId: string;
  room: Room;
  isCreator: boolean;
  onFinishSeason: () => void;
}) {
  const { t } = useTranslation();
  const { sport, config } = useSport();
  const { toast } = useToast();

  const [player1Id, setPlayer1Id] = useState('');
  const [player2Id, setPlayer2Id] = useState('');
  const [isRecording, setIsRecording] = useState(false);

  const [matchesInput, setMatchesInput] = useState<
    Array<PingPongMatchData | TennisSetData>
  >([
    sport === 'tennis'
      ? { score1: '', score2: '' }
      : { score1: '', score2: '', side1: 'left', side2: 'right' },
  ]);

  useEffect(() => {
    setMatchesInput([
      sport === 'tennis'
        ? { score1: '', score2: '' }
        : { score1: '', score2: '', side1: 'left', side2: 'right' },
    ]);
  }, [sport]);

  const addRow = () => {
    setMatchesInput((prev) => {
      if (sport === 'tennis') {
        return [...prev, { score1: '', score2: '' }];
      }
      const lastMatch = prev[prev.length - 1] as PingPongMatchData;
      const newSide1 = lastMatch.side1 === 'left' ? 'right' : 'left';
      const newSide2 = newSide1 === 'left' ? 'right' : 'left';
      return [
        ...prev,
        { score1: '', score2: '', side1: newSide1, side2: newSide2 },
      ];
    });
  };

  const removeRow = (i: number) =>
    setMatchesInput((r) => r.filter((_, idx) => idx !== i));
  const updateRow = (i: number, data: PingPongMatchData | TennisSetData) => {
    setMatchesInput((prev) =>
      prev.map((row, index) => (index === i ? data : row))
    );
  };

  const saveMatches = async () => {
    if (!player1Id || !player2Id || player1Id === player2Id) {
      toast({
        title: t('Select two different players'),
        variant: 'destructive',
      });
      return;
    }
    const invalidMatch = matchesInput.find(({ score1, score2 }) => {
      const a = +score1;
      const b = +score2;
      if (isNaN(a) || isNaN(b) || a < 0 || b < 0 || a === b) return true;
      return !config.validateScore(a, b).isValid;
    });
    if (invalidMatch) {
      const { message } = config.validateScore(
        +invalidMatch.score1,
        +invalidMatch.score2
      );
      toast({
        title: t('Check the score values'),
        description: t(message || 'Invalid score format'),
        variant: 'destructive',
      });
      return;
    }
    setIsRecording(true);
    const success = await processAndSaveMatches(
      roomId,
      room,
      player1Id,
      player2Id,
      matchesInput,
      members,
      sport,
      config
    );
    if (success) {
      toast({ title: t('Matches recorded') });
      setPlayer1Id('');
      setPlayer2Id('');
      setMatchesInput([
        sport === 'tennis'
          ? { score1: '', score2: '' }
          : { score1: '', score2: '', side1: 'left', side2: 'right' },
      ]);
    } else {
      toast({
        title: t('Error'),
        description: t('Failed to record matches'),
        variant: 'destructive',
      });
    }
    setIsRecording(false);
  };

  useEffect(() => {
    if (player1Id && player1Id === player2Id) setPlayer2Id('');
  }, [player1Id, player2Id]);

  const listP1 = members
    .filter((m) => m.userId !== player2Id)
    .map((m) => ({ userId: m.userId, name: m.name, rating: m.rating }));
  const listP2 = members
    .filter((m) => m.userId !== player1Id)
    .map((m) => ({ userId: m.userId, name: m.name, rating: m.rating }));

  return (
    <Card className='shadow-md flex flex-col h-full'>
      <CardHeader>
        <CardTitle className='flex items-center gap-2'>
          <Sword className='text-accent' /> {t('Record Matches')}
        </CardTitle>
        <CardDescription>
          {sport === 'tennis'
            ? t('Record each set result.')
            : t('Select players and scores.')}
        </CardDescription>
      </CardHeader>
      <CardContent className='space-y-4 flex-grow'>
        <div className='grid grid-cols-2 gap-4 items-end'>
          <PlayerSelect
            label={t('Player 1')}
            value={player1Id}
            onChange={setPlayer1Id}
            list={listP1}
            t={t}
          />
          <PlayerSelect
            label={t('Player 2')}
            value={player2Id}
            onChange={setPlayer2Id}
            list={listP2}
            t={t}
          />
        </div>
        {sport === 'pingpong' &&
          matchesInput.map((row, i) => (
            <PingPongRowInput
              key={i}
              data={row as PingPongMatchData}
              onChange={(d) => updateRow(i, d)}
              onRemove={() => removeRow(i)}
              removable={i > 0}
            />
          ))}
        {sport === 'tennis' &&
          matchesInput.map((row, i) => (
            <TennisRowInput
              key={i}
              setIndex={i}
              data={row as TennisSetData}
              onChange={(d) => updateRow(i, d)}
              onRemove={() => removeRow(i)}
              removable={i > 0}
            />
          ))}
        <div className='flex justify-between items-center mt-4'>
          <Button
            variant='outline'
            className='flex items-center gap-2'
            onClick={addRow}
          >
            <Plus /> {sport === 'tennis' ? t('Add Set') : t('Add Match')}
          </Button>
          <Button
            className='w-full max-w-xs'
            disabled={isRecording}
            onClick={saveMatches}
          >
            {isRecording ? t('Recording…') : t('Record & Update ELO')}
          </Button>
        </div>
      </CardContent>

      {/* ✅ Новый футер с кнопкой завершения сезона */}
      {isCreator && (
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
