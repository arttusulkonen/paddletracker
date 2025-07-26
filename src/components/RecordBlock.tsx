// src/components/RecordBlock.tsx
'use client';

import {
  Button,
  Card,
  CardContent,
  CardDescription,
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
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

const flip = (s: string) => (s === 'left' ? 'right' : 'left');

export function RecordBlock({
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
  const [matchesInput, setMatchesInput] = useState([
    { score1: '', score2: '', side1: 'left', side2: 'right' },
  ]);
  const [isRecording, setIsRecording] = useState(false);

  const addRow = () =>
    setMatchesInput((rows) => {
      if (!rows.length)
        return [...rows, { score1: '', score2: '', side1: '', side2: '' }];
      const last = rows[rows.length - 1];
      return [
        ...rows,
        {
          score1: '',
          score2: '',
          side1: flip(last.side1),
          side2: flip(last.side2),
        },
      ];
    });

  const removeRow = (i: number) =>
    setMatchesInput((r) => r.filter((_, idx) => idx !== i));

  const saveMatches = async () => {
    if (!player1Id || !player2Id || player1Id === player2Id) {
      toast({
        title: t('Select two different players'),
        variant: 'destructive',
      });
      return;
    }

    const invalidMatch = matchesInput.find(({ score1, score2 }) => {
      const a = +score1,
        b = +score2;
      if (isNaN(a) || isNaN(b) || a < 0 || b < 0) return true; // Базовая проверка

      // Используем функцию валидации из конфига
      return !config.validateScore(a, b).isValid;
    });

    if (invalidMatch) {
      const validationResult = config.validateScore(
        +invalidMatch.score1,
        +invalidMatch.score2
      );
      toast({
        title: t('Check the score values'),
        description: t(validationResult.message || 'Invalid score format'),
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
        { score1: '', score2: '', side1: 'left', side2: 'right' },
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
    <Card className='md:col-span-2 shadow-md'>
      <CardHeader>
        <CardTitle className='flex items-center gap-2'>
          <Sword className='text-accent' /> {t('Record Matches')}
        </CardTitle>
        <CardDescription>{t('Select players and scores')}</CardDescription>
      </CardHeader>
      <CardContent className='space-y-4'>
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
        {matchesInput.map((row, i) => (
          <MatchRowInput
            key={i}
            index={i}
            data={row}
            onChange={(d) =>
              setMatchesInput((r) => r.map((v, idx) => (idx === i ? d : v)))
            }
            onRemove={() => removeRow(i)}
            removable={i > 0}
            t={t}
          />
        ))}
        <Button
          variant='outline'
          className='flex items-center gap-2'
          onClick={addRow}
        >
          <Plus /> {t('Add Match')}
        </Button>
        <Button
          className='w-full mt-4'
          disabled={isRecording}
          onClick={saveMatches}
        >
          {isRecording ? t('Recording…') : t('Record & Update ELO')}
        </Button>
      </CardContent>
    </Card>
  );
}

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
    <div>
      <Label>{label}</Label>
      <select
        className='w-full border rounded p-2'
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value=''>{t('Select')}</option>
        {list.map((o) => (
          <option key={o.userId} value={o.userId}>
            {o.name} ({o.rating})
          </option>
        ))}
      </select>
    </div>
  );
}

function MatchRowInput({
  data,
  onChange,
  onRemove,
  removable,
  t,
}: {
  index: number;
  data: any;
  onChange: (d: any) => void;
  onRemove: () => void;
  removable: boolean;
  t: (key: string) => string;
}) {
  return (
    <div className='grid grid-cols-2 gap-4 mb-2 relative'>
      {['1', '2'].map((n) => (
        <div key={n}>
          <Label>{t(`P${n} Score`)}</Label>
          <Input
            type='number'
            value={data[`score${n}`]}
            onChange={(e) =>
              onChange({ ...data, [`score${n}`]: e.target.value })
            }
          />
          <Label className='mt-2'>{t('Side')}</Label>
          <select
            className='w-full border rounded p-2'
            value={data[`side${n}`]}
            onChange={(e) =>
              onChange({
                ...data,
                [`side${n}`]: e.target.value,
                [`side${n === '1' ? '2' : '1'}`]:
                  e.target.value === 'left' ? 'right' : 'left',
              })
            }
          >
            <option value=''>{t('–')}</option>
            <option value='left'>{t('Left')}</option>
            <option value='right'>{t('Right')}</option>
          </select>
        </div>
      ))}
      {removable && (
        <Button
          variant='ghost'
          className='absolute top-1/2 right-0 -translate-y-1/2'
          onClick={onRemove}
        >
          <Trash2 />
        </Button>
      )}
    </div>
  );
}
