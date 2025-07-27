// src/components/profile/RoomsList.tsx
'use client';
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui';
import { useAuth } from '@/contexts/AuthContext';
import { sportConfig } from '@/contexts/SportContext';
import { db } from '@/lib/firebase';
import type { Room } from '@/lib/types';
// ✅ Убираем `where` из импортов, так как он будет использоваться в условной логике
import { collection, getDocs, query, where } from 'firebase/firestore';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

interface RoomsListProps {
  targetUid: string;
}

const PREVIEW_COUNT = 4;
const SPORTS = ['pingpong', 'tennis'];

export function RoomsList({ targetUid }: RoomsListProps) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [activeRooms, setActiveRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);

  const isOwnProfile = user?.uid === targetUid;

  useEffect(() => {
    const fetchRooms = async () => {
      setLoading(true);
      try {
        const promises = SPORTS.map((sport) => {
          const collectionName = sportConfig[sport as keyof typeof sportConfig].collections.rooms;

          // ✅ Создаем базовый запрос
          let q = query(
            collection(db, collectionName),
            where('memberIds', 'array-contains', targetUid)
          );

          // ✅ Если мы на чужой странице, добавляем фильтр по публичным комнатам
          if (!isOwnProfile) {
            q = query(q, where('isPublic', '==', true));
          }

          return getDocs(q).then((snapshot) =>
            snapshot.docs.map(
              (doc) => ({ id: doc.id, ...doc.data(), sport } as Room)
            )
          );
        });

        const results = await Promise.all(promises);
        const allUserRooms = results.flat();

        // Фильтруем комнаты, оставляя только активные (эта логика не меняется)
        const filteredActiveRooms = allUserRooms.filter(
          (room) => !room.isArchived && (room.seasonHistory?.length ?? 0) === 0
        );

        setActiveRooms(filteredActiveRooms);
      } catch (e) {
        console.error("Failed to fetch user's active rooms:", e);
      } finally {
        setLoading(false);
      }
    };
    fetchRooms();
  }, [targetUid, isOwnProfile]); // ✅ Добавляем isOwnProfile в зависимости

  if (loading) {
    return <Card className='h-48 animate-pulse bg-muted'></Card>;
  }

  if (activeRooms.length === 0) {
    return null;
  }

  // ✅ Заголовок теперь тоже динамический
  const cardTitle = isOwnProfile
    ? t('My Active Rooms')
    : t('Active Public Rooms');

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {cardTitle} ({activeRooms.length})
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className='space-y-3'>
          {activeRooms.slice(0, PREVIEW_COUNT).map((room) => (
            <Link
              href={`/rooms/${room.id}`}
              key={room.id}
              className='flex items-center gap-3 p-2 rounded-lg hover:bg-muted transition-colors'
            >
              <Avatar className='h-10 w-10 relative'>
                <AvatarImage
                  src={room.avatarURL ?? undefined}
                  alt={room.name}
                />
                <AvatarFallback>{room.name.charAt(0)}</AvatarFallback>

                {!room.isPublic && isOwnProfile && (
                  <div className='absolute bottom-0 right-0 bg-secondary p-0.5 rounded-full border-2 border-card'>
                    <svg
                      xmlns='http://www.w3.org/2000/svg'
                      width='12'
                      height='12'
                      viewBox='0 0 24 24'
                      fill='none'
                      stroke='currentColor'
                      strokeWidth='2.5'
                      strokeLinecap='round'
                      strokeLinejoin='round'
                    >
                      <rect
                        x='3'
                        y='11'
                        width='18'
                        height='11'
                        rx='2'
                        ry='2'
                      ></rect>
                      <path d='M7 11V7a5 5 0 0 1 10 0v4'></path>
                    </svg>
                  </div>
                )}
              </Avatar>
              <div>
                <p className='font-semibold text-sm leading-tight'>
                  {room.name}
                </p>
                <p className='text-xs text-muted-foreground'>
                  {t(room.sport)} • {t('Members')} {room.memberIds.length}
                </p>
              </div>
            </Link>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
