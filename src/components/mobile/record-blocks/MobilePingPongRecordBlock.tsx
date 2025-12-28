// src/components/mobile/record-blocks/MobilePingPongRecordBlock.tsx
'use client';

import {
	PingPongMatchData,
	PingPongRowInput,
} from '@/components/record-blocks/PingPongRecordBlock';
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
import { ArrowLeftRight, Plus, Sword } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

export function MobilePingPongRecordBlock({
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
  const [defaultSide1, setDefaultSide1] = useState<'left' | 'right'>('left');
  const [rows, setRows] = useState<PingPongMatchData[]>([
    { score1: '', score2: '', side1: 'left', side2: 'right' },
  ]);
  const [isRecording, setIsRecording] = useState(false);

  const sortedMembers = useMemo(
    () => [...members].sort((a, b) => a.name.localeCompare(b.name)),
    [members]
  );

  const applySidesToAll = (side1: 'left' | 'right') => {
    const side2 = side1 === 'left' ? 'right' : 'left';
    setDefaultSide1(side1);
    setRows((prev) => prev.map((r) => ({ ...r, side1, side2 })));
  };

  const swapSides = () =>
    applySidesToAll(defaultSide1 === 'left' ? 'right' : 'left');

  const setRow = (idx: number, data: PingPongMatchData) => {
    setRows((prev) => prev.map((r, i) => (i === idx ? data : r)));
  };

  const addRow = () =>
    setRows((prev) => {
      const last = prev[prev.length - 1];
      const prevSide1: 'left' | 'right' =
        last?.side1 === 'right' ? 'right' : 'left';
      const nextSide1: 'left' | 'right' =
        prevSide1 === 'left' ? 'right' : 'left';
      const nextSide2: 'left' | 'right' =
        nextSide1 === 'left' ? 'right' : 'left';
      return [
        ...prev,
        { score1: '', score2: '', side1: nextSide1, side2: nextSide2 },
      ];
    });

  const removeRow = (idx: number) =>
    setRows((prev) => prev.filter((_, i) => i !== idx));

  const save = async () => {
    if (sport !== 'pingpong') return;
    if (!player1Id || !player2Id || player1Id === player2Id) {
      toast({
        title: t('Select two different players'),
        variant: 'destructive',
      });
      return;
    }
    if (
      rows.some((r) => !String(r.score1).trim() || !String(r.score2).trim())
    ) {
      toast({ title: t('Invalid score'), variant: 'destructive' });
      return;
    }

    const normalizedRows: PingPongMatchData[] = rows.map((r) => {
      const side1 = r.side1 ?? 'left';
      const side2 = r.side2 ?? (side1 === 'left' ? 'right' : 'left');
      return { score1: r.score1, score2: r.score2, side1, side2 };
    });

    setIsRecording(true);
    const success = await processAndSaveMatches(
      roomId,
      player1Id,
      player2Id,
      normalizedRows,
      'pingpong'
    );
    if (success) {
      toast({ title: t('Matches recorded') });
      setPlayer1Id('');
      setPlayer2Id('');
      setDefaultSide1('left');
      setRows([{ score1: '', score2: '', side1: 'left', side2: 'right' }]);
    } else {
      toast({ title: t('Failed to record matches'), variant: 'destructive' });
    }
    setIsRecording(false);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className='text-xl flex items-center gap-2'>
          <Sword /> {t('Record Matches')}
        </CardTitle>
      </CardHeader>
      <CardContent className='space-y-4'>
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

        <div className='grid grid-cols-2 gap-4'>
          <div>
            <Label>{t('P1 Side')}</Label>
            <select
              value={defaultSide1}
              onChange={(e) =>
                applySidesToAll(e.target.value as 'left' | 'right')
              }
              className='w-full border rounded p-2 bg-background'
            >
              <option value='left'>{t('Left')}</option>
              <option value='right'>{t('Right')}</option>
            </select>
          </div>
          <div className='flex items-end'>
            <Button variant='outline' className='w-full' onClick={swapSides}>
              <ArrowLeftRight className='h-4 w-4 mr-2' />
              {t('Swap')}
            </Button>
          </div>
        </div>

        <div className='space-y-3'>
          {rows.map((row, i) => (
            <PingPongRowInput
              key={i}
              matchIndex={i} // Added matchIndex
              data={row}
              onChange={(d) => setRow(i, d)}
              onRemove={() => removeRow(i)}
              removable={rows.length > 1}
            />
          ))}
        </div>

        <div className='flex justify-between items-center gap-4'>
          <Button variant='outline' onClick={addRow} className='flex-1'>
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