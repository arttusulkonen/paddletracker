// src/components/record-blocks/TennisRecordBlock.tsx
'use client';

import { Button, Input, Label } from '@/components/ui';
import { Trash2 } from 'lucide-react';
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

interface TennisRowInputProps {
  setIndex: number;
  data: TennisSetData;
  onChange: (data: TennisSetData) => void;
  onRemove: () => void;
  removable: boolean;
}

export function TennisRowInput({
  setIndex,
  data,
  onChange,
  onRemove,
  removable,
}: TennisRowInputProps) {
  const { t } = useTranslation();

  const handleStatChange = (field: keyof TennisSetData, value: string) => {
    onChange({ ...data, [field]: value });
  };
  
  const score1 = parseInt(data.score1);
  const score2 = parseInt(data.score2);

  const p1Winner = !isNaN(score1) && !isNaN(score2) && score1 > score2;
  const p2Winner = !isNaN(score1) && !isNaN(score2) && score2 > score1;
  
  // Default neutral styling (no conditional background for the whole block)
  const baseClassName = 'flex flex-col gap-4 relative p-4 border rounded-lg bg-muted/50 pt-12';

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
      <div className='flex justify-between items-center absolute top-0 left-0 right-0 p-3 border-b border-inherit rounded-t-lg'>
        <Label className='font-bold text-lg'>
          {t('Set')} {setIndex + 1}
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

      <div className='grid grid-cols-2 gap-4'>
        <div className='space-y-1'>
          <Label>{t('P1 Games')}</Label>
          <Input
            type='number'
            placeholder='6'
            value={data.score1}
            onChange={(e) => handleStatChange('score1', e.target.value)}
            className={input1ClassName}
          />
        </div>
        <div className='space-y-1'>
          <Label>{t('P2 Games')}</Label>
          <Input
            type='number'
            placeholder='4'
            value={data.score2}
            onChange={(e) => handleStatChange('score2', e.target.value)}
            className={input2ClassName}
          />
        </div>
      </div>

      <div className='grid grid-cols-2 gap-x-4 gap-y-2 text-sm'>
        <StatInput
          label={t('Aces')}
          value={data.aces1}
          onChange={(val) => handleStatChange('aces1', val)}
        />
        <StatInput
          label={t('Aces')}
          value={data.aces2}
          onChange={(val) => handleStatChange('aces2', val)}
        />

        <StatInput
          label={t('Double Faults')}
          value={data.doubleFaults1}
          onChange={(val) => handleStatChange('doubleFaults1', val)}
        />
        <StatInput
          label={t('Double Faults')}
          value={data.doubleFaults2}
          onChange={(val) => handleStatChange('doubleFaults2', val)}
        />

        <StatInput
          label={t('Winners')}
          value={data.winners1}
          onChange={(val) => handleStatChange('winners1', val)}
        />
        <StatInput
          label={t('Winners')}
          value={data.winners2}
          onChange={(val) => handleStatChange('winners2', val)}
        />
      </div>
    </div>
  );
}

const StatInput = ({
  label,
  value,
  onChange,
}: {
  label: string;
  value?: string;
  onChange: (v: string) => void;
}) => (
  <div className='flex items-center justify-between'>
    <Label className='text-muted-foreground'>{label}</Label>
    <Input
      type='number'
      placeholder='0'
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value)}
      className='h-8 w-20 text-center'
    />
  </div>
);