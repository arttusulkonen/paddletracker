// src/components/profile/RoomsList.tsx
'use client';

import {
  Avatar,
  AvatarFallback,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui';
import { db } from '@/lib/firebase';
import type { Room } from '@/lib/types';
import { collection, getDocs, query, where } from 'firebase/firestore';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

interface RoomsListProps {
  targetUid: string;
}

const PREVIEW_COUNT = 4;

export function RoomsList({ targetUid }: RoomsListProps) {
  const { t } = useTranslation();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchRooms = async () => {
      setLoading(true);
      try {
        const q = query(
          collection(db, 'rooms'), // Упрощено для примера
          where('memberIds', 'array-contains', targetUid),
          where('isPublic', '==', true)
        );
        const snap = await getDocs(q);
        const userRooms = snap.docs.map(
          (doc) => ({ id: doc.id, ...doc.data() } as Room)
        );
        setRooms(userRooms);
      } catch (e) {
        console.error("Failed to fetch user's rooms:", e);
      } finally {
        setLoading(false);
      }
    };
    fetchRooms();
  }, [targetUid]);

  if (loading) {
    return <Card className='h-48 animate-pulse bg-muted'></Card>;
  }

  if (rooms.length === 0) {
    return null; // Не показываем блок, если нет комнат
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {t('Public Rooms')} ({rooms.length})
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className='space-y-3'>
          {rooms.slice(0, PREVIEW_COUNT).map((room) => (
            <Link
              href={`/rooms/${room.id}`}
              key={room.id}
              className='flex items-center gap-3 p-2 rounded-lg hover:bg-muted transition-colors'
            >
              <Avatar className='h-10 w-10'>
                <AvatarFallback>{room.name.charAt(0)}</AvatarFallback>
              </Avatar>
              <div>
                <p className='font-semibold text-sm leading-tight'>
                  {room.name}
                </p>
                <p className='text-xs text-muted-foreground'>
                  {t('Members')}: {room.memberIds.length}
                </p>
              </div>
            </Link>
          ))}
        </div>
        {rooms.length > PREVIEW_COUNT && (
          <Button variant='outline' className='w-full mt-4'>
            {t('Show All')}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
