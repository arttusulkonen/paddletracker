// src/app/friend-requests/page.tsx
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
import { Sport, sportConfig } from '@/contexts/SportContext';
import { useToast } from '@/hooks/use-toast';
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

type RoomRequest = {
  fromUser: LiteUser;
  toRoom: {
    id: string;
    name: string;
    collectionName: string;
  };
};

const initialOf = (s?: string) =>
  s && s.trim() ? s.trim().charAt(0).toUpperCase() : '?';

export default function FriendRequestsPage() {
  const { t } = useTranslation();
  const { user, userProfile } = useAuth();
  const { toast } = useToast();

  const [friendRequests, setFriendRequests] = useState<LiteUser[]>([]);
  const [roomRequests, setRoomRequests] = useState<RoomRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMounted, setHasMounted] = useState(false);

  useEffect(() => {
    setHasMounted(true);
  }, []);

  useEffect(() => {
    const loadRequests = async () => {
      // ИСПРАВЛЕНИЕ: Добавили проверку db
      if (!user || !userProfile || !db) {
        setLoading(false);
        return;
      }
      setLoading(true);

      try {
        const incomingFriends = userProfile?.incomingRequests ?? [];
        const friendReqPromises = incomingFriends.map((uid) =>
          Friends.getUserLite(uid)
        );
        const fr = (await Promise.all(friendReqPromises)).filter(
          Boolean
        ) as LiteUser[];
        setFriendRequests(fr);

        const allRoomRequests: RoomRequest[] = [];

        const sports = Object.keys(sportConfig) as Sport[];
        for (const sportKey of sports) {
          const roomsCollectionName = sportConfig[sportKey].collections.rooms;

          const ownedRoomsSnap = await getDocs(
            query(
              collection(db, roomsCollectionName),
              where('creator', '==', user.uid)
            )
          );

          for (const roomDoc of ownedRoomsSnap.docs) {
            const roomData = roomDoc.data() as any;
            const requestUids: string[] = Array.isArray(roomData.joinRequests)
              ? roomData.joinRequests
              : [];

            if (requestUids.length === 0) continue;

            const userDocs = await Promise.all(
              requestUids.map((uid) => getDoc(doc(db!, 'users', uid)))
            );

            userDocs.forEach((snap, idx) => {
              if (!snap.exists()) return;
              const u = snap.data() as any;
              allRoomRequests.push({
                fromUser: {
                  uid: requestUids[idx],
                  name: u.name ?? u.displayName ?? u.email ?? t('Unknown'),
                  photoURL: u.photoURL,
                },
                toRoom: {
                  id: roomDoc.id,
                  name: roomData.name ?? t('Unnamed room'),
                  collectionName: roomsCollectionName,
                },
              });
            });
          }
        }

        setRoomRequests(allRoomRequests);
      } catch (error) {
        console.error(error);
        toast({
          title: t('Error'),
          description: t('Failed to load requests. Please try again.'),
          variant: 'destructive',
        });
      } finally {
        setLoading(false);
      }
    };

    if (hasMounted && user) {
      loadRequests();
    }
  }, [hasMounted, user, userProfile, toast, t]);

  const handleFriendRequest = async (friendUid: string, accept: boolean) => {
    if (!user) return;
    try {
      if (accept) {
        await Friends.acceptRequest(user.uid, friendUid);
      } else {
        await Friends.declineRequest(user.uid, friendUid);
      }
      setFriendRequests((prev) => prev.filter((req) => req.uid !== friendUid));
      toast({
        title: accept ? t('Friend added') : t('Request declined'),
      });
    } catch {
      toast({
        title: t('Error'),
        description: t('Try again later.'),
        variant: 'destructive',
      });
    }
  };

  const handleRoomRequest = async (req: RoomRequest, accept: boolean) => {
    if (!user || !db) return;

    const roomRef = doc(db, req.toRoom.collectionName, req.toRoom.id);

    try {
      await updateDoc(roomRef, { joinRequests: arrayRemove(req.fromUser.uid) });

      if (accept) {
        const userSnap = await getDoc(doc(db, 'users', req.fromUser.uid));
        if (!userSnap.exists()) {
          setRoomRequests((prev) =>
            prev.filter(
              (r) =>
                !(
                  r.fromUser.uid === req.fromUser.uid &&
                  r.toRoom.id === req.toRoom.id
                )
            )
          );
          return;
        }
        const u = userSnap.data() as any;
        const newMember = {
          userId: req.fromUser.uid,
          name: u.name ?? u.displayName ?? 'New Player',
          email: u.email ?? '',
          rating: 1000,
          wins: 0,
          losses: 0,
          date: getFinnishFormattedDate(),
          role: 'editor' as const,
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
              r.fromUser.uid === req.fromUser.uid &&
              r.toRoom.id === req.toRoom.id
            )
        )
      );

      toast({
        title: accept ? t('Request approved') : t('Request declined'),
      });
    } catch {
      toast({
        title: t('Error'),
        description: t('Try again later.'),
        variant: 'destructive',
      });
    }
  };

  if (!hasMounted) return null;

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
                            <AvatarFallback>{initialOf(r.name)}</AvatarFallback>
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
                            onClick={() => handleFriendRequest(r.uid, false)}
                            aria-label={t('Decline')}
                            title={t('Decline')}
                          >
                            <X className='h-4 w-4 text-destructive' />
                          </Button>
                          <Button
                            size='icon'
                            onClick={() => handleFriendRequest(r.uid, true)}
                            aria-label={t('Accept')}
                            title={t('Accept')}
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
                              {initialOf(r.fromUser.name)}
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
                            onClick={() => handleRoomRequest(r, false)}
                            aria-label={t('Decline')}
                            title={t('Decline')}
                          >
                            <X className='h-4 w-4 text-destructive' />
                          </Button>
                          <Button
                            size='icon'
                            onClick={() => handleRoomRequest(r, true)}
                            aria-label={t('Approve')}
                            title={t('Approve')}
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