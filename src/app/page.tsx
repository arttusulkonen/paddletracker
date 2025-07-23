'use client';

import PlayersTable from '@/components/PlayersTable';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/lib/firebase';
import type { Room } from '@/lib/types';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  where,
} from 'firebase/firestore';
import {
  ArrowRight,
  LogIn,
  Percent,
  Rocket,
  Trophy,
  User,
  UserPlus,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

const PlayerRank = ({ rank }: { rank: string | null | undefined }) => {
  const { t } = useTranslation();
  return <>{t(rank ?? 'Ping-Pong Padawan')}</>;
};

export default function Home() {
  const { t } = useTranslation();
  const { user, userProfile, loading: authLoading } = useAuth();
  const [lastActiveRoom, setLastActiveRoom] = useState<
    (Room & { id: string }) | null
  >(null);
  const [isFetchingRoom, setIsFetchingRoom] = useState(true);

  useEffect(() => {
    const fetchLastActiveRoom = async () => {
      if (!user || !db) {
        setIsFetchingRoom(false);
        return;
      }
      setIsFetchingRoom(true);
      try {
        const matchesQuery = query(
          collection(db, 'matches'),
          where('players', 'array-contains', user.uid),
          orderBy('tsIso', 'desc'),
          limit(1)
        );
        const matchSnap = await getDocs(matchesQuery);
        if (!matchSnap.empty) {
          const lastMatch = matchSnap.docs[0].data();
          if (lastMatch.roomId) {
            const roomDoc = await getDoc(doc(db, 'rooms', lastMatch.roomId));
            if (roomDoc.exists() && !roomDoc.data().isArchived) {
              setLastActiveRoom({
                id: roomDoc.id,
                ...roomDoc.data(),
              } as Room & { id: string });
            }
          }
        }
      } catch (error) {
        console.error('Failed to fetch last active room:', error);
      } finally {
        setIsFetchingRoom(false);
      }
    };

    if (!authLoading && user) {
      fetchLastActiveRoom();
    } else if (!user) {
      setIsFetchingRoom(false);
    }
  }, [user, authLoading]);

  const [hasMounted, setHasMounted] = useState(false);
  useEffect(() => {
    setHasMounted(true);
  }, []);

  if (!hasMounted) {
    return null;
  }

  return (
    <div className='bg-background min-h-screen'>
      <main className='container mx-auto px-4 py-12'>
        <section className='text-center mb-16'>
          <h1 className='text-5xl font-extrabold tracking-tight mb-4 sm:text-6xl md:text-7xl bg-clip-text text-transparent bg-gradient-to-r from-primary to-blue-400'>
            PingPongTracker
          </h1>
          <p className='max-w-3xl mx-auto text-lg text-muted-foreground sm:text-xl'>
            {t(
              'Your ultimate hub to track matches, climb the leaderboard, and become a champion.'
            )}
          </p>
        </section>

        {authLoading ? (
          <div className='flex justify-center py-16'>
            <div className='animate-spin rounded-full h-16 w-16 border-b-4 border-primary'></div>
          </div>
        ) : user && userProfile ? (
          <section className='grid grid-cols-1 lg:grid-cols-3 gap-8'>
            <div className='lg:col-span-2 space-y-8'>
              {isFetchingRoom ? (
                <Button size='lg' className='w-full animate-pulse' disabled>
                  <Rocket className='mr-2 h-5 w-5' />{' '}
                  {t('Searching for your last game...')}
                </Button>
              ) : (
                lastActiveRoom && (
                  <Card className='bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'>
                    <CardHeader>
                      <CardTitle>{t('Jump Back In!')}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p>
                        {t('Your last match was in')}{' '}
                        <strong>{lastActiveRoom.name}</strong>.
                      </p>
                    </CardContent>
                    <CardFooter>
                      <Button
                        asChild
                        className='w-full bg-green-600 hover:bg-green-700 text-white'
                      >
                        <Link
                          href={`/rooms/${lastActiveRoom.id}`}
                          className='flex items-center gap-2'
                        >
                          <Rocket className='h-5 w-5' />
                          <span>{t('Go to Room')}</span>
                        </Link>
                      </Button>
                    </CardFooter>
                  </Card>
                )
              )}
              <PlayersTable />
            </div>
            <div className='space-y-8'>
              <Card className='shadow-lg'>
                <CardHeader>
                  <CardTitle>{t('Your Dashboard')}</CardTitle>
                  <CardDescription>
                    {t('A quick glance at your progress.')}
                  </CardDescription>
                </CardHeader>
                <CardContent className='space-y-4 text-sm'>
                  <div className='flex justify-between items-center'>
                    <span className='text-muted-foreground'>
                      {t('Global ELO')}
                    </span>
                    <span className='font-bold text-lg text-primary'>
                      {userProfile.globalElo?.toFixed(0) ?? 'N/A'}
                    </span>
                  </div>
                  <div className='flex justify-between items-center'>
                    <span className='text-muted-foreground'>{t('Rank')}</span>
                    <span className='font-semibold'>
                      <PlayerRank rank={userProfile.rank} />
                    </span>
                  </div>
                  <div className='flex justify-between items-center'>
                    <span className='text-muted-foreground'>
                      {t('Win Rate')}
                    </span>
                    <span className='font-semibold flex items-center gap-1'>
                      <Percent className='h-4 w-4 text-green-500' />
                      {userProfile.wins + userProfile.losses > 0
                        ? (
                            (userProfile.wins /
                              (userProfile.wins + userProfile.losses)) *
                            100
                          ).toFixed(1)
                        : '0.0'}
                      %
                    </span>
                  </div>
                  <div className='flex justify-between items-center'>
                    <span className='text-muted-foreground'>{t('W / L')}</span>
                    <span className='font-semibold'>
                      {userProfile.wins ?? 0} / {userProfile.losses ?? 0}
                    </span>
                  </div>
                </CardContent>
                <CardFooter className='grid grid-cols-2 gap-2'>
                  <Button asChild variant='outline'>
                    <Link href={`/profile/${user.uid}`}>
                      <User className='mr-2 h-4 w-4' />
                      {t('My Profile')}
                    </Link>
                  </Button>
                  <Button asChild variant='outline'>
                    <Link href='/rooms'>
                      <Users className='mr-2 h-4 w-4' />
                      {t('Rooms')}
                    </Link>
                  </Button>
                  <Button asChild variant='outline'>
                    <Link href='/tournaments'>
                      <Trophy className='mr-2 h-4 w-4' />
                      {t('Tournaments')}
                    </Link>
                  </Button>
                  <Button asChild variant='outline'>
                    <Link href='/friend-requests'>
                      <UserPlus className='mr-2 h-4 w-4' />
                      {t('Requests')}
                    </Link>
                  </Button>
                </CardFooter>
              </Card>
              <Card className='shadow-lg bg-gradient-to-br from-blue-500 to-primary text-white'>
                <CardHeader>
                  <CardTitle>{t('Ping-Pong WRAP ’25')}</CardTitle>
                  <CardDescription className='text-blue-100'>
                    {t('See your yearly stats summary!')}
                  </CardDescription>
                </CardHeader>
                <CardFooter>
                  <Button asChild variant='secondary' className='w-full'>
                    <Link href='/wrap-2025' className='flex items-center gap-2'>
                      <span>{t('View Your Wrap')}</span>
                      <ArrowRight className='h-4 w-4' />
                    </Link>
                  </Button>
                </CardFooter>
              </Card>
            </div>
          </section>
        ) : (
          <section className='text-center max-w-lg mx-auto'>
            <Card className='shadow-xl'>
              <CardHeader>
                <CardTitle className='text-3xl'>{t('Get Started')}</CardTitle>
                <CardDescription>
                  {t(
                    'Join the community and start tracking your progress today!'
                  )}
                </CardDescription>
              </CardHeader>
              <CardContent className='flex flex-col sm:flex-row gap-4 justify-center'>
                <Button size='lg' asChild className='flex-1'>
                  <Link href='/login' className='flex items-center gap-2'>
                    <LogIn /> {t('Login')}
                  </Link>
                </Button>
                <Button
                  size='lg'
                  variant='secondary'
                  asChild
                  className='flex-1'
                >
                  <Link href='/register' className='flex items-center gap-2'>
                    <UserPlus /> {t('Register')}
                  </Link>
                </Button>
              </CardContent>
            </Card>
          </section>
        )}
      </main>
    </div>
  );
}
