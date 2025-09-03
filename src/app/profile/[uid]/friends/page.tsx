// src/app/profile/[uid]/friends/page.tsx
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
import { db } from '@/lib/firebase';
import * as Friends from '@/lib/friends';
import type { UserProfile } from '@/lib/types';
import { doc, getDoc } from 'firebase/firestore';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

function FriendListItem({ friend }: { friend: UserProfile & { uid: string } }) {
  return (
    <Link href={`/profile/${friend.uid}`}>
      <Card className='hover:bg-muted transition-colors h-full'>
        <CardContent className='p-4 flex items-center gap-4'>
          <Avatar className='h-12 w-12'>
            <AvatarImage src={friend.photoURL ?? undefined} />
            <AvatarFallback>{(friend.name || friend.displayName || '?').charAt(0)}</AvatarFallback>
          </Avatar>
          <p className='font-semibold'>{friend.name || friend.displayName || 'Unknown Friend'}</p>
        </CardContent>
      </Card>
    </Link>
  );
}

export default function UserFriendsPage() {
  const { t } = useTranslation();
  const params = useParams();
  const uid = params.uid as string;

  const [friends, setFriends] = useState<(UserProfile & { uid: string })[]>([]);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!uid) return;

    const fetchAllData = async () => {
      setLoading(true);
      try {
        const userDoc = await getDoc(doc(db, 'users', uid));
        if (userDoc.exists()) {
          const profile = userDoc.data() as UserProfile;
          setUserProfile(profile);

          if (profile.friends && profile.friends.length > 0) {
            const friendData = await Friends.getMultipleUsersLite(
              profile.friends
            );
            setFriends(
              friendData.sort((a, b) => {
                const an = a.name || a.displayName || '';
                const bn = b.name || b.displayName || '';
                return an.localeCompare(bn);
              })
            );
          } else {
            setFriends([]);
          }
        }
      } catch (e) {
        console.error("Failed to fetch user's friends:", e);
      } finally {
        setLoading(false);
      }
    };

    fetchAllData();
  }, [uid]);

  const displayName = userProfile?.displayName ?? userProfile?.name ?? 'User';

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
            <CardTitle className='text-2xl'>
              {t('All Friends')} ({friends.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4'>
                {[...Array(6)].map((_, i) => (
                  <div
                    key={i}
                    className='h-24 rounded-lg animate-pulse bg-muted'
                  ></div>
                ))}
              </div>
            ) : friends.length > 0 ? (
              <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4'>
                {friends.map((friend) => (
                  <FriendListItem key={friend.uid} friend={friend} />
                ))}
              </div>
            ) : (
              <p className='text-center text-muted-foreground py-8'>
                {t("This user doesn't have any friends yet.")}
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </ProtectedRoute>
  );
}
