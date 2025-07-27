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
}

export function PingPongRowInput({
  data,
  onChange,
  onRemove,
  removable,
}: PingPongRowInputProps) {
  const { t } = useTranslation();

  // ✅ Упрощенная логика смены сторон
  const handleSideChange = (newSide: 'left' | 'right' | '') => {
    const newSide2 = newSide === 'left' ? 'right' : 'left';
    onChange({ ...data, side1: newSide, side2: newSide2 });
  };

  return (
    <div className='grid grid-cols-2 gap-4 mb-2 relative p-4 border rounded-lg bg-muted/50'>
      {/* --- Блок Игрока 1 --- */}
      <div className='space-y-2'>
        <Label>{t(`P1 Score`)}</Label>
        <Input
          type='number'
          placeholder='11'
          value={data.score1}
          onChange={(e) => onChange({ ...data, score1: e.target.value })}
        />
        <Label className='mt-2'>{t('Side')}</Label>
        <select
          className='w-full border rounded p-2 bg-background'
          value={data.side1}
          onChange={(e) => handleSideChange(e.target.value as 'left' | 'right')}
        >
          <option value='left'>{t('Left')}</option>
          <option value='right'>{t('Right')}</option>
        </select>
      </div>

      {/* --- Блок Игрока 2 --- */}
      <div className='space-y-2'>
        <Label>{t(`P2 Score`)}</Label>
        <Input
          type='number'
          placeholder='11'
          value={data.score2}
          onChange={(e) => onChange({ ...data, score2: e.target.value })}
        />
        <Label className='mt-2'>{t('Side')}</Label>
        <select
          className='w-full border rounded p-2 bg-muted'
          value={data.side2}
          disabled // ✅ Поле неактивно
          readOnly
        >
          <option value='left'>{t('Left')}</option>
          <option value='right'>{t('Right')}</option>
        </select>
      </div>

      {removable && (
        <Button
          variant='ghost'
          size='icon'
          className='absolute top-2 right-2 h-8 w-8'
          onClick={onRemove}
        >
          <Trash2 className='h-4 w-4' />
        </Button>
      )}
    </div>
  );
}
