// src/components/record-blocks/PingPongRecordBlock.tsx
'use client';

import { Button, Input, Label } from '@/components/ui';
import { Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export type PingPongMatchData = {
  score1: string;
  score2: string;
  side1: 'left' | 'right' | '';
  side2: 'left' | 'right' | '';
};

interface PingPongRowInputProps {
  data: PingPongMatchData;
  onChange: (data: PingPongMatchData) => void;
  onRemove: () => void;
  removable: boolean;
  matchIndex: number; // New prop for match index/counter
}

export function PingPongRowInput({
  data,
  onChange,
  onRemove,
  removable,
  matchIndex,
}: PingPongRowInputProps) {
  const { t } = useTranslation();

  const side1 = (data.side1 || 'left') as 'left' | 'right';
  const side2 = (data.side2 || (side1 === 'left' ? 'right' : 'left')) as
    | 'left'
    | 'right';

  const handleSideChange = (newSide: 'left' | 'right') => {
    const newSide2 = newSide === 'left' ? 'right' : 'left';
    onChange({ ...data, side1: newSide, side2: newSide2 });
  };

  const score1 = parseInt(data.score1);
  const score2 = parseInt(data.score2);

  const p1Winner = !isNaN(score1) && !isNaN(score2) && score1 > score2;
  const p2Winner = !isNaN(score1) && !isNaN(score2) && score2 > score1;

  // Conditional styling based on winner
  const baseClassName =
    'grid grid-cols-2 gap-4 relative p-4 border rounded-lg bg-muted/50';

  const winnerClass = 'bg-green-100 dark:bg-green-900 border-green-400';
  const neutralClass = 'bg-background';

  const input1ClassName = `text-center text-base font-bold ${
    p1Winner ? winnerClass : neutralClass
  }`;
  const input2ClassName = `text-center text-base font-bold ${
    p2Winner ? winnerClass : neutralClass
  }`;

  return (
    <div className={baseClassName}>
      <div className='flex justify-between items-center col-span-2 absolute top-0 left-0 right-0 p-2 border-b border-inherit rounded-t-lg'>
        <Label className='font-semibold text-sm'>
          {t('Game')} {matchIndex + 1}
        </Label>
        {removable && (
          <Button
            variant='ghost'
            size='icon'
            className='h-8 w-8 text-muted-foreground hover:text-destructive'
            onClick={onRemove}
          >
            <Trash2 className='h-4 w-4' />
          </Button>
        )}
      </div>
      <div className='space-y-2 pt-8'>
        <Label>{t('P1 Score')}</Label>
        <Input
          type='number'
          placeholder='11'
          value={data.score1}
          onChange={(e) => onChange({ ...data, score1: e.target.value })}
          className={input1ClassName}
        />
        <Label className='mt-2'>{t('Side')}</Label>
        <select
          className='w-full border rounded p-2 bg-background'
          value={side1}
          onChange={(e) => handleSideChange(e.target.value as 'left' | 'right')}
        >
          <option value='left'>{t('Left')}</option>
          <option value='right'>{t('Right')}</option>
        </select>
      </div>

      <div className='space-y-2 pt-8'>
        <Label>{t('P2 Score')}</Label>
        <Input
          type='number'
          placeholder='11'
          value={data.score2}
          onChange={(e) => onChange({ ...data, score2: e.target.value })}
          className={input2ClassName}
        />
        <Label className='mt-2'>{t('Side')}</Label>
        <select
          className='w-full border rounded p-2 bg-muted'
          value={side2}
          disabled
        >
          <option value='left'>{t('Left')}</option>
          <option value='right'>{t('Right')}</option>
        </select>
      </div>
    </div>
  );
}
