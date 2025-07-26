'use client';

import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/lib/firebase';
import * as Friends from '@/lib/friends';
import { getFinnishFormattedDate } from '@/lib/utils';
import {
  arrayRemove,
  arrayUnion,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  updateDoc,
  where,
} from 'firebase/firestore';
import { Check, X } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

type LiteUser = { uid: string; name: string; photoURL?: string };

type RoomRequest = { fromUser: LiteUser; toRoom: { id: string; name: string } };

export default function FriendRequestsPage() {
  const { t } = useTranslation();
  const { user, userProfile } = useAuth();
  const [friendRequests, setFriendRequests] = useState<LiteUser[]>([]);
  const [roomRequests, setRoomRequests] = useState<RoomRequest[]>([]);
  const [loading, setLoading] = useState(true);

  const [hasMounted, setHasMounted] = useState(false);

  useEffect(() => {
    setHasMounted(true);

    const load = async () => {
      if (!user || !userProfile) {
        setLoading(false);
        return;
      }
      setLoading(true);
      const incomingFriends = userProfile?.incomingRequests ?? [];
      const friendReqPromises = incomingFriends.map(async (uid) => {
        const userDoc = await getDoc(doc(db, 'users', uid));
        if (userDoc.exists()) {
          const d = userDoc.data();
          return {
            uid,
            name: d.name ?? d.email ?? t('Unknown'),
            photoURL: d.photoURL,
          };
        }
        return null;
      });
      setFriendRequests(
        (await Promise.all(friendReqPromises)).filter(Boolean) as LiteUser[]
      );

      const ownedRoomsQuery = query(
        collection(db, 'rooms'),
        where('creator', '==', user.uid)
      );
      const ownedRoomsSnap = await getDocs(ownedRoomsQuery);
      const roomReqArr: RoomRequest[] = [];
      const roomReqPromises = ownedRoomsSnap.docs.map(async (roomDoc) => {
        const roomData = roomDoc.data();
        const requestUids = roomData.joinRequests ?? [];
        for (const uid of requestUids) {
          const userDoc = await getDoc(doc(db, 'users', uid));
          if (userDoc.exists()) {
            const userData = userDoc.data();
            roomReqArr.push({
              fromUser: {
                uid,
                name: userData.name ?? userData.email ?? t('Unknown'),
                photoURL: userData.photoURL,
              },
              toRoom: { id: roomDoc.id, name: roomData.name },
            });
          }
        }
      });
      await Promise.all(roomReqPromises);
      setRoomRequests(roomReqArr);

      setLoading(false);
    };

    load();
  }, [user, userProfile, t]);

  // --- НАЧАЛО: ВОССТАНОВЛЕННАЯ ФУНКЦИЯ ---
  const handleFriend = async (friendUid: string, accept: boolean) => {
    if (!user) return;

    if (accept) {
      await Friends.acceptRequest(user.uid, friendUid);
    } else {
      await Friends.declineRequest(user.uid, friendUid);
    }

    // Обновляем состояние, чтобы убрать запрос из списка
    setFriendRequests((prev) => prev.filter((req) => req.uid !== friendUid));
  };
  // --- КОНЕЦ: ВОССТАНОВЛЕННАЯ ФУНКЦИЯ ---

  const handleRoom = async (req: RoomRequest, accept: boolean) => {
    if (!user) return;
    const roomRef = doc(db, 'rooms', req.toRoom.id);
    await updateDoc(roomRef, { joinRequests: arrayRemove(req.fromUser.uid) });

    if (accept) {
      const userDoc = await getDoc(doc(db, 'users', req.fromUser.uid));
      if (!userDoc.exists()) return;
      const userData = userDoc.data();
      const newMember = {
        userId: req.fromUser.uid,
        name: userData.name ?? userData.displayName ?? 'New Player',
        email: userData.email,
        rating: 1000,
        wins: 0,
        losses: 0,
        date: getFinnishFormattedDate(),
        role: 'editor',
      };
      await updateDoc(roomRef, {
        members: arrayUnion(newMember),
        memberIds: arrayUnion(req.fromUser.uid),
      });
    }
    setRoomRequests((prev) =>
      prev.filter(
        (r) =>
          !(
            r.fromUser.uid === req.fromUser.uid && r.toRoom.id === req.toRoom.id
          )
      )
    );
  };

  if (!hasMounted) {
    return null;
  }

  return (
    <div className='container mx-auto py-8 max-w-xl'>
      <Card>
        <CardHeader>
          <CardTitle>{t('Your Requests')}</CardTitle>
          <CardDescription>
            {t('Manage friend requests and room join requests.')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className='text-center py-6'>{t('Loading…')}</p>
          ) : (
            <div className='space-y-6'>
              <div>
                <h3 className='font-semibold mb-2'>{t('Friend Requests')}</h3>
                {friendRequests.length === 0 ? (
                  <p className='text-center text-sm text-muted-foreground py-4'>
                    {t('No new friend requests.')}
                  </p>
                ) : (
                  <ul className='space-y-3'>
                    {friendRequests.map((r) => (
                      <li
                        key={r.uid}
                        className='flex items-center justify-between p-2 rounded-md hover:bg-muted/50'
                      >
                        <div className='flex items-center gap-3'>
                          <Avatar className='h-10 w-10'>
                            <AvatarImage src={r.photoURL || undefined} />
                            <AvatarFallback>{r.name[0]}</AvatarFallback>
                          </Avatar>
                          <Link
                            href={`/profile/${r.uid}`}
                            className='font-medium hover:underline'
                          >
                            {r.name}
                          </Link>
                        </div>
                        <div className='flex gap-2'>
                          <Button
                            size='icon'
                            variant='outline'
                            onClick={() => handleFriend(r.uid, false)}
                          >
                            <X className='h-4 w-4 text-destructive' />
                          </Button>
                          <Button
                            size='icon'
                            onClick={() => handleFriend(r.uid, true)}
                          >
                            <Check className='h-4 w-4' />
                          </Button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div>
                <h3 className='font-semibold mb-2'>
                  {t('Room Join Requests')}
                </h3>
                {roomRequests.length === 0 ? (
                  <p className='text-center text-sm text-muted-foreground py-4'>
                    {t('No new room join requests.')}
                  </p>
                ) : (
                  <ul className='space-y-3'>
                    {roomRequests.map((r) => (
                      <li
                        key={`${r.fromUser.uid}-${r.toRoom.id}`}
                        className='flex items-center justify-between p-2 rounded-md hover:bg-muted/50'
                      >
                        <div className='flex items-center gap-3'>
                          <Avatar className='h-10 w-10'>
                            <AvatarImage
                              src={r.fromUser.photoURL || undefined}
                            />
                            <AvatarFallback>
                              {r.fromUser.name[0]}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <Link
                              href={`/profile/${r.fromUser.uid}`}
                              className='font-medium hover:underline'
                            >
                              {r.fromUser.name}
                            </Link>
                            <p className='text-sm text-muted-foreground'>
                              {t('wants to join')}{' '}
                              <Link
                                href={`/rooms/${r.toRoom.id}`}
                                className='font-semibold hover:underline'
                              >
                                {r.toRoom.name}
                              </Link>
                            </p>
                          </div>
                        </div>
                        <div className='flex gap-2'>
                          <Button
                            size='icon'
                            variant='outline'
                            onClick={() => handleRoom(r, false)}
                          >
                            <X className='h-4 w-4 text-destructive' />
                          </Button>
                          <Button
                            size='icon'
                            onClick={() => handleRoom(r, true)}
                          >
                            <Check className='h-4 w-4' />
                          </Button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
