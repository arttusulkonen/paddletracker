// src/app/page.tsx
'use client';
import LiveFeed from '@/components/LiveFeed';
import PlayersTable from '@/components/PlayersTable';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { WrapAnnouncement } from '@/components/WrapAnnouncement';
import { useAuth } from '@/contexts/AuthContext';
import { Sport, sportConfig, useSport } from '@/contexts/SportContext';
import { db } from '@/lib/firebase';
import type { Room } from '@/lib/types';
import { getRank, medalMap } from '@/lib/utils/profileUtils';
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
  History,
  LogIn,
  Network,
  Play,
  Rocket,
  Search,
  Shield,
  Swords,
  Target,
  Trophy,
  User,
  UserPlus,
  Users,
  Zap,
} from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

// --- Components ---

const FeatureCard = ({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) => (
  <div className='flex flex-col items-center text-center p-6 bg-card rounded-xl shadow-sm border hover:shadow-md transition-shadow duration-200'>
    <div className='mb-4 text-primary p-3 bg-primary/10 rounded-full'>
      {icon}
    </div>
    <h3 className='text-lg font-bold mb-2'>{title}</h3>
    <p className='text-sm text-muted-foreground'>{children}</p>
  </div>
);

const DefaultSportSelector = () => {
  const { t } = useTranslation();
  const { updateActiveSport } = useSport();

  return (
    <section className='max-w-4xl mx-auto py-12 animate-in fade-in slide-in-from-bottom-4 duration-500'>
      <div className='text-center mb-10'>
        <h2 className='text-3xl font-extrabold tracking-tight mb-3'>
          {t('Choose your primary sport')}
        </h2>
        <p className='text-muted-foreground text-lg max-w-2xl mx-auto'>
          {t(
            'This sets your default view. You can always switch sports or play matches in any category later.'
          )}
        </p>
      </div>

      <div className='grid grid-cols-1 md:grid-cols-3 gap-6'>
        {(Object.keys(sportConfig) as Sport[]).map((sportKey) => {
          const config = sportConfig[sportKey];
          return (
            <button
              key={sportKey}
              onClick={() => updateActiveSport(sportKey)}
              className='group relative overflow-hidden rounded-2xl border bg-card text-card-foreground shadow-sm transition-all hover:shadow-lg hover:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2'
            >
              <div className='p-6 flex flex-col items-center h-full'>
                <div
                  className={`mb-6 p-4 rounded-full bg-gradient-to-br ${config.theme.gradientFrom} ${config.theme.gradientTo} text-white shadow-inner transform group-hover:scale-110 transition-transform duration-300`}
                >
                  {React.cloneElement(config.icon as React.ReactElement, {
                    className: 'h-10 w-10',
                    'aria-hidden': true,
                  })}
                </div>
                <h3 className='text-xl font-bold mb-2'>{config.name}</h3>
                <p className='text-sm text-muted-foreground text-center leading-relaxed'>
                  {sportKey === 'pingpong' &&
                    t('Fast rallies and spin. Climb the ladder quickly.')}
                  {sportKey === 'tennis' &&
                    t('Strategic sets and detailed stats for serious players.')}
                  {sportKey === 'badminton' &&
                    t('Tactical net play and smash defense.')}
                </p>
              </div>
            </button>
          );
        })}
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
  const winRate =
    matchesPlayed > 0 ? ((wins / matchesPlayed) * 100).toFixed(1) : '0.0';
  const elo = sportProfile?.globalElo ?? 1000;

  // Rank Logic
  const rankKey =
    elo < 1001
      ? 'Ping-Pong Padawan'
      : elo < 1100
      ? 'Table-Tennis Trainee'
      : elo < 1200
      ? 'Racket Rookie'
      : elo < 1400
      ? 'Paddle Prodigy'
      : elo < 1800
      ? 'Spin Sensei'
      : elo < 2000
      ? 'Smash Samurai'
      : 'Ping-Pong Paladin';
  const rankLabel = t(rankKey);
  const medalSrc = medalMap[rankKey];

  // Next rank progress
  const thresholds = [1001, 1100, 1200, 1400, 1800, 2000, 3000];
  const nextRankElo = thresholds.find((t) => t > elo) || 3000;
  const prevRankElo =
    [...thresholds].reverse().find((t) => t <= elo) || (elo < 1001 ? 0 : 1000);
  const pointsNeeded = nextRankElo - elo;
  const progress = Math.min(
    100,
    Math.max(0, ((elo - prevRankElo) / (nextRankElo - prevRankElo || 1)) * 100)
  );

  useEffect(() => {
    const fetchLastActiveRoom = async () => {
      if (!user || !db || !userProfile) {
        setIsFetchingRoom(false);
        return;
      }
      setIsFetchingRoom(true);
      try {
        const matchesQuery = query(
          collection(db, config.collections.matches),
          where('players', 'array-contains', user.uid),
          orderBy('tsIso', 'desc'),
          limit(1)
        );
        const matchSnap = await getDocs(matchesQuery);

        if (!matchSnap.empty) {
          const lastMatch = matchSnap.docs[0].data();
          if (lastMatch.roomId) {
            const roomDoc = await getDoc(
              doc(db, config.collections.rooms, lastMatch.roomId)
            );
            if (roomDoc.exists() && !roomDoc.data().isArchived) {
              setLastActiveRoom({
                id: roomDoc.id,
                ...roomDoc.data(),
              } as Room & { id: string });
            }
          }
        }
      } catch {
        // ignore
      } finally {
        setIsFetchingRoom(false);
      }
    };
    fetchLastActiveRoom();
  }, [user, userProfile, sport, config]);

  return (
    <div className='animate-in fade-in duration-500 space-y-8'>
      {/* HERO GRID: Profile & Quick Actions */}
      <div className='grid grid-cols-1 lg:grid-cols-3 gap-6'>
        {/* 1. Main Player Card (Left 2/3) */}
        <Card className='lg:col-span-2 shadow-lg border-none overflow-hidden relative flex flex-col justify-between'>
          {/* Gradient Header */}
          <div
            className={`absolute top-0 left-0 w-full h-28 bg-gradient-to-r ${config.theme.gradientFrom} ${config.theme.gradientTo} opacity-10`}
          />

          <CardHeader className='relative pt-8 pb-2'>
            <div className='flex flex-col sm:flex-row items-center sm:items-start gap-5'>
              <Avatar className='h-24 w-24 border-4 border-background shadow-xl'>
                <AvatarImage src={userProfile?.photoURL || undefined} />
                <AvatarFallback className='text-2xl bg-primary/10 text-primary'>
                  {userProfile?.name?.[0]}
                </AvatarFallback>
              </Avatar>

              <div className='flex-1 text-center sm:text-left space-y-1 mt-2'>
                <div className='flex items-center justify-center sm:justify-between w-full'>
                  <CardTitle className='text-3xl font-bold'>
                    {userProfile?.name}
                  </CardTitle>
                  <div className='hidden sm:block text-right'>
                    <div className='text-4xl font-black text-primary tracking-tight'>
                      {elo.toFixed(0)}
                    </div>
                    <div className='text-[10px] uppercase font-bold text-muted-foreground tracking-wider'>
                      {t('Global ELO')}
                    </div>
                  </div>
                </div>

                <div className='flex items-center justify-center sm:justify-start gap-2 text-muted-foreground'>
                  {medalSrc && (
                    <Image
                      src={medalSrc}
                      alt='Rank'
                      width={20}
                      height={20}
                      className='drop-shadow-sm'
                    />
                  )}
                  <span className='font-medium text-sm'>{rankLabel}</span>
                </div>

                {/* Mobile ELO display */}
                <div className='sm:hidden mt-2'>
                  <span className='text-3xl font-black text-primary'>
                    {elo.toFixed(0)}
                  </span>
                  <span className='text-xs text-muted-foreground ml-2'>
                    {t('ELO')}
                  </span>
                </div>
              </div>
            </div>
          </CardHeader>

          <CardContent className='space-y-6 pt-6'>
            {/* Stats Grid */}
            <div className='grid grid-cols-3 gap-4 text-center'>
              <div className='p-3 rounded-xl bg-muted/40 border'>
                <div className='text-2xl font-bold text-foreground'>
                  {matchesPlayed}
                </div>
                <div className='text-[10px] uppercase tracking-wider text-muted-foreground font-semibold'>
                  {t('Matches')}
                </div>
              </div>
              <div className='p-3 rounded-xl bg-green-50 dark:bg-green-900/10 border border-green-100 dark:border-green-900'>
                <div className='text-2xl font-bold text-green-600 dark:text-green-400'>
                  {wins}
                </div>
                <div className='text-[10px] uppercase tracking-wider text-muted-foreground font-semibold'>
                  {t('Wins')}
                </div>
              </div>
              <div className='p-3 rounded-xl bg-muted/40 border'>
                <div className='text-2xl font-bold text-foreground'>
                  {winRate}%
                </div>
                <div className='text-[10px] uppercase tracking-wider text-muted-foreground font-semibold'>
                  {t('Win Rate')}
                </div>
              </div>
            </div>

            {/* Next Milestone (Integrated) */}
            <div className='bg-muted/30 p-4 rounded-xl border border-dashed'>
              <div className='flex justify-between items-center mb-2'>
                <div className='flex items-center gap-2'>
                  <Target className='h-4 w-4 text-primary' />
                  <span className='text-sm font-semibold'>
                    {t('Next Rank')}
                  </span>
                </div>
                <span className='text-xs font-medium text-muted-foreground'>
                  {pointsNeeded} {t('pts to go')}
                </span>
              </div>
              <Progress value={progress} className='h-2.5' />
              <div className='flex justify-between mt-1.5 text-[10px] text-muted-foreground font-medium uppercase tracking-wide'>
                <span>{prevRankElo}</span>
                <span>{nextRankElo}</span>
              </div>
            </div>
          </CardContent>

          {/* Actions Footer */}
          <div className='bg-muted/30 p-4 flex flex-wrap gap-3 items-center border-t mt-auto'>
            {lastActiveRoom ? (
              <Button className='flex-1 gap-2 shadow-sm h-10' asChild>
                <Link href={`/rooms/${lastActiveRoom.id}`}>
                  <Play className='h-4 w-4 fill-current' />
                  {t('Jump back into: {{room}}', { room: lastActiveRoom.name })}
                </Link>
              </Button>
            ) : (
              <Button className='flex-1 gap-2 shadow-sm h-10' asChild>
                <Link href='/rooms'>
                  <Rocket className='h-4 w-4' />
                  {t('Play a Match')}
                </Link>
              </Button>
            )}
            <Button variant='secondary' className='gap-2 h-10 px-5' asChild>
              <Link href={`/profile/${user?.uid}`}>
                <User className='h-4 w-4' />
                {t('Profile')}
              </Link>
            </Button>
            <Button
              variant='outline'
              size='icon'
              className='flex-1 h-10 w-10'
              asChild
              title={t('Wrap 2025')}
            >
              <Link href='/wrap'>
                <History className='h-4 w-4' />
                {t('Wrap')} {new Date().getFullYear()}
              </Link>
            </Button>
          </div>
        </Card>

        {/* 2. Sidebar (Right 1/3): Quick Navigation */}
        <div className='flex flex-col gap-6'>
          <Card className='h-full flex flex-col shadow-md border-l-4 border-l-primary'>
            <CardHeader className='pb-4'>
              <CardTitle className='text-lg flex items-center gap-2'>
                <Zap className='h-5 w-5 text-amber-500' />
                {t('Quick Actions')}
              </CardTitle>
              <CardDescription>{t('Jump to key areas')}</CardDescription>
            </CardHeader>
            <CardContent className='grid gap-3 flex-1'>
              <Link
                href='/rooms'
                className='group flex items-center justify-between p-3 rounded-lg hover:bg-accent transition-all border hover:border-primary/30'
              >
                <div className='flex items-center gap-3'>
                  <div className='p-2 bg-blue-100 dark:bg-blue-900/30 rounded-md text-blue-600 group-hover:scale-110 transition-transform'>
                    <Search size={18} />
                  </div>
                  <div className='flex flex-col'>
                    <span className='font-medium text-sm'>
                      {t('Find a Room')}
                    </span>
                    <span className='text-xs text-muted-foreground'>
                      {t('Join leagues')}
                    </span>
                  </div>
                </div>
                <ArrowRight
                  size={16}
                  className='text-muted-foreground group-hover:text-primary transition-colors'
                />
              </Link>

              <Link
                href='/tournaments'
                className='group flex items-center justify-between p-3 rounded-lg hover:bg-accent transition-all border hover:border-primary/30'
              >
                <div className='flex items-center gap-3'>
                  <div className='p-2 bg-amber-100 dark:bg-amber-900/30 rounded-md text-amber-600 group-hover:scale-110 transition-transform'>
                    <Trophy size={18} />
                  </div>
                  <div className='flex flex-col'>
                    <span className='font-medium text-sm'>
                      {t('Tournaments')}
                    </span>
                    <span className='text-xs text-muted-foreground'>
                      {t('Compete')}
                    </span>
                  </div>
                </div>
                <ArrowRight
                  size={16}
                  className='text-muted-foreground group-hover:text-primary transition-colors'
                />
              </Link>

              <Link
                href='/friend-requests'
                className='group flex items-center justify-between p-3 rounded-lg hover:bg-accent transition-all border hover:border-primary/30'
              >
                <div className='flex items-center gap-3'>
                  <div className='p-2 bg-violet-100 dark:bg-violet-900/30 rounded-md text-violet-600 group-hover:scale-110 transition-transform'>
                    <UserPlus size={18} />
                  </div>
                  <div className='flex flex-col'>
                    <span className='font-medium text-sm'>{t('Requests')}</span>
                    <span className='text-xs text-muted-foreground'>
                      {t('Manage friends')}
                    </span>
                  </div>
                </div>
                <ArrowRight
                  size={16}
                  className='text-muted-foreground group-hover:text-primary transition-colors'
                />
              </Link>
            </CardContent>

            {/* Mini Tip or Callout at bottom of sidebar */}
            <div className='p-4 mt-auto bg-muted/20 border-t text-xs text-muted-foreground text-center'>
              {t('Tip: Join a room to start ranking up!')}
            </div>
          </Card>
        </div>
      </div>

      {/* SECONDARY ROW: Tables & Feeds */}
      <div className='grid grid-cols-1 lg:grid-cols-3 gap-8'>
        {/* Leaderboard (Left 2/3) */}
        <div className='lg:col-span-2 space-y-6'>
          <PlayersTable sport={sport} />
        </div>

        {/* Live Feed (Right 1/3) */}
        <div className='space-y-6'>
          <LiveFeed />
        </div>
      </div>

      {/* Onboarding (Only if 0 matches) */}
      {matchesPlayed === 0 && (
        <div className='fixed bottom-6 right-6 max-w-sm z-50 animate-in slide-in-from-right-10 fade-in duration-700'>
          <Card className='bg-emerald-50 dark:bg-emerald-900/90 border-emerald-200 dark:border-emerald-800 shadow-2xl'>
            <CardHeader className='pb-2 p-4'>
              <CardTitle className='text-sm text-emerald-800 dark:text-emerald-100 flex items-center gap-2'>
                <Compass className='h-4 w-4' /> {t('Getting Started')}
              </CardTitle>
            </CardHeader>
            <CardContent className='text-xs text-emerald-700 dark:text-emerald-200 p-4 pt-0'>
              <p className='mb-2'>
                {t(
                  'You have 0 matches. Join a public room or create your own to start tracking your ELO!'
                )}
              </p>
              <Button
                variant='outline'
                size='sm'
                asChild
                className='w-full border-emerald-300 text-emerald-700 hover:bg-emerald-100 bg-white'
              >
                <Link href='/rooms'>{t('Browse Rooms')}</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
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
      <div className='grid grid-cols-1 md:grid-cols-3 gap-6'>
        {sports.map((s) => (
          <Card
            key={s.key}
            className='hover:shadow-lg transition-all duration-300 group border-muted'
          >
            <CardHeader className='items-center text-center pt-8'>
              <div className='relative h-20 w-20 mb-4 transform group-hover:scale-110 transition-transform duration-300'>
                <Image
                  src={s.icon}
                  alt={s.name}
                  fill
                  className='object-contain'
                  sizes='80px'
                />
              </div>
              <CardTitle className='text-xl'>{s.name}</CardTitle>
              <CardDescription className='mt-2'>{s.blurb}</CardDescription>
            </CardHeader>
          </Card>
        ))}
      </div>
    </section>
  );
};

const LandingPage = () => {
  const { t } = useTranslation();
  return (
    <div className='animate-in fade-in duration-700'>
      <section className='mb-24 text-center pt-10'>
        <h1 className='text-5xl sm:text-6xl md:text-7xl font-black tracking-tighter mb-6'>
          <span className='bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-violet-600'>
            Smashlog
          </span>
        </h1>
        <h2 className='text-2xl sm:text-3xl font-bold text-slate-800 dark:text-slate-200 mb-6'>
          {t('Track. Compete. Improve.')}
        </h2>
        <p className='max-w-2xl mx-auto text-lg text-muted-foreground leading-relaxed mb-10'>
          {t(
            'The ultimate multi-sport ELO tracker. Create leagues, join tournaments, and visualize your progress in Ping-Pong, Tennis, and Badminton.'
          )}
        </p>
        <div className='flex flex-col sm:flex-row gap-4 justify-center'>
          <Button size='lg' className='text-lg px-8 h-14 shadow-lg' asChild>
            <Link href='/register' className='flex items-center gap-2'>
              <Rocket className='h-5 w-5' /> {t('Get Started for Free')}
            </Link>
          </Button>
          <Button
            size='lg'
            variant='outline'
            className='text-lg px-8 h-14'
            asChild
          >
            <Link href='/login' className='flex items-center gap-2'>
              <LogIn className='h-5 w-5' /> {t('Login')}
            </Link>
          </Button>
        </div>
      </section>

      <SportsShowcase />

      <section className='mb-24'>
        <div className='text-center mb-12'>
          <h2 className='text-3xl font-bold'>{t('Everything you need')}</h2>
          <p className='text-muted-foreground mt-2'>
            {t('Built for clubs, offices, and friendly rivalries.')}
          </p>
        </div>
        <div className='grid grid-cols-1 md:grid-cols-3 gap-8'>
          <FeatureCard
            icon={<BarChart2 size={32} />}
            title={t('Advanced Analytics')}
          >
            {t(
              'Fair ELO rating system (K-32), win rates, streaks, and head-to-head records.'
            )}
          </FeatureCard>
          <FeatureCard icon={<Network size={32} />} title={t('Private Rooms')}>
            {t(
              'Create invite-only leagues for your office or club with separate leaderboards.'
            )}
          </FeatureCard>
          <FeatureCard icon={<Trophy size={32} />} title={t('Tournaments')}>
            {t(
              'Organize brackets seamlessly. We handle the scheduling and score tracking.'
            )}
          </FeatureCard>
        </div>
      </section>

      <section className='text-center pb-12'>
        <Card className='max-w-2xl mx-auto bg-gradient-to-br from-slate-900 to-slate-800 text-white border-none shadow-2xl'>
          <CardHeader>
            <CardTitle className='text-2xl'>
              {t('Ready to climb the ranks?')}
            </CardTitle>
            <CardDescription className='text-slate-300'>
              {t('Join thousands of players tracking their matches today.')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              size='lg'
              variant='secondary'
              className='w-full sm:w-auto font-bold text-lg h-12 px-8'
              asChild
            >
              <Link href='/register'>{t('Create Account Now')}</Link>
            </Button>
          </CardContent>
        </Card>
      </section>
    </div>
  );
};

export default function HomePageWrapper() {
  const router = useRouter();
  const { user, userProfile, loading: authLoading } = useAuth();
  const [hasMounted, setHasMounted] = useState(false);

  useEffect(() => {
    setHasMounted(true);
  }, []);

  // Mobile redirect logic
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
      <div className='flex justify-center items-center min-h-screen bg-background'>
        <div className='animate-pulse flex flex-col items-center gap-4'>
          <div className='h-12 w-12 rounded-full bg-primary/20'></div>
          <div className='h-4 w-32 rounded bg-muted'></div>
        </div>
      </div>
    );
  }

  const needsToSelectSport = user && userProfile && !userProfile.activeSport;

  return (
    <div className='min-h-screen bg-background'>
      <main className='container mx-auto px-4 py-6 sm:py-12'>
        {needsToSelectSport ? (
          <DefaultSportSelector />
        ) : user && userProfile ? (
          <>
            <Dashboard />
            <WrapAnnouncement />
          </>
        ) : (
          <LandingPage />
        )}
      </main>
    </div>
  );
}
