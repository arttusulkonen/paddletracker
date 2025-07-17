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
import type { Match, Room } from '@/lib/types';
import { parseFlexDate } from '@/lib/utils/date';
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
  Flame,
  Languages, // <-- 1. Импортируем иконку
  LogIn,
  Percent,
  Rocket,
  Trophy,
  User,
  UserPlus,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

// --- ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ (без изменений) ---
function computeStats(list: Match[], uid: string) {
  let wins = 0,
    losses = 0,
    curW = 0,
    maxW = 0;
  list.forEach((m) => {
    const p1 = m.player1Id === uid;
    const me = p1 ? m.player1 : m.player2;
    const opp = p1 ? m.player2 : m.player1;
    const win = me.scores > opp.scores;
    if (win) {
      wins++;
      curW++;
      maxW = Math.max(maxW, curW);
    } else {
      losses++;
      curW = 0;
    }
  });
  const total = wins + losses;
  return {
    total,
    wins,
    losses,
    winRate: total ? (wins / total) * 100 : 0,
    maxWinStreak: maxW,
  };
}
const PlayerRank = ({ rank }: { rank: string | null | undefined }) => {
  const { t } = useTranslation();
  switch (rank) {
    case 'Ping-Pong Padawan':
      return <>{t('Ping-Pong Padawan')}</>;
    case 'Table-Tennis Trainee':
      return <>{t('Table-Tennis Trainee')}</>;
    case 'Racket Rookie':
      return <>{t('Racket Rookie')}</>;
    case 'Paddle Prodigy':
      return <>{t('Paddle Prodigy')}</>;
    case 'Spin Sensei':
      return <>{t('Spin Sensei')}</>;
    case 'Smash Samurai':
      return <>{t('Smash Samurai')}</>;
    case 'Ping-Pong Paladin':
      return <>{t('Ping-Pong Paladin')}</>;
    default:
      return <>{t('Ping-Pong Padawan')}</>;
  }
};

