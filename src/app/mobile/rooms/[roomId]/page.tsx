// src/app/mobile/rooms/[roomId]/page.tsx
'use client';

import { MobileMembersList } from '@/components/mobile/MobileMembersList';
import { MobileRecordBlock } from '@/components/mobile/MobileRecordBlock';
import { Button } from '@/components/ui';
import { useAuth } from '@/contexts/AuthContext';
import { useSport } from '@/contexts/SportContext';
import { db } from '@/lib/firebase';
import type { Room } from '@/lib/types';
import { doc, onSnapshot } from 'firebase/firestore';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

export default function MobileRoomPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { config } = useSport();
  const { roomId } = useParams<{ roomId: string }>();
  const [room, setRoom] = useState<Room | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!roomId) return;
    const unsub = onSnapshot(
      doc(db, config.collections.rooms, roomId),
      (snap) => {
        if (snap.exists()) {
          setRoom({ id: snap.id, ...snap.data() } as Room);
        }
        setLoading(false);
      }
    );
    return () => unsub();
  }, [roomId, config.collections.rooms]);

  if (loading) {
    return (
      <div className='flex items-center justify-center min-h-screen'>
        <div className='animate-spin h-12 w-12 rounded-full border-b-2 border-primary' />
      </div>
    );
  }

  if (!room) {
    return <div className='text-center p-8'>{t('Room not found')}</div>;
  }

  const isCreator = room.creator === user?.uid;

  return (
    <div className='container mx-auto py-4 px-2 space-y-4'>
      <Button variant='ghost' asChild className='mb-2'>
        <Link href='/mobile'>
          <ArrowLeft className='mr-2 h-4 w-4' />
          {t('Back to Rooms')}
        </Link>
      </Button>

      <h1 className='text-2xl font-bold'>{room.name}</h1>

      <MobileRecordBlock members={room.members} roomId={room.id} room={room} />
      <MobileMembersList members={room.members} />
    </div>
  );
}