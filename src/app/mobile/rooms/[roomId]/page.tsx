'use client';

import { MobileMembersList } from '@/components/mobile/MobileMembersList';
import { MobileRecordBlock } from '@/components/mobile/MobileRecordBlock';
import { RecentMatchesMobile } from '@/components/mobile/RecentMatchesMobile';
import { Button } from '@/components/ui';
import { Sport, sportConfig, useSport } from '@/contexts/SportContext';
import { useToast } from '@/hooks/use-toast';
import { db } from '@/lib/firebase';
import type { Room } from '@/lib/types';
import { doc, getDoc, onSnapshot } from 'firebase/firestore';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

const KNOWN_SPORTS: Sport[] = ['pingpong', 'tennis', 'badminton'];

export default function MobileRoomPage() {
  const { t } = useTranslation();
  const { config, sport, setSport } = useSport();
  const { toast } = useToast();
  const sportRef = useRef<Sport | undefined>(sport);
  const { roomId } = useParams<{ roomId: string }>();
  const [room, setRoom] = useState<(Room & { sport?: Sport }) | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    sportRef.current = sport;
  }, [sport]);

  useEffect(() => {
    if (!roomId) return;
    let unsub: (() => void) | undefined;
    let cancelled = false;

    const subscribeTo = (sp: Sport) => {
      const ref = doc(db!, sportConfig[sp].collections.rooms, roomId);
      unsub = onSnapshot(
        ref,
        (snap) => {
          if (!snap.exists()) {
            setLoading(false);
            setRoom(null);
            return;
          }
          const data = snap.data() as any;
          setRoom({ id: snap.id, ...data, sport: sp } as Room & {
            sport: Sport;
          });
          if (sportRef.current !== sp) {
            setSport?.(sp);
            sportRef.current = sp;
          }
          setLoading(false);
        },
        (err) => {
          console.error(err);
          toast({
            title: t('Error'),
            description: t('Failed to load this room.'),
            variant: 'destructive',
          });
          setLoading(false);
        }
      );
    };

    (async () => {
      setLoading(true);
      try {
        const currentRef = doc(db!, config.collections.rooms, roomId);
        const currentSnap = await getDoc(currentRef);
        if (cancelled) return;

        if (currentSnap.exists()) {
          const data = currentSnap.data() as any;
          const spFromDoc =
            (data.sport as Sport | undefined) ?? sportRef.current ?? 'pingpong';
          subscribeTo(spFromDoc);
          return;
        }

        for (const sp of KNOWN_SPORTS) {
          const ref = doc(db!, sportConfig[sp].collections.rooms, roomId);
          const snap = await getDoc(ref);
          if (cancelled) return;
          if (snap.exists()) {
            subscribeTo(sp);
            return;
          }
        }

        setRoom(null);
      } catch (e) {
        console.error(e);
        toast({
          title: t('Error'),
          description: t('Failed to load this room.'),
          variant: 'destructive',
        });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      if (unsub) unsub();
    };
  }, [roomId, setSport, config.collections.rooms, toast, t]);

  if (loading) {
    return (
      <div className='flex items-center justify-center min-h-screen'>
        <div className='animate-spin h-12 w-12 rounded-full border-b-2 border-primary' />
      </div>
    );
  }

  if (!room) {
    return (
      <div className='container mx-auto py-8 px-4 space-y-4 text-center'>
        <p className='text-muted-foreground'>{t('Room not found')}</p>
        <Button variant='outline' asChild>
          <Link href='/mobile'>
            <ArrowLeft className='mr-2 h-4 w-4' />
            {t('Back to Rooms')}
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className='container mx-auto py-4 px-2 space-y-4'>
      <Button variant='ghost' asChild className='mb-2'>
        <Link href='/mobile' aria-label={t('Back to Rooms')}>
          <ArrowLeft className='mr-2 h-4 w-4' />
          {t('Back to Rooms')}
        </Link>
      </Button>

      <header className='space-y-1'>
        <h1 className='text-2xl font-bold'>{room.name}</h1>
        {room.isArchived ? (
          <p className='text-xs uppercase tracking-wide text-muted-foreground'>
            {t('Archived')}
          </p>
        ) : room.seasonHistory?.length ? (
          <p className='text-xs uppercase tracking-wide text-muted-foreground'>
            {t('Season finished')}
          </p>
        ) : null}
      </header>

      <MobileRecordBlock room={room} roomId={room.id} members={room.members} />
      <MobileMembersList roomId={room.id} initialMembers={room.members} />
      <RecentMatchesMobile roomId={room.id} members={room.members} />
    </div>
  );
}
