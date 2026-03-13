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
  matchIndex: number;
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

  const baseClassName =
    'grid grid-cols-2 gap-4 md:gap-6 relative p-4 md:p-6 border-0 ring-1 ring-black/5 dark:ring-white/10 rounded-2xl bg-white/40 dark:bg-black/20 backdrop-blur-sm shadow-sm transition-all hover:shadow-md';

  const winnerClass =
    'bg-emerald-500/10 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 ring-2 ring-emerald-500/40 border-0 shadow-inner';
  const neutralClass =
    'bg-background/80 border-0 ring-1 ring-black/5 dark:ring-white/10 focus:ring-primary/40 focus:ring-2 transition-all';

  const input1ClassName = `text-center h-16 text-3xl font-mono font-black rounded-xl ${
    p1Winner ? winnerClass : neutralClass
  }`;
  const input2ClassName = `text-center h-16 text-3xl font-mono font-black rounded-xl ${
    p2Winner ? winnerClass : neutralClass
  }`;

  return (
    <div className={baseClassName}>
      <div className='flex justify-between items-center col-span-2 absolute top-0 left-0 right-0 py-1.5 px-4 border-b border-black/5 dark:border-white/5 bg-black/5 dark:bg-white/5 rounded-t-2xl'>
        <Label className='font-bold text-[10px] uppercase tracking-widest text-muted-foreground'>
          {t('Game')} {matchIndex + 1}
        </Label>
        {removable && (
          <Button
            variant='ghost'
            size='icon'
            className='h-7 w-7 text-muted-foreground hover:bg-destructive/10 hover:text-destructive rounded-full transition-colors'
            onClick={onRemove}
          >
            <Trash2 className='h-3.5 w-3.5' />
          </Button>
        )}
      </div>

      <div className='space-y-3 pt-8'>
        <Label className='text-xs font-semibold uppercase tracking-wider opacity-70 ml-1'>
          {t('P1 Score')}
        </Label>
        <Input
          type='number'
          placeholder='11'
          value={data.score1}
          onChange={(e) => onChange({ ...data, score1: e.target.value })}
          className={input1ClassName}
        />
        <div className='pt-2'>
          <Label className='text-[10px] font-bold uppercase tracking-widest opacity-50 ml-1'>
            {t('Side')}
          </Label>
          <select
            className='w-full mt-1.5 h-10 border-0 rounded-lg bg-background/50 px-3 text-sm font-medium ring-1 ring-black/5 dark:ring-white/10 outline-none focus:ring-2 focus:ring-primary/40 transition-all cursor-pointer'
            value={side1}
            onChange={(e) =>
              handleSideChange(e.target.value as 'left' | 'right')
            }
          >
            <option value='left'>{t('Left')}</option>
            <option value='right'>{t('Right')}</option>
          </select>
        </div>
      </div>

      <div className='space-y-3 pt-8'>
        <Label className='text-xs font-semibold uppercase tracking-wider opacity-70 ml-1'>
          {t('P2 Score')}
        </Label>
        <Input
          type='number'
          placeholder='11'
          value={data.score2}
          onChange={(e) => onChange({ ...data, score2: e.target.value })}
          className={input2ClassName}
        />
        <div className='pt-2'>
          <Label className='text-[10px] font-bold uppercase tracking-widest opacity-50 ml-1'>
            {t('Side')}
          </Label>
          <select
            className='w-full mt-1.5 h-10 border-0 rounded-lg bg-muted/30 px-3 text-sm font-medium opacity-70 cursor-not-allowed'
            value={side2}
            disabled
          >
            <option value='left'>{t('Left')}</option>
            <option value='right'>{t('Right')}</option>
          </select>
        </div>
      </div>
    </div>
  );
}
