// src/components/mobile/record-blocks/MobileTennisRecordBlock.tsx
'use client';

import {
	TennisRowInput,
	TennisSetData,
} from '@/components/record-blocks/TennisRecordBlock';
import {
	Button,
	Card,
	CardContent,
	CardHeader,
	CardTitle,
	Label,
} from '@/components/ui';
import { useSport } from '@/contexts/SportContext';
import { useToast } from '@/hooks/use-toast';
import { processAndSaveMatches } from '@/lib/elo';
import type { Room } from '@/lib/types';
import { Plus, Sword } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

export function MobileTennisRecordBlock({
  members,
  roomId,
}: {
  members: Room['members'];
  roomId: string;
  room: Room;
}) {
  const { t } = useTranslation();
  const { sport } = useSport();
  const { toast } = useToast();

  const [player1Id, setPlayer1Id] = useState('');
  const [player2Id, setPlayer2Id] = useState('');
  const [sets, setSets] = useState<TennisSetData[]>([
    { score1: '', score2: '' },
  ]);
  const [isRecording, setIsRecording] = useState(false);

  const sortedMembers = useMemo(
    () =>
      [...members].sort((a, b) => (a.name ?? '').localeCompare(b.name ?? '')),
    [members]
  );

  const setRow = (i: number, data: TennisSetData) =>
    setSets((prev) => prev.map((s, idx) => (idx === i ? data : s)));

  const addSet = () => setSets((prev) => [...prev, { score1: '', score2: '' }]);
  const removeSet = (i: number) =>
    setSets((prev) =>
      prev.length > 1 ? prev.filter((_, idx) => idx !== i) : prev
    );

  const validScore = (v: string) => v !== '' && !Number.isNaN(Number(v));

  const save = async () => {
    if (sport !== 'tennis') return;
    if (!player1Id || !player2Id || player1Id === player2Id) {
      toast({
        title: t('Select two different players'),
        variant: 'destructive',
      });
      return;
    }
    if (sets.some((s) => !validScore(s.score1) || !validScore(s.score2))) {
      toast({ title: t('Invalid score'), variant: 'destructive' });
      return;
    }

    // Нормализуем данные сетов (пустые доп.статы не отправляем как undefined)
    const normalized = sets.map((s) => ({
      score1: s.score1,
      score2: s.score2,
      ...(s.aces1 ? { aces1: s.aces1 } : {}),
      ...(s.aces2 ? { aces2: s.aces2 } : {}),
      ...(s.doubleFaults1 ? { doubleFaults1: s.doubleFaults1 } : {}),
      ...(s.doubleFaults2 ? { doubleFaults2: s.doubleFaults2 } : {}),
      ...(s.winners1 ? { winners1: s.winners1 } : {}),
      ...(s.winners2 ? { winners2: s.winners2 } : {}),
    })) as TennisSetData[];

    setIsRecording(true);
    const ok = await processAndSaveMatches(
      roomId,
      player1Id,
      player2Id,
      normalized,
      'tennis'
    );
    setIsRecording(false);

    if (ok) {
      toast({ title: t('Matches recorded') });
      setPlayer1Id('');
      setPlayer2Id('');
      setSets([{ score1: '', score2: '' }]);
    } else {
      toast({ title: t('Failed to record matches'), variant: 'destructive' });
    }
  };

  // Если по какой-то причине роутер подал не тот спорт
  if (sport !== 'tennis') {
    return (
      <Card>
        <CardHeader>
          <CardTitle className='text-xl'>{t('Record Matches')}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className='text-sm text-muted-foreground'>
            {t('Recording for this sport is not available yet.')}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className='text-xl flex items-center gap-2'>
          <Sword /> {t('Record Matches')}
        </CardTitle>
      </CardHeader>

      <CardContent className='space-y-4'>
        {/* Выбор игроков */}
        <div className='grid grid-cols-2 gap-4'>
          <div>
            <Label>{t('Player 1')}</Label>
            <select
              value={player1Id}
              onChange={(e) => setPlayer1Id(e.target.value)}
              className='w-full border rounded p-2 bg-background'
            >
              <option value=''>{t('Select')}</option>
              {sortedMembers.map((m) => (
                <option key={m.userId} value={m.userId}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label>{t('Player 2')}</Label>
            <select
              value={player2Id}
              onChange={(e) => setPlayer2Id(e.target.value)}
              className='w-full border rounded p-2 bg-background'
            >
              <option value=''>{t('Select')}</option>
              {sortedMembers
                .filter((m) => m.userId !== player1Id)
                .map((m) => (
                  <option key={m.userId} value={m.userId}>
                    {m.name}
                  </option>
                ))}
            </select>
          </div>
        </div>

        {/* Сеты с использованием общего компонента TennisRowInput */}
        <div className='space-y-3'>
          {sets.map((set, i) => (
            <TennisRowInput
              key={i}
              setIndex={i} // Используем setIndex, а не matchIndex для тенниса
              data={set}
              onChange={(d) => setRow(i, d)}
              onRemove={() => removeSet(i)}
              removable={sets.length > 1}
            />
          ))}
        </div>

        {/* Кнопки действий */}
        <div className='flex justify-between items-center gap-4'>
          <Button variant='outline' onClick={addSet} className='flex-1'>
            <Plus className='h-4 w-4 mr-2' /> {t('Add Set')}
          </Button>
          <Button onClick={save} disabled={isRecording} className='flex-1'>
            {isRecording ? t('Saving...') : t('Save')}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}