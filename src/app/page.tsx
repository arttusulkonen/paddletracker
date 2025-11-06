// src/app/page.tsx
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
import { Sport, sportConfig, useSport } from '@/contexts/SportContext';
import { db } from '@/lib/firebase';
import type { Room, UserProfile } from '@/lib/types';
import { getRank } from '@/lib/utils/profileUtils';
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
  BarChart2,
  Compass,
  Handshake,
  LogIn,
  Medal,
  Network,
  Percent,
  Rocket,
  Search,
  Shield,
  Swords,
  Trophy,
  User,
  UserPlus,
  Users,
} from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
// --- НАЧАЛО ИЗМЕНЕНИЙ ---
import LiveFeed from '@/components/LiveFeed'; // Импортируем новый компонент
// --- КОНЕЦ ИЗМЕНЕНИЙ ---

const PlayerRank = ({ rank }: { rank: string | null | undefined }) => {
  const { t } = useTranslation();
  return <>{t(rank ?? 'Unranked')}</>;
};

const FeatureCard = ({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) => (
  <div className='flex flex-col items-center text-center p-6 bg-card rounded-lg shadow-md'>
    <div className='mb-4 text-primary'>{icon}</div>
    <h3 className='text-xl font-bold mb-2'>{title}</h3>
    <p className='text-muted-foreground'>{children}</p>
  </div>
);

const OnboardingCard = () => {
  const { t } = useTranslation();
  return (
    <Card className='bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800'>
      <CardHeader>
        <CardTitle className='flex items-center gap-2'>
          <Compass className='h-6 w-6 text-blue-600' />
          {t("What's next?")}
        </CardTitle>
        <CardDescription>
          {t('Here are some tips to get you started on your journey:')}
        </CardDescription>
      </CardHeader>
      <CardContent className='space-y-4'>
        <div className='flex items-start gap-3'>
          <Users className='h-5 w-5 text-blue-500 mt-1 shrink-0' />
          <div>
            <h4 className='font-semibold'>{t('Join a Room')}</h4>
            <p className='text-sm text-muted-foreground'>
              {t(
                'Rooms are where the action happens. You can join public rooms to play with others.'
              )}{' '}
              <Link
                href='/rooms'
                className='text-blue-600 font-semibold hover:underline'
              >
                {t('Explore Rooms')}
              </Link>
            </p>
          </div>
        </div>
        <div className='flex items-start gap-3'>
          <Search className='h-5 w-5 text-blue-500 mt-1 shrink-0' />
          <div>
            <h4 className='font-semibold'>{t('Find Players')}</h4>
            <p className='text-sm text-muted-foreground'>
              {t(
                'Check out the Global Ranking to find other players. You can view their profiles and send friend requests.'
              )}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

const DefaultSportSelector = () => {
  const { t } = useTranslation();
  const { updateActiveSport } = useSport();

  return (
    <section className='max-w-5xl mx-auto'>
      <div className='text-center mb-8'>
        <h2 className='text-3xl font-bold mb-3'>
          {t('Choose your primary sport')}
        </h2>
        <p className='text-muted-foreground text-lg'>
          {t(
            'This sets what you see by default after login: dashboard, tables, and stats for the selected sport.'
          )}
        </p>
      </div>

      <div className='grid grid-cols-1 lg:grid-cols-3 gap-8'>
        <Card className='lg:col-span-1'>
          <CardHeader>
            <CardTitle className='text-xl'>
              {t('What does this affect?')}
            </CardTitle>
            <CardDescription>
              {t('A few helpful notes before you pick')}
            </CardDescription>
          </CardHeader>
          <CardContent className='space-y-4 text-sm'>
            <div>
              <span className='font-semibold'>{t('Default view')}</span>
              <p className='text-muted-foreground'>
                {t(
                  'We will show this sport first in your dashboard, leaderboards, and lists.'
                )}
              </p>
            </div>
            <div>
              <span className='font-semibold'>{t('Not a lock-in')}</span>
              <p className='text-muted-foreground'>
                {t('You can play and record matches in all sports anytime.')}
              </p>
            </div>
            <div>
              <span className='font-semibold'>{t('Easy to change')}</span>
              <p className='text-muted-foreground'>
                {t(
                  'Update this later in Profile → Settings, or switch on the navbar sport selector.'
                )}
              </p>
            </div>
          </CardContent>
        </Card>

        <div className='lg:col-span-2'>
          <Card>
            <CardHeader className='text-center'>
              <CardTitle className='text-2xl'>
                {t('Select your primary sport')}
              </CardTitle>
              <CardDescription>
                {t(
                  'You can change this later — this only controls your default view.'
                )}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className='grid grid-cols-1 md:grid-cols-3 gap-6'>
                {(Object.keys(sportConfig) as Sport[]).map((sportKey) => {
                  const config = sportConfig[sportKey];
                  return (
                    <button
                      key={sportKey}
                      onClick={() => updateActiveSport(sportKey)}
                      className='group w-full text-left'
                      aria-label={t('Set {{sport}} as primary', {
                        sport: config.name,
                      })}
                    >
                      <div className='h-full rounded-lg border p-6 hover:shadow-xl hover:border-primary transition-all'>
                        <div
                          className={`mb-4 ${config.theme.primary} flex items-center justify-center`}
                        >
                          {React.cloneElement(
                            config.icon as React.ReactElement,
                            {
                              className: 'h-12 w-12',
                              'aria-hidden': true,
                            }
                          )}
                        </div>
                        <div className='text-center'>
                          <div className='text-xl font-semibold'>
                            {config.name}
                          </div>
                          <p className='text-sm text-muted-foreground mt-1'>
                            {sportKey === 'pingpong' &&
                              t(
                                'Fast rallies and precise spin. Perfect for quick ELO climbs.'
                              )}
                            {sportKey === 'tennis' &&
                              t(
                                'Singles or doubles. Ranked sets with rich match stats.'
                              )}
                            {sportKey === 'badminton' &&
                              t(
                                'Lightning pace and tactical net play. Great seasonal ladders.'
                              )}
                          </p>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </CardContent>
            <CardFooter className='flex flex-col sm:flex-row gap-3 sm:justify-between'>
              <div className='text-sm text-muted-foreground'>
                {t('Tip: you can switch sports anytime from the navbar.')}
              </div>
              <div className='text-sm'>
                <span className='text-muted-foreground'>
                  {t('Want to explore first?')}
                </span>{' '}
                <Link href='/rooms' className='text-primary hover:underline'>
                  {t('Browse rooms')}
                </Link>
              </div>
            </CardFooter>
          </Card>
        </div>
      </div>
    </section>
  );
};

const Dashboard = () => {
  const { t } = useTranslation();
  const { user, userProfile } = useAuth();
  const { sport, config } = useSport();
  const [lastActiveRoom, setLastActiveRoom] = useState<
    (Room & { id: string }) | null
  >(null);
  const [isFetchingRoom, setIsFetchingRoom] = useState(true);

  const sportProfile = userProfile?.sports?.[sport];
  const wins = sportProfile?.wins ?? 0;
  const losses = sportProfile?.losses ?? 0;
  const matchesPlayed = wins + losses;
  const isNewForSport = matchesPlayed === 0;

  const rank = sportProfile
    ? getRank(sportProfile.globalElo ?? 1000, t)
    : t('Unranked');

  useEffect(() => {
    const fetchLastActiveRoom = async () => {
      if (!user || !db || !userProfile) {
        setIsFetchingRoom(false);
        return;
      }
      setIsFetchingRoom(true);
      try {
        const matchesCollectionName = config.collections.matches;
        const roomsCollectionName = config.collections.rooms;

        const matchesQuery = query(
          collection(db, matchesCollectionName),
          where('players', 'array-contains', user.uid),
          orderBy('tsIso', 'desc'),
          limit(1)
        );
        const matchSnap = await getDocs(matchesQuery);

        if (!matchSnap.empty) {
          const lastMatch = matchSnap.docs[0].data();
          if (lastMatch.roomId) {
            const roomDoc = await getDoc(
              doc(db, roomsCollectionName, lastMatch.roomId)
            );
            if (roomDoc.exists() && !roomDoc.data().isArchived) {
              setLastActiveRoom({
                id: roomDoc.id,
                ...roomDoc.data(),
              } as Room & { id: string });
            }
          }
        } else {
          setLastActiveRoom(null);
        }
      } catch {
        setLastActiveRoom(null);
      } finally {
        setIsFetchingRoom(false);
      }
    };
    fetchLastActiveRoom();
  }, [user, userProfile, sport, config]);

  return (
    <section className='grid grid-cols-1 lg:grid-cols-3 gap-8'>
      <div className='lg:col-span-2 space-y-8'>
        {isFetchingRoom ? (
          <Card className='flex items-center justify-center p-6 h-36'>
            <div className='animate-pulse flex items-center space-x-3'>
              <Rocket className='h-6 w-6 text-muted-foreground' />
              <p className='text-muted-foreground'>
                {'Searching for your last game...'}
              </p>
            </div>
          </Card>
        ) : lastActiveRoom ? (
          <Card className='bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'>
            <CardHeader>
              <CardTitle>{t('Jump back into:')}</CardTitle>
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
                  <span>{t('Enter Room')}</span>
                </Link>
              </Button>
            </CardFooter>
          </Card>
        ) : null}

        {isNewForSport && <OnboardingCard />}

        <PlayersTable sport={sport} />
      </div>

      <div className='space-y-8'>
        {sportProfile ? (
          <Card className='shadow-lg'>
            <CardHeader>
              <CardTitle>
                {t('Your Dashboard')} ({config.name})
              </CardTitle>
              <CardDescription>
                {t('A quick glance at your progress.')}
              </CardDescription>
            </CardHeader>
            <CardContent className='space-y-4 text-sm'>
              <div className='flex justify-between items-center'>
                <span className='text-muted-foreground'>{t('Global ELO')}</span>
                <span className={`font-bold text-lg ${config.theme.primary}`}>
                  {sportProfile.globalElo?.toFixed(0) ?? '1000'}
                </span>
              </div>
              <div className='flex justify-between items-center'>
                <span className='text-muted-foreground'>{t('Rank')}</span>
                <span className='font-semibold'>
                  <PlayerRank rank={rank} />
                </span>
              </div>
              <div className='flex justify-between items-center'>
                <span className='text-muted-foreground'>{t('Win Rate')}</span>
                <span className='font-semibold flex items-center gap-1'>
                  <Percent className='h-4 w-4 text-green-500' />
                  {(matchesPlayed > 0
                    ? (wins / matchesPlayed) * 100
                    : 0
                  ).toFixed(1)}
                  %
                </span>
              </div>
              <div className='flex justify-between items-center'>
                <span className='text-muted-foreground'>{t('W / L')}</span>
                <span className='font-semibold'>
                  {wins} / {losses}
                </span>
              </div>
            </CardContent>
            <CardFooter className='grid grid-cols-2 gap-2'>
              <Button asChild variant='outline'>
                <Link href={`/profile/${user!.uid}`}>
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
            <div className='flex justify-center gap-4 mb-2'>
              <Link
                href='/privacy'
                className='hover:text-primary hover:underline'
              >
                {t('Privacy Policy')}
              </Link>
              <Link
                href='/terms'
                className='hover:text-primary hover:underline'
              >
                {t('Terms of Service')}
              </Link>
            </div>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>
                {t('Start Playing')} {sportConfig[sport].name}!
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p>
                {t(
                  "You haven't played this sport yet. Join a room or record a match to get started!"
                )}
              </p>
            </CardContent>
            <CardFooter>
              <Button asChild className='w-full'>
                <Link href='/rooms'>{t('Find a Room')}</Link>
              </Button>
            </CardFooter>
          </Card>
        )}

        {!(sportProfile?.wins ?? 0) && !(sportProfile?.losses ?? 0) ? null : (
          <Card
            className={`shadow-lg bg-gradient-to-br ${sportConfig[sport].theme.gradientFrom} ${sportConfig[sport].theme.gradientTo}`}
          >
            <CardHeader>
              <CardTitle>
                {sportConfig[sport].name} {'WRAP ’25'}
              </CardTitle>
              <CardDescription className='opacity-80'>
                {t('See your yearly stats summary!')}
              </CardDescription>
            </CardHeader>
            <CardFooter>
              <Button asChild variant='secondary' className='w-full'>
                <Link
                  href={`/wrap-2025?sport=${sport}`}
                  className='flex items-center gap-2'
                >
                  <span>{t('View Your Wrap')}</span>
                  <ArrowRight className='h-4 w-4' />
                </Link>
              </Button>
            </CardFooter>
          </Card>
        )}

        <LiveFeed />
      </div>
    </section>
  );
};

const SportsShowcase = () => {
  const { t } = useTranslation();
  const sports: Array<{
    key: Sport;
    name: string;
    icon: string;
    blurb: string;
  }> = useMemo(
    () => [
      {
        key: 'pingpong',
        name: 'Ping-Pong',
        icon: '/brand/icon500-pingpong-png.png',
        blurb: t('Fast rallies, precise spin, and quick ELO climbs.'),
      },
      {
        key: 'tennis',
        name: 'Tennis',
        icon: '/brand/icon500-tennis-png.png',
        blurb: t('Singles or doubles, ranked sets, and rich match stats.'),
      },
      {
        key: 'badminton',
        name: 'Badminton',
        icon: '/brand/icon500-badminton-png.png',
        blurb: t('Lightning pace, tactical net play, and seasonal ladders.'),
      },
    ],
    [t]
  );

  return (
    <section className='mb-20'>
      <h2 className='text-3xl font-bold text-center mb-10'>
        {t('What sports can I track?')}
      </h2>
      <div className='grid grid-cols-1 md:grid-cols-3 gap-8'>
        {sports.map((s) => (
          <Card key={s.key} className='hover:shadow-xl transition-shadow'>
            <CardHeader className='items-center text-center'>
              <div className='relative h-24 w-24'>
                <Image
                  src={s.icon}
                  alt={s.name}
                  fill
                  className='object-contain'
                  sizes='96px'
                  priority
                />
              </div>
              <CardTitle className='text-2xl mt-4'>{s.name}</CardTitle>
              <CardDescription>{s.blurb}</CardDescription>
            </CardHeader>
          </Card>
        ))}
      </div>
    </section>
  );
};

const HowItWorks = () => {
  const { t } = useTranslation();
  return (
    <section className='mb-20'>
      <h2 className='text-3xl font-bold text-center mb-10'>
        {t('How Smashlog works')}
      </h2>
      <div className='grid grid-cols-1 md:grid-cols-4 gap-6'>
        <FeatureCard
          icon={<BarChart2 size={36} />}
          title={t('ELO for every match')}
        >
          {t(
            'Your rating updates after each ranked match using a fair ELO formula tuned per sport.'
          )}
        </FeatureCard>
        <FeatureCard icon={<Users size={36} />} title={t('Rooms and seasons')}>
          {t(
            'Create private rooms with friends, run seasons, and keep separate room and global ratings.'
          )}
        </FeatureCard>
        <FeatureCard icon={<Trophy size={36} />} title={t('Tournaments')}>
          {t(
            'Host brackets, track rounds, and crown champions with automatic progress saving.'
          )}
        </FeatureCard>
        <FeatureCard
          icon={<Handshake size={36} />}
          title={t('Friends and requests')}
        >
          {t(
            'Send requests, build your network, and quickly add opponents to matches.'
          )}
        </FeatureCard>
      </div>
      <div className='grid grid-cols-1 md:grid-cols-3 gap-6 mt-6'>
        <FeatureCard
          icon={<Medal size={36} />}
          title={t('Ranks and milestones')}
        >
          {t(
            'Unlock ranks as your ELO grows and follow your best streaks and win rates.'
          )}
        </FeatureCard>
        <FeatureCard icon={<Swords size={36} />} title={t('Match insights')}>
          {t(
            'See trends, opponent records, side stats, and performance over time.'
          )}
        </FeatureCard>
        <FeatureCard icon={<Shield size={36} />} title={t('Privacy controls')}>
          {t('Choose public or private profiles and invite-only rooms.')}
        </FeatureCard>
      </div>
    </section>
  );
};

const LandingPage = () => {
  const { t } = useTranslation();
  return (
    <>
      <section className='mb-16 text-center'>
        <h2 className='text-4xl sm:text-5xl font-extrabold tracking-tight mb-4 bg-clip-text bg-gradient-to-r from-blue-500 to-violet-600 text-transparent'>
          {t('Track. Compete. Improve.')}
        </h2>
        <p className='max-w-3xl mx-auto text-lg text-muted-foreground sm:text-xl'>
          {t(
            'Smashlog is a multi-sport ELO tracker for ping-pong, tennis, and badminton — with rooms, tournaments, stats, and friends.'
          )}
        </p>
        <div className='mt-8 flex flex-col sm:flex-row gap-4 justify-center'>
          <Button size='lg' asChild>
            <Link href='/register' className='flex items-center gap-2'>
              <UserPlus /> {t('Create account')}
            </Link>
          </Button>
          <Button size='lg' variant='secondary' asChild>
            <Link href='/login' className='flex items-center gap-2'>
              <LogIn /> {t('Login')}
            </Link>
          </Button>
        </div>
      </section>

      <SportsShowcase />
      <HowItWorks />

      <section className='mb-20'>
        <h2 className='text-3xl font-bold text-center mb-10'>
          {t('Why Smashlog?')}
        </h2>
        <div className='grid grid-cols-1 md:grid-cols-3 gap-8'>
          <FeatureCard
            icon={<BarChart2 size={40} />}
            title={t('Advanced ELO System')}
          >
            {t(
              'Track your skill progression with a reliable and accurate rating system for every sport.'
            )}
          </FeatureCard>
          <FeatureCard
            icon={<Network size={40} />}
            title={t('Community & Rooms')}
          >
            {t(
              'Organize casual matches or compete in structured seasons with friends.'
            )}
          </FeatureCard>
          <FeatureCard
            icon={<Swords size={40} />}
            title={t('In-depth Statistics')}
          >
            {t(
              'Analyze your performance with detailed match history and personal stats.'
            )}
          </FeatureCard>
        </div>
      </section>

      <section className='text-center max-w-lg mx-auto'>
        <Card className='shadow-xl'>
          <CardHeader>
            <CardTitle className='text-3xl'>{t('Get Started')}</CardTitle>
            <CardDescription>
              {t('Join the community and start tracking your progress today!')}
            </CardDescription>
          </CardHeader>
          <CardContent className='flex flex-col sm:flex-row gap-4 justify-center'>
            <Button size='lg' asChild className='flex-1'>
              <Link href='/login' className='flex items-center gap-2'>
                <LogIn /> {t('Login')}
              </Link>
            </Button>
            <Button size='lg' variant='secondary' asChild className='flex-1'>
              <Link href='/register' className='flex items-center gap-2'>
                <UserPlus /> {t('Register')}
              </Link>
            </Button>
          </CardContent>
        </Card>
      </section>
    </>
  );
};

export default function HomePageWrapper() {
  const router = useRouter();
  const { user, userProfile, loading: authLoading } = useAuth();
  const { sport, config } = useSport();
  const { t } = useTranslation();
  const [hasMounted, setHasMounted] = useState(false);

  useEffect(() => {
    setHasMounted(true);
  }, []);

  useEffect(() => {
    if (!hasMounted) return;
    if (
      typeof window !== 'undefined' &&
      window.matchMedia('(max-width: 768px)').matches
    ) {
      router.replace('/mobile');
    }
  }, [hasMounted, router]);

  if (authLoading || !hasMounted) {
    return (
      <div className='flex justify-center items-center min-h-screen'>
        <div className='animate-spin rounded-full h-16 w-16 border-b-4 border-primary'></div>
      </div>
    );
  }

  const needsToSelectSport = user && userProfile && !userProfile.activeSport;

  return (
    <div className='bg-background min-h-screen'>
      <main className='container mx-auto px-4 py-12'>
        {needsToSelectSport ? (
          <DefaultSportSelector />
        ) : (
          <>
            <section className='text-center mb-16'>
              <h1
                className={`text-5xl font-extrabold tracking-tight mb-4 sm:text-6xl md:text-7xl bg-clip-text bg-gradient-to-r ${config.theme.gradientFrom} ${config.theme.gradientTo}`}
              >
                Smashlog
              </h1>
              <p className='max-w-3xl mx-auto text-lg text-muted-foreground sm:text-xl'>
                {t(
                  'Your ultimate hub to track matches, climb the leaderboard, and become a champion.'
                )}
              </p>
            </section>

            {user && userProfile ? <Dashboard /> : <LandingPage />}
          </>
        )}
      </main>
    </div>
  );
}
