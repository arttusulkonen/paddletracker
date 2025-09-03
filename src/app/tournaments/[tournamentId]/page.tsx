// src/app/tournaments/[tournamentId]/page.tsx
'use client';

import BracketView from '@/components/BracketView';
import { ProtectedRoute } from '@/components/ProtectedRoutes';
import { TournamentHeader } from '@/components/tournaments/TournamentHeader';
import {
  Button,
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui';
import { useAuth } from '@/contexts/AuthContext';
import { useSport } from '@/contexts/SportContext';
import { useToast } from '@/hooks/use-toast';
import { db } from '@/lib/firebase';
import type { TournamentRoom } from '@/lib/types';
import { doc, getDoc } from 'firebase/firestore';
import { ArrowLeft } from 'lucide-react';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

export default function TournamentPage() {
  const { t } = useTranslation();
  const params = useParams();
  const router = useRouter();
  const tournamentId = params.tournamentId as string;
  const { user } = useAuth();
  const { toast } = useToast();
  const { sport } = useSport();
  const tournamentsEnabled = sport === 'pingpong';

  const [tournament, setTournament] = useState<TournamentRoom | null>(null);
  const [loading, setLoading] = useState(true);
  const [hasMounted, setHasMounted] = useState(false);

  useEffect(() => setHasMounted(true), []);

  const fetchTournament = useCallback(async () => {
    if (!tournamentId || !tournamentsEnabled) return;
    setLoading(true);
    try {
      const snap = await getDoc(doc(db, 'tournament-rooms', tournamentId));
      if (!snap.exists()) {
        toast({
          title: t('Error'),
          description: t('Tournament not found'),
          variant: 'destructive',
        });
        router.push('/tournaments');
        return;
      }
      const data = {
        id: snap.id,
        ...(snap.data() as any),
      } as TournamentRoom & { participantsIds?: string[] };

      if (data.sport && data.sport !== sport) {
        toast({
          title: t('Error'),
          description: t('Tournament does not belong to this sport'),
          variant: 'destructive',
        });
        router.push('/tournaments');
        return;
      }

      const viewerId = user?.uid ?? '';
      const isParticipant = Array.isArray(data.participantsIds)
        ? data.participantsIds.includes(viewerId)
        : (data.participants ?? []).some((p: any) => p.userId === viewerId);
      const isCreator = data.creator === viewerId;

      if (!isParticipant && !isCreator) {
        toast({
          title: t('Access denied'),
          description: t('You do not have access to this tournament.'),
          variant: 'destructive',
        });
        router.push('/tournaments');
        return;
      }

      setTournament(data as TournamentRoom);
    } catch (err) {
      console.error(err);
      toast({
        title: t('Error'),
        description: t('Could not load tournament'),
        variant: 'destructive',
      });
      router.push('/tournaments');
    } finally {
      setLoading(false);
    }
  }, [tournamentId, router, toast, t, tournamentsEnabled, sport, user?.uid]);

  useEffect(() => {
    if (hasMounted && tournamentsEnabled) {
      fetchTournament();
    }
  }, [fetchTournament, hasMounted, tournamentsEnabled]);

  if (!hasMounted) return null;

  if (!tournamentsEnabled) {
    return (
      <ProtectedRoute>
        <div className='container mx-auto py-8 px-4'>
          <Button
            variant='outline'
            className='mb-6'
            onClick={() => router.push('/tournaments')}
          >
            <ArrowLeft className='mr-2 h-4 w-4' /> {t('Back to Tournaments')}
          </Button>
          <Card>
            <CardHeader>
              <CardTitle>{t('Tournaments')}</CardTitle>
              <CardDescription>
                {t('Tournaments are not available for this sport yet.')}
              </CardDescription>
            </CardHeader>
          </Card>
        </div>
      </ProtectedRoute>
    );
  }

  if (loading || !tournament) {
    return (
      <div className='flex items-center justify-center min-h-[calc(100vh-10rem)]'>
        <div className='animate-spin h-16 w-16 rounded-full border-b-4 border-primary' />
      </div>
    );
  }

  const isCreator = user?.uid === tournament.creator;

  return (
    <ProtectedRoute>
      <div className='container mx-auto py-8 px-4'>
        <Button
          variant='outline'
          className='mb-6'
          onClick={() => router.push('/tournaments')}
        >
          <ArrowLeft className='mr-2 h-4 w-4' /> {t('Back to Tournaments')}
        </Button>

        <TournamentHeader tournament={tournament} isCreator={!!isCreator} />

        <BracketView tournament={tournament} onUpdate={fetchTournament} />
      </div>
    </ProtectedRoute>
  );
}
