'use client';

import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Label,
} from '@/components/ui';
import { useSport } from '@/contexts/SportContext';
import { useToast } from '@/hooks/use-toast';
import { processAndSaveMatches } from '@/lib/elo';
import type { Room } from '@/lib/types';
import { Plus, Sword, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

export type TennisSetData = {
  score1: string;
  score2: string;
  aces1?: string;
  aces2?: string;
  doubleFaults1?: string;
  doubleFaults2?: string;
  winners1?: string;
  winners2?: string;
};

export function MobileTennisRecordBlock({
  members,
  roomId,
  room,
}: {
  members: Room['members'];
  roomId: string;
  room: Room;
}) {
  const { t } = useTranslation();
  const { sport, config } = useSport();
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
      room,
      player1Id,
      player2Id,
      normalized,
      members,
      sport,
      config
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

        {/* Сеты */}
        <div className='space-y-3'>
          {sets.map((set, i) => (
            <div
              key={i}
              className='flex flex-col gap-3 p-4 border rounded-lg bg-muted/50 relative'
            >
              <div className='flex items-center justify-between'>
                <Label className='font-bold'>
                  {t('Set')} {i + 1}
                </Label>
                {sets.length > 1 && (
                  <Button
                    variant='ghost'
                    size='icon'
                    className='h-8 w-8'
                    onClick={() => removeSet(i)}
                  >
                    <Trash2 className='h-4 w-4 text-destructive' />
                  </Button>
                )}
              </div>

              <div className='grid grid-cols-2 gap-3'>
                <div>
                  <Label>{t('P1 Games')}</Label>
                  <Input
                    type='number'
                    inputMode='numeric'
                    placeholder='6'
                    value={set.score1}
                    onChange={(e) =>
                      setRow(i, { ...set, score1: e.target.value })
                    }
                    className='text-center font-semibold'
                  />
                </div>
                <div>
                  <Label>{t('P2 Games')}</Label>
                  <Input
                    type='number'
                    inputMode='numeric'
                    placeholder='4'
                    value={set.score2}
                    onChange={(e) =>
                      setRow(i, { ...set, score2: e.target.value })
                    }
                    className='text-center font-semibold'
                  />
                </div>
              </div>

              {/* Доп.статы — компактные поля по две колонки */}
              <div className='grid grid-cols-2 gap-x-4 gap-y-2 text-sm'>
                <StatInput
                  label={t('Aces')}
                  value={set.aces1}
                  onChange={(v) => setRow(i, { ...set, aces1: v })}
                />
                <StatInput
                  label={t('Aces')}
                  value={set.aces2}
                  onChange={(v) => setRow(i, { ...set, aces2: v })}
                />
                <StatInput
                  label={t('Double Faults')}
                  value={set.doubleFaults1}
                  onChange={(v) => setRow(i, { ...set, doubleFaults1: v })}
                />
                <StatInput
                  label={t('Double Faults')}
                  value={set.doubleFaults2}
                  onChange={(v) => setRow(i, { ...set, doubleFaults2: v })}
                />
                <StatInput
                  label={t('Winners')}
                  value={set.winners1}
                  onChange={(v) => setRow(i, { ...set, winners1: v })}
                />
                <StatInput
                  label={t('Winners')}
                  value={set.winners2}
                  onChange={(v) => setRow(i, { ...set, winners2: v })}
                />
              </div>
            </div>
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

function StatInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value?: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className='flex items-center justify-between'>
      <Label className='text-muted-foreground'>{label}</Label>
      <Input
        type='number'
        inputMode='numeric'
        placeholder='0'
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        className='h-9 w-20 text-center'
      />
    </div>
  );
}