export default function Home() {
  const { t } = useTranslation();
  const { user, userProfile, loading: authLoading } = useAuth();
  const visibleName = userProfile?.name ?? user?.displayName ?? t('Player');
  const [lastActiveRoom, setLastActiveRoom] = useState<
    (Room & { id: string }) | null
  >(null);
  const [isFetchingRoom, setIsFetchingRoom] = useState(true);

  useEffect(() => {
    const fetchLastActiveRoom = async () => {
      if (!user) {
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
          const roomDoc = await getDoc(doc(db, 'rooms', lastMatch.roomId));
          if (roomDoc.exists()) {
            setLastActiveRoom({ id: roomDoc.id, ...roomDoc.data() } as Room & {
              id: string;
            });
          }
        }
      } catch (error) {
        console.error('Failed to fetch last active room:', error);
      } finally {
        setIsFetchingRoom(false);
      }
    };
    if (!authLoading) {
      fetchLastActiveRoom();
    }
  }, [user, authLoading]);

  const [matches, setMatches] = useState<Match[]>([]);
  const [isLoadingStats, setIsLoadingStats] = useState(true);

  const loadMatches = useCallback(async () => {
    if (!user) return;
    setIsLoadingStats(true);
    try {
      const ref = collection(db, 'matches');
      const [p1, p2] = await Promise.all([
        getDocs(query(ref, where('player1Id', '==', user.uid))),
        getDocs(query(ref, where('player2Id', '==', user.uid))),
      ]);
      const rows: Match[] = [];
      p1.forEach((d) => rows.push({ id: d.id, ...(d.data() as any) }));
      p2.forEach((d) => rows.push({ id: d.id, ...(d.data() as any) }));
      const uniq = Array.from(
        new Map(rows.map((r) => [r.id, r])).values()
      ).sort(
        (a, b) =>
          parseFlexDate(b.timestamp ?? (b as any).playedAt).getTime() -
          parseFlexDate(a.timestamp ?? (a as any).playedAt).getTime()
      );
      setMatches(uniq);
    } catch (error) {
      console.error('Failed to load matches for stats:', error);
    } finally {
      setIsLoadingStats(false);
    }
  }, [user]);

  useEffect(() => {
    if (!authLoading && user) {
      loadMatches();
    }
  }, [authLoading, user, loadMatches]);

  const stats = useMemo(() => {
    if (!user || !matches.length) return null;
    return computeStats(matches, user.uid);
  }, [matches, user]);

  const [hasMounted, setHasMounted] = useState(false);
  useEffect(() => {
    setHasMounted(true);
  }, []);

  if (!hasMounted) {
    return null;
  }

  return (
    <div className='bg-gray-50 dark:bg-gray-900 min-h-screen'>
      <main className='container mx-auto px-4 py-12'>
        <section className='text-center mb-12'>
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
        ) : user ? (
          <section className='grid grid-cols-1 lg:grid-cols-3 gap-8'>
            <div className='lg:col-span-2 space-y-8'>
              <Card className='shadow-lg'>
                <CardHeader>
                  <CardTitle>{t('Quick Start')}</CardTitle>
                  <CardDescription>
                    {t('Welcome back,')} {visibleName}! {t("What's next?")}
                  </CardDescription>
                </CardHeader>
                <CardContent className='space-y-4'>
                  {isFetchingRoom ? (
                    <Button size='lg' className='w-full animate-pulse' disabled>
                      <Rocket className='mr-2 h-5 w-5' />{' '}
                      {t('Searching for your last game...')}
                    </Button>
                  ) : lastActiveRoom ? (
                    <Button
                      size='lg'
                      asChild
                      className='w-full bg-green-600 hover:bg-green-700 text-white shadow-lg transform transition-transform'
                    >
                      <Link
                        href={`/rooms/${lastActiveRoom.id}`}
                        className='flex items-center gap-2'
                      >
                        <Rocket className='h-5 w-5' />
                        <span>
                          {t('Jump back into:')} {lastActiveRoom.name}
                        </span>
                      </Link>
                    </Button>
                  ) : null}
                  <div className='grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4'>
                    <Button variant='outline' asChild>
                      <Link
                        href={`/profile/${user.uid}`}
                        className='flex items-center gap-2'
                      >
                        <User className='h-4 w-4' />
                        <span>{t('Your Profile')}</span>
                      </Link>
                    </Button>
                    <Button variant='outline' asChild>
                      <Link href='/rooms' className='flex items-center gap-2'>
                        <Users className='h-4 w-4' />
                        <span>{t('All Rooms')}</span>
                      </Link>
                    </Button>
                    <Button variant='outline' asChild>
                      <Link
                        href='/tournaments'
                        className='flex items-center gap-2'
                      >
                        <Trophy className='h-4 w-4' />
                        <span>{t('Tournaments')}</span>
                      </Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* ---- НОВЫЙ БЛОК ДЛЯ ПЕРЕВОДОВ ---- */}
              <Card className='shadow-lg border-primary/20 border-2'>
                <CardHeader>
                  <CardTitle className='flex items-center gap-2'>
                    <Languages className='text-primary' />{' '}
                    {t('Help Improve Translations')}
                  </CardTitle>
                  <CardDescription>
                    {t(
                      'You can help improve the translations of this application. Please contribute!'
                    )}
                  </CardDescription>
                </CardHeader>
                <CardFooter>
                  <Button asChild>
                    <Link href='/translate'>{t('Go to Translation Page')}</Link>
                  </Button>
                </CardFooter>
              </Card>
              {/* ---- КОНЕЦ НОВОГО БЛОКА ---- */}

              <PlayersTable />
            </div>
            <div className='space-y-8'>
              <Card className='shadow-lg'>
                <CardHeader>
                  <CardTitle>{t('Your Profile')}</CardTitle>
                  <CardDescription>
                    {t('A quick glance at your progress.')}
                  </CardDescription>
                </CardHeader>
                <CardContent className='space-y-4 text-sm'>
                  {isLoadingStats ? (
                    <div className='text-center text-muted-foreground py-4'>
                      {t('Loading stats...')}
                    </div>
                  ) : (
                    <>
                      <div className='flex justify-between items-center'>
                        <span className='text-muted-foreground'>
                          {t('Global ELO')}
                        </span>
                        <span className='font-bold text-lg text-primary'>
                          {userProfile?.globalElo?.toFixed(0) ?? 'N/A'}
                        </span>
                      </div>
                      <div className='flex justify-between items-center'>
                        <span className='text-muted-foreground'>
                          {t('Rank')}
                        </span>
                        <span className='font-semibold'>
                          <PlayerRank rank={userProfile?.rank} />
                        </span>
                      </div>
                      <div className='flex justify-between items-center'>
                        <span className='text-muted-foreground'>
                          {t('Win Rate')}
                        </span>
                        <span className='font-semibold flex items-center gap-1'>
                          <Percent className='h-4 w-4 text-green-500' />
                          {stats?.winRate.toFixed(1) ?? '0.0'}%
                        </span>
                      </div>
                      <div className='flex justify-between items-center'>
                        <span className='text-muted-foreground'>
                          {t('W / L')}
                        </span>
                        <span className='font-semibold'>
                          {stats?.wins ?? 0} / {stats?.losses ?? 0}
                        </span>
                      </div>
                      <div className='flex justify-between items-center'>
                        <span className='text-muted-foreground'>
                          {t('Best Streak')}
                        </span>
                        <span className='font-semibold flex items-center gap-1'>
                          <Flame className='h-4 w-4 text-orange-500' />
                          {stats?.maxWinStreak ?? 0}
                        </span>
                      </div>
                    </>
                  )}
                </CardContent>
                <CardFooter>
                  <Button asChild variant='secondary' className='w-full'>
                    <Link
                      href={`/profile/${user.uid}`}
                      className='flex items-center gap-2'
                    >
                      <span>{t('View Full Stats')}</span>
                      <ArrowRight className='h-4 w-4' />
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
        <section className='mt-20'>
          <h2 className='text-3xl font-semibold text-center mb-8'>
            {t('Why PingPongTracker?')}
          </h2>
          <div className='grid md:grid-cols-3 gap-8 text-center'>
            <div className='p-6 bg-card rounded-lg shadow-md border'>
              <Trophy className='h-12 w-12 text-primary mx-auto mb-4' />
              <h3 className='text-xl font-semibold mb-2'>
                {t('Advanced ELO System')}
              </h3>
              <p className='text-muted-foreground'>
                {t(
                  'Track your skill progression with a reliable and accurate rating system.'
                )}
              </p>
            </div>
            <div className='p-6 bg-card rounded-lg shadow-md border'>
              <Users className='h-12 w-12 text-primary mx-auto mb-4' />
              <h3 className='text-xl font-semibold mb-2'>
                {t('Community & Rooms')}
              </h3>
              <p className='text-muted-foreground'>
                {t(
                  'Organize casual matches or compete in structured seasons with friends.'
                )}
              </p>
            </div>
            <div className='p-6 bg-card rounded-lg shadow-md border'>
              <svg
                xmlns='http://www.w3.org/2000/svg'
                width='48'
                height='48'
                viewBox='0 0 24 24'
                fill='none'
                stroke='currentColor'
                strokeWidth='2'
                strokeLinecap='round'
                strokeLinejoin='round'
                className='h-12 w-12 text-primary mx-auto mb-4'
              >
                <path d='M12 20V10M18 20V4M6 20V16' />
              </svg>
              <h3 className='text-xl font-semibold mb-2'>
                {t('In-depth Statistics')}
              </h3>
              <p className='text-muted-foreground'>
                {t(
                  'Analyze your performance with detailed match history and personal stats.'
                )}
              </p>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
