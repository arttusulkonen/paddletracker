// src/components/rooms/DerbySimulator.tsx
'use client';

import { Button } from '@/components/ui';
import { useToast } from '@/hooks/use-toast';
import { app } from '@/lib/firebase';
import type { Member } from '@/lib/types';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { Sparkles } from 'lucide-react';
import { useState } from 'react';

interface DerbySimulatorProps {
  roomId: string;
  members: Member[];
  sport: string;
}

export function DerbySimulator({
  roomId,
  members,
  sport,
}: DerbySimulatorProps) {
  const [isSimulating, setIsSimulating] = useState(false);
  const { toast } = useToast();

  const runSimulation = async () => {
    if (members.length < 3 || !app) return;
    setIsSimulating(true);

    try {
      const functionsInstance = getFunctions(app, 'europe-west1');
      const recordMatch = httpsCallable(functionsInstance, 'recordMatch');

      const pA = members[0].userId;
      const pB = members[1].userId;
      const pC = members[2].userId;

      const scenarios = [
        {
          p1: pA,
          p2: pB,
          matches: [
            { score1: 11, score2: 4 },
            { score1: 11, score2: 5 },
            { score1: 11, score2: 2 },
            { score1: 11, score2: 8 },
            { score1: 11, score2: 9 },
          ],
        },
        {
          p1: pA,
          p2: pC,
          matches: [
            { score1: 11, score2: 0 },
            { score1: 11, score2: 1 },
            { score1: 11, score2: 2 },
            { score1: 11, score2: 3 },
            { score1: 11, score2: 4 },
          ],
        },
        {
          p1: pB,
          p2: pA,
          matches: [{ score1: 14, score2: 12 }],
        },
        {
          p1: pC,
          p2: pB,
          matches: [
            { score1: 11, score2: 9 },
            { score1: 9, score2: 11 },
            { score1: 12, score2: 10 },
            { score1: 10, score2: 12 },
          ],
        },
        {
          p1: pB,
          p2: pA,
          matches: [
            { score1: 11, score2: 5 },
            { score1: 11, score2: 6 },
            { score1: 11, score2: 7 },
            { score1: 11, score2: 8 },
          ],
        },
        {
          p1: pA,
          p2: pB,
          matches: [{ score1: 15, score2: 13 }],
        },
      ];

      for (const s of scenarios) {
        await recordMatch({
          roomId,
          sport,
          player1Id: s.p1,
          player2Id: s.p2,
          matches: s.matches,
        });
      }

      toast({
        title: 'Simulation Complete',
        description: 'Check the Derby Feed for the generated chronicles!',
      });
    } catch (e) {
      console.error(e);
      toast({
        title: 'Simulation Failed',
        variant: 'destructive',
      });
    } finally {
      setIsSimulating(false);
    }
  };

  if (members.length < 3) return null;

  return (
    <Button
      onClick={runSimulation}
      disabled={isSimulating}
      variant='secondary'
      className='w-full mb-8 border-2 border-dashed border-primary/50 text-primary hover:bg-primary/10 transition-all'
    >
      <Sparkles className='mr-2 h-4 w-4' />
      {isSimulating ? 'Generating Timeline...' : 'Simulate Match Timeline'}
    </Button>
  );
}