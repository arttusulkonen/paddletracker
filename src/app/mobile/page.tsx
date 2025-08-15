// src/app/mobile/page.tsx
'use client';

import { RoomCard } from '@/components/rooms/RoomCard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui';
import { useAuth } from '@/contexts/AuthContext';
import { useSport } from '@/contexts/SportContext';
import { db } from '@/lib/firebase';
import type { Room } from '@/lib/types';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { UsersIcon } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

export default function MobileHomePage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { config } = useSport();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;

    setLoading(true);
    const q = query(
      collection(db, config.collections.rooms),
      where('memberIds', 'array-contains', user.uid)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const userRooms = snapshot.docs.map(
        (doc) => ({ id: doc.id, ...doc.data() } as Room)
      );
      setRooms(userRooms);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user, config.collections.rooms]);

  const sortedRooms = useMemo(() => {
    return [...rooms].sort((a, b) => {
      const getScore = (r: Room) => (r.isArchived ? 1 : 0);
      return getScore(a) - getScore(b);
    });
  }, [rooms]);

  // Тут можно будет добавить форму логина, если user не определен
  if (!user) {
    return (
      <div className='flex items-center justify-center h-screen'>
        {t('Please login')}
      </div>
    );
  }

  return (
    <div className='container mx-auto py-4 px-2'>
      <Card>
        <CardHeader>
          <CardTitle className='flex items-center gap-2'>
            <UsersIcon className='h-6 w-6 text-primary' />
            {t('My Rooms')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className='text-center p-8'>{t('Loading rooms...')}</div>
          ) : (
            <div className='grid grid-cols-1 gap-4'>
              {sortedRooms.map((room) => (
                <RoomCard key={room.id} room={room} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}