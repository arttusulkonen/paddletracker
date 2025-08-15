// src/components/mobile/MobileRecordBlock.tsx
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
import { Plus, Sword } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

interface MobileRecordBlockProps {
  members: Room['members'];
  roomId: string;
  room: Room;
}

type MatchInput = { score1: string; score2: string };

export function MobileRecordBlock({
  members,
  roomId,
  room,
}: MobileRecordBlockProps) {
  const { t } = useTranslation();
  const { sport, config } = useSport();
  const { toast } = useToast();

  const [player1Id, setPlayer1Id] = useState('');
  const [player2Id, setPlayer2Id] = useState('');
  const [matches, setMatches] = useState<MatchInput[]>([
    { score1: '', score2: '' },
  ]);
  const [isRecording, setIsRecording] = useState(false);

  const updateMatch = (
    index: number,
    field: 'score1' | 'score2',
    value: string
  ) => {
    const newMatches = [...matches];
    newMatches[index][field] = value;
    setMatches(newMatches);
  };

  const addMatch = () => setMatches([...matches, { score1: '', score2: '' }]);

  const saveMatches = async () => {
    if (!player1Id || !player2Id || player1Id === player2Id) {
      toast({
        title: t('Select two different players'),
        variant: 'destructive',
      });
      return;
    }

    // Basic validation
    const invalidMatch = matches.find(
      ({ score1, score2 }) => !score1.trim() || !score2.trim()
    );
    if (invalidMatch) {
      toast({ title: t('Scores cannot be empty'), variant: 'destructive' });
      return;
    }

    setIsRecording(true);
    const success = await processAndSaveMatches(
      roomId,
      room,
      player1Id,
      player2Id,
      matches,
      members,
      sport,
      config
    );

    if (success) {
      toast({ title: t('Matches recorded') });
      setPlayer1Id('');
      setPlayer2Id('');
      setMatches([{ score1: '', score2: '' }]);
    } else {
      toast({ title: t('Failed to record matches'), variant: 'destructive' });
    }
    setIsRecording(false);
  };

  const sortedMembers = [...members].sort((a, b) =>
    a.name.localeCompare(b.name)
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className='text-xl flex items-center gap-2'>
          <Sword /> {t('Record Match')}
        </CardTitle>
      </CardHeader>
      <CardContent className='space-y-4'>
        <div className='grid grid-cols-2 gap-4'>
          <div>
            <Label>{t('Player 1')}</Label>
            <select
              value={player1Id}
              onChange={(e) => setPlayer1Id(e.target.value)}
              className='w-full border rounded p-2 bg-input'
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
              className='w-full border rounded p-2 bg-input'
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

        {matches.map((match, index) => (
          <div key={index} className='flex items-center gap-2'>
            <Input
              type='number'
              placeholder={t('P1 Score')}
              value={match.score1}
              onChange={(e) => updateMatch(index, 'score1', e.target.value)}
            />
            <span>-</span>
            <Input
              type='number'
              placeholder={t('P2 Score')}
              value={match.score2}
              onChange={(e) => updateMatch(index, 'score2', e.target.value)}
            />
          </div>
        ))}

        <div className='flex justify-between items-center gap-4'>
          <Button variant='outline' onClick={addMatch} className='flex-1'>
            <Plus className='h-4 w-4 mr-2' /> {t('Add Game')}
          </Button>
          <Button
            onClick={saveMatches}
            disabled={isRecording}
            className='flex-1'
          >
            {isRecording ? t('Saving...') : t('Save')}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
