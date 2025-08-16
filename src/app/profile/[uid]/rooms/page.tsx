// src/app/profile/[uid]/rooms/page.tsx
'use client';

import { ProtectedRoute } from '@/components/ProtectedRoutes';
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui';
import { useAuth } from '@/contexts/AuthContext';
import { Sport, sportConfig } from '@/contexts/SportContext';
import { db } from '@/lib/firebase';
import type { Room, UserProfile } from '@/lib/types';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
} from 'firebase/firestore';
import { ArrowLeft, LockIcon } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

const SPORTS: Sport[] = ['pingpong', 'tennis', 'badminton'];

function RoomListItem({ room }: { room: Room }) {
  const { t } = useTranslation();
  const isFinished = (room.seasonHistory?.length ?? 0) > 0;
  const status = room.isArchived
    ? 'Archived'
    : isFinished
    ? 'Finished'
    : 'Active';

  const statusStyles: { [key: string]: string } = {
    Active: 'border-green-500 bg-green-500/10 text-green-700',
    Finished: 'border-yellow-500 bg-yellow-500/10 text-yellow-700',
    Archived: 'border-red-500 bg-red-500/10 text-red-700',
  };

  return (
    <Link href={`/rooms/${room.id}`} className='block'>
      <Card className='hover:bg-muted/80 transition-colors'>
        <div className='p-4 flex items-center justify-between'>
          <div className='flex items-center gap-4'>
            <Avatar className='h-12 w-12'>
              <AvatarImage src={room.avatarURL ?? undefined} alt={room.name} />
              <AvatarFallback>{room.name.charAt(0)}</AvatarFallback>
            </Avatar>
            <div>
              <p className='font-bold flex items-center gap-2'>
                {room.name}
                {!room.isPublic && (
                  <LockIcon className='h-3 w-3 text-muted-foreground' />
                )}
              </p>
              <p className='text-sm text-muted-foreground'>
                {t(room.sport)} • {t('Members')} {room.memberIds.length}
              </p>
            </div>
          </div>
          <div
            className={`text-xs font-bold px-3 py-1 rounded-full border ${statusStyles[status]}`}
          >
            {t(status)}
          </div>
        </div>
      </Card>
    </Link>
  );
}

export default function UserRoomsPage() {
  const { t } = useTranslation();
  const params = useParams();
  const uid = params.uid as string;
  const { user, userProfile: viewerProfile, isGlobalAdmin } = useAuth();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const isOwnProfile = user?.uid === uid;

  useEffect(() => {
    if (!uid) return;

    const fetchUserData = async () => {
      setLoading(true);
      try {
        const userDoc = await getDoc(doc(db, 'users', uid));
        if (userDoc.exists()) {
          setUserProfile(userDoc.data() as UserProfile);
        }

        const promises = SPORTS.map((sport) => {
          const collectionName = sportConfig[sport].collections.rooms;
          const q = query(
            collection(db, collectionName),
            where('memberIds', 'array-contains', uid)
          );
          return getDocs(q).then((snapshot) =>
            snapshot.docs.map(
              (doc) => ({ id: doc.id, ...doc.data(), sport } as Room)
            )
          );
        });

        const results = await Promise.all(promises);
        const allUserRooms = results.flat();

        const viewerIsFriend = viewerProfile?.friends?.includes(uid);
        const viewerRoomIds = new Set(viewerProfile?.rooms ?? []);

        const filteredRooms = allUserRooms.filter((room) => {
          if (isGlobalAdmin || isOwnProfile) return true;
          if (room.isPublic) return true;
          if (viewerIsFriend && viewerRoomIds.has(room.id)) return true;
          return false;
        });

        filteredRooms.sort((a, b) => {
          const getScore = (r: Room) => {
            if (r.isArchived) return 2;
            if ((r.seasonHistory?.length ?? 0) > 0) return 1;
            return 0;
          };
          return getScore(a) - getScore(b);
        });

        setRooms(filteredRooms);
      } catch (e) {
        console.error("Failed to fetch user's rooms:", e);
      } finally {
        setLoading(false);
      }
    };

    fetchUserData();
  }, [uid, isOwnProfile, user, viewerProfile, isGlobalAdmin]);

  const displayName = userProfile?.displayName ?? userProfile?.name ?? 'User';
  const pageTitle = t('Rooms');
  const emptyStateText = isOwnProfile
    ? t("You haven't joined any rooms yet.")
    : t("This user isn't in any visible rooms.");

  return (
    <ProtectedRoute>
      <div className='container mx-auto max-w-4xl py-8 px-4'>
        <Button variant='ghost' asChild className='mb-4'>
          <Link href={`/profile/${uid}`}>
            <ArrowLeft className='mr-2 h-4 w-4' />
            {t('Back to Profile of')} {displayName}
          </Link>
        </Button>
        <Card>
          <CardHeader>
            <CardTitle className='text-2xl'>{pageTitle}</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className='space-y-4'>
                {[...Array(3)].map((_, i) => (
                  <div
                    key={i}
                    className='h-20 rounded-lg animate-pulse bg-muted'
                  ></div>
                ))}
              </div>
            ) : rooms.length > 0 ? (
              <div className='space-y-4'>
                {rooms.map((room) => (
                  <RoomListItem key={room.id} room={room} />
                ))}
              </div>
            ) : (
              <p className='text-center text-muted-foreground py-8'>
                {emptyStateText}
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </ProtectedRoute>
  );
}
