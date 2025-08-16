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

  return (
    <div className='flex flex-col gap-4 mb-2 relative p-4 border rounded-lg bg-muted/50'>
      <div className='flex justify-between items-center'>
        <Label className='font-bold text-lg'>
          {t('Set')} {setIndex + 1}
        </Label>
        {removable && (
          <Button
            variant='ghost'
            size='icon'
            className='h-8 w-8'
            onClick={onRemove}
          >
            <Trash2 className='h-4 w-4 text-destructive' />
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
            className='text-center text-base font-bold'
          />
        </div>
        <div className='space-y-1'>
          <Label>{t('P2 Games')}</Label>
          <Input
            type='number'
            placeholder='4'
            value={data.score2}
            onChange={(e) => handleStatChange('score2', e.target.value)}
            className='text-center text-base font-bold'
          />
        </div>
      </div>

      <div className='grid grid-cols-2 gap-x-4 gap-y-2 text-sm'>
        {/* Aces */}
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

        {/* Double Faults */}
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

        {/* Winners */}
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

// Вспомогательный компонент для полей ввода статистики
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
