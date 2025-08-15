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
import { Sport, sportConfig } from '@/contexts/SportContext';
import { isAdmin } from '@/lib/config';
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
const SPORTS: Sport[] = ['pingpong', 'tennis'];

export function RoomsList({ targetUid }: RoomsListProps) {
  const { t } = useTranslation();
  const { user, userProfile: viewerProfile } = useAuth();
  const [visibleRooms, setVisibleRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);

  const isOwnProfile = user?.uid === targetUid;

  useEffect(() => {
    if (!targetUid) return;

    const fetchAndFilterRooms = async () => {
      setLoading(true);
      try {
        const promises = SPORTS.map((sport) => {
          const collectionName = sportConfig[sport].collections.rooms;
          const q = query(
            collection(db, collectionName),
            where('memberIds', 'array-contains', targetUid)
          );
          return getDocs(q).then((snapshot) =>
            snapshot.docs.map(
              (doc) => ({ id: doc.id, ...doc.data(), sport } as Room)
            )
          );
        });

        const results = await Promise.all(promises);
        const allUserRooms = results.flat();

        const viewerIsAdmin = isAdmin(user?.uid);
        const viewerIsFriend = viewerProfile?.friends?.includes(targetUid);
        const viewerRoomIds = new Set(viewerProfile?.rooms ?? []);

        const filteredRooms = allUserRooms.filter((room) => {
          if (viewerIsAdmin || isOwnProfile) return true;
          if (room.isPublic) return true;
          if (viewerIsFriend && viewerRoomIds.has(room.id)) return true;
          return false;
        });

        const activeRooms = filteredRooms.filter(
          (room) => !room.isArchived && (room.seasonHistory?.length ?? 0) === 0
        );

        setVisibleRooms(activeRooms);
      } catch (e) {
        console.error("Failed to fetch user's active rooms:", e);
      } finally {
        setLoading(false);
      }
    };

    fetchAndFilterRooms();
  }, [targetUid, isOwnProfile, user, viewerProfile]);

  if (loading) {
    return <Card className='h-48 animate-pulse bg-muted'></Card>;
  }

  if (visibleRooms.length === 0) {
    return null;
  }

  const cardTitle = t('Active Rooms');

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {cardTitle} ({visibleRooms.length})
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className='space-y-3'>
          {visibleRooms.slice(0, PREVIEW_COUNT).map((room) => (
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

                {!room.isPublic && (
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
