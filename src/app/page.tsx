'use client';

import { ControlPanel } from '@/components/ControlPanel';
import LiveFeed from '@/components/LiveFeed';
import PlayersTable from '@/components/PlayersTable';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { WrapAnnouncement } from '@/components/WrapAnnouncement';
import { useAuth } from '@/contexts/AuthContext';
import { useSport } from '@/contexts/SportContext';
import { db } from '@/lib/firebase';
import type { Room } from '@/lib/types';
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
	Building2,
	Gamepad2,
	Ghost,
	History,
	Play,
	Rocket,
	ShieldCheck,
	Target,
	Trophy,
	User,
	Users,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

const DefaultSportSelector = () => {
  const { t } = useTranslation();
  const { updateActiveSport } = useSport();

  return (
    <section className='max-w-md mx-auto py-12 animate-in fade-in slide-in-from-bottom-4 duration-500'>
      <div className='text-center mb-10'>
        <h2 className='text-3xl font-extrabold tracking-tight mb-3'>
          {t('Welcome to SmashLog')}
        </h2>
        <p className='text-muted-foreground text-lg'>
          {t('To get started, please confirm your sport.')}
        </p>
      </div>

      <div className='grid grid-cols-1 gap-6'>
        <button
          onClick={() => updateActiveSport('pingpong')}
          className='group relative overflow-hidden rounded-2xl bg-card text-card-foreground shadow-lg transition-all hover:shadow-xl hover:border-primary/50 border-2 border-transparent focus:outline-none focus:ring-2 focus:ring-primary'
        >
          <div className='p-8 flex flex-col items-center h-full'>
            <div className='mb-6 p-4 rounded-full bg-gradient-to-br from-orange-400 to-red-600 text-white shadow-inner transform group-hover:scale-110 transition-transform duration-300'>
              <Trophy className='h-12 w-12' />
            </div>
            <h3 className='text-2xl font-bold mb-2'>{t('Ping Pong')}</h3>
            <p className='text-sm text-muted-foreground text-center leading-relaxed'>
              {t('Fast rallies and spin. Climb the ladder quickly.')}
            </p>
          </div>
        </button>
      </div>
    </section>
  );
};

const Dashboard = () => {
  const { t } = useTranslation();
  const router = useRouter();
  const { user, userProfile } = useAuth();
  const { sport, config } = useSport();
  const [lastActiveRoom, setLastActiveRoom] = useState<
    (Room & { id: string }) | null
  >(null);
  const [communityName, setCommunityName] = useState<string | null>(null);

  const sportProfile = userProfile?.sports?.[sport];
  const wins = sportProfile?.wins ?? 0;
  const losses = sportProfile?.losses ?? 0;
  const matchesPlayed = wins + losses;
  const winRate =
    matchesPlayed > 0 ? ((wins / matchesPlayed) * 100).toFixed(1) : '0.0';
  const elo = sportProfile?.globalElo ?? 1000;

  const rankKey = getRank(elo);
  const rankLabel = t(rankKey);

  const thresholds = [1001, 1100, 1200, 1400, 1800, 2000, 3000];
  const nextRankElo = thresholds.find((t) => t > elo) || 3000;
  const prevRankElo =
    [...thresholds].reverse().find((t) => t <= elo) || (elo < 1001 ? 0 : 1000);
  const progress = Math.min(
    100,
    Math.max(0, ((elo - prevRankElo) / (nextRankElo - prevRankElo || 1)) * 100)
  );

  const isOrganizer =
    userProfile?.accountType === 'coach' ||
    userProfile?.roles?.includes('coach');
  const isNewPlayer = matchesPlayed === 0;

  useEffect(() => {
    const fetchData = async () => {
      setLastActiveRoom(null);
      if (!user || !db || !userProfile) return;

      let cName = null;
      if (userProfile.communityIds && userProfile.communityIds.length > 0) {
        try {
          const cDoc = await getDoc(
            doc(db, 'communities', userProfile.communityIds[0])
          );
          if (cDoc.exists()) cName = cDoc.data().name;
        } catch {}
      }

      if (!cName) {
        try {
          const q = query(
            collection(db, 'communities'),
            where('members', 'array-contains', user.uid),
            limit(1)
          );
          const snap = await getDocs(q);
          if (!snap.empty) cName = snap.docs[0].data().name;
        } catch {}
      }
      setCommunityName(cName);

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
      }
    };
    fetchData();
  }, [user, userProfile, sport, config]);

  const handleRecordMatch = () => {
    if (lastActiveRoom) {
      router.push(`/rooms/${lastActiveRoom.id}`);
      return;
    }
    router.push('/rooms');
  };

  return (
    <div className='animate-in fade-in duration-500 space-y-8'>
      <Card className='border-none shadow-lg overflow-hidden bg-card relative'>
        <div
          className={`absolute top-0 left-0 w-full h-2 bg-gradient-to-r ${config.theme.gradientFrom} ${config.theme.gradientTo}`}
        />

        <div className='p-6 sm:p-8 flex flex-col lg:flex-row gap-8 items-start lg:items-center'>
          <div className='flex items-center gap-5 w-full lg:w-auto'>
            <div className='relative shrink-0'>
              <Avatar className='h-24 w-24 border-4 border-background shadow-md overflow-hidden bg-muted'>
                <AvatarImage
                  src={userProfile?.photoURL || undefined}
                  className='object-cover'
                />
                <AvatarFallback className='text-3xl bg-muted'>
                  {userProfile?.name?.[0]}
                </AvatarFallback>
              </Avatar>
              <div
                className={`absolute -bottom-2 -right-2 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border-2 border-background text-white shadow-sm ${
                  isOrganizer ? 'bg-indigo-500' : 'bg-emerald-500'
                }`}
              >
                {isOrganizer ? t('Organizer') : t('Player')}
              </div>
            </div>

            <div className='flex-1 min-w-0'>
              <h1 className='text-3xl font-bold tracking-tight truncate'>
                {userProfile?.name}
              </h1>
              {communityName && (
                <div className='flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1'>
                  <Building2 className='h-3 w-3' />
                  {communityName}
                </div>
              )}
              <div className='flex items-center gap-2 text-muted-foreground font-medium mt-1'>
                <span>{rankLabel}</span>
                <span className='w-1 h-1 bg-muted-foreground/40 rounded-full' />
                <span className='text-primary font-bold'>
                  {elo.toFixed(0)} ELO
                </span>
              </div>
            </div>
          </div>

          {!isNewPlayer && (
            <div className='flex-1 grid grid-cols-3 gap-4 w-full lg:w-auto lg:border-l lg:pl-8'>
              <div className='text-center lg:text-left'>
                <div className='text-2xl font-bold'>{matchesPlayed}</div>
                <div className='text-[10px] uppercase text-muted-foreground font-bold tracking-wider'>
                  {t('Matches')}
                </div>
              </div>
              <div className='text-center lg:text-left'>
                <div className='text-2xl font-bold text-green-600'>{wins}</div>
                <div className='text-[10px] uppercase text-muted-foreground font-bold tracking-wider'>
                  {t('Wins')}
                </div>
              </div>
              <div className='text-center lg:text-left'>
                <div className='text-2xl font-bold'>{winRate}%</div>
                <div className='text-[10px] uppercase text-muted-foreground font-bold tracking-wider'>
                  {t('Win Rate')}
                </div>
              </div>
            </div>
          )}

          <div className='flex flex-col sm:flex-row gap-3 w-full lg:w-auto lg:ml-auto min-w-[200px]'>
            <Button
              size='lg'
              className='w-full shadow-md gap-2'
              onClick={handleRecordMatch}
            >
              <Rocket size={18} /> {t('Record Match')}
            </Button>

            <div className='flex gap-2'>
              {!isNewPlayer && (
                <Button
                  variant='outline'
                  className='flex-1 gap-2'
                  asChild
                  title={t('Wrap 2025')}
                >
                  <Link href='/wrap'>
                    <History size={18} /> {t('Wrap')}
                  </Link>
                </Button>
              )}

              <Button
                variant='outline'
                size='icon'
                asChild
                title={t('Profile')}
                className='aspect-square'
              >
                <Link href={`/profile/${user?.uid}`}>
                  <User size={18} />
                </Link>
              </Button>
            </div>
          </div>
        </div>

        {!isNewPlayer && (
          <div className='bg-muted/30 px-6 py-2 border-t flex items-center justify-between text-xs font-medium text-muted-foreground'>
            <div className='flex items-center gap-2'>
              <Target className='h-3 w-3' />
              <span>{elo.toFixed(0)}</span>
            </div>
            <div className='flex-1 mx-4 max-w-md'>
              <Progress value={progress} className='h-2' />
            </div>
            <div className='flex items-center gap-1'>
              <span>{nextRankElo}</span>
              <span className='opacity-60'>({t('Next Rank')})</span>
            </div>
          </div>
        )}

        {isNewPlayer && (
          <div className='bg-muted/30 px-6 py-3 border-t text-sm text-center text-muted-foreground'>
            {t('Welcome! Use the control panel below to find a community.')}
          </div>
        )}
      </Card>

      {/* NEW Control Panel Component */}
      <ControlPanel />

      {lastActiveRoom && (
        <div className='animate-in slide-in-from-top-2 fade-in'>
          <Card className='bg-primary/5 border-primary/20 hover:border-primary/40 transition-colors'>
            <CardContent className='p-4 flex items-center justify-between'>
              <div className='flex items-center gap-3'>
                <div className='bg-primary/10 p-2 rounded-full text-primary'>
                  <Play className='h-5 w-5 fill-current' />
                </div>
                <div>
                  <div className='font-semibold'>{t('Continue Playing')}</div>
                  <div className='text-sm text-muted-foreground'>
                    {t('Jump back into: {{room}}', {
                      room: lastActiveRoom.name,
                    })}
                  </div>
                </div>
              </div>
              <Button size='sm' asChild>
                <Link href={`/rooms/${lastActiveRoom.id}`}>
                  {t('Open Room')} <ArrowRight className='ml-2 h-4 w-4' />
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      <div className='grid grid-cols-1 lg:grid-cols-3 gap-8'>
        <div className='lg:col-span-2 space-y-6'>
          <Card className='shadow-lg border-none overflow-hidden'>
            <PlayersTable sport={sport} />
          </Card>
        </div>

        <div className='space-y-6'>
          <LiveFeed />

          <div className='pt-4 border-t flex flex-wrap justify-center gap-6 text-xs text-muted-foreground opacity-50 hover:opacity-100 transition-opacity'>
            <Link
              href='/privacy'
              className='hover:text-primary transition-colors'
            >
              {t('Privacy Policy')}
            </Link>
            <Link
              href='/terms'
              className='hover:text-primary transition-colors'
            >
              {t('Terms of Service')}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};

const LandingPage = () => {
  const { t } = useTranslation();
  return (
    <div className='flex flex-col min-h-screen'>
      <main className='flex-1'>
        <section className='w-full py-12 md:py-24 lg:py-32 xl:py-48 bg-primary/5 rounded-3xl mb-12'>
          <div className='container px-4 md:px-6'>
            <div className='flex flex-col items-center space-y-4 text-center'>
              <div className='space-y-2'>
                <h1 className='text-3xl font-bold tracking-tighter sm:text-4xl md:text-5xl lg:text-6xl/none'>
                  {t('SmashLog: Elevate Your Game')}
                </h1>
                <p className='mx-auto max-w-[800px] text-muted-foreground md:text-xl'>
                  {t(
                    'The ultimate platform for tracking matches, ELO ratings, and tournaments. Perfect for office leagues, sports clubs, and professional sections.'
                  )}
                </p>
              </div>
              <div className='space-x-4 pt-4'>
                <Link href='/register'>
                  <Button size='lg' className='h-11 px-8 shadow-lg'>
                    {t('Start for Free')}
                  </Button>
                </Link>
                <Link href='/login'>
                  <Button variant='outline' size='lg' className='h-11 px-8'>
                    {t('Login')}
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </section>

        <section className='w-full pb-12 md:pb-24 lg:pb-32'>
          <div className='container px-4 md:px-6'>
            <div className='flex flex-col items-center justify-center space-y-4 text-center mb-12'>
              <div className='space-y-2'>
                <h2 className='text-3xl font-bold tracking-tighter sm:text-5xl'>
                  {t('Why SmashLog?')}
                </h2>
                <p className='max-w-[900px] text-muted-foreground md:text-xl/relaxed lg:text-base/relaxed xl:text-xl/relaxed'>
                  {t(
                    'Built to support any group size — from casual office rivalries to competitive sports sections.'
                  )}
                </p>
              </div>
            </div>
            <div className='mx-auto grid max-w-5xl items-stretch gap-6 lg:grid-cols-3 lg:gap-12'>
              <Card className='h-full border-2 hover:border-primary/50 transition-colors'>
                <CardHeader>
                  <Building2 className='h-10 w-10 mb-2 text-primary' />
                  <CardTitle>{t('Offices & Clubs')}</CardTitle>
                  <CardDescription>
                    {t('A home for your community.')}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <p className='text-sm text-muted-foreground'>
                    {t(
                      'Create a dedicated space for your "IT Dept" or "City Sports Club". Manage members, organize internal leagues, and keep history in one place.'
                    )}
                  </p>
                </CardContent>
              </Card>
              <Card className='h-full border-2 hover:border-primary/50 transition-colors'>
                <CardHeader>
                  <Ghost className='h-10 w-10 mb-2 text-primary' />
                  <CardTitle>{t('Ghost Players')}</CardTitle>
                  <CardDescription>{t('Seamless onboarding.')}</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className='text-sm text-muted-foreground'>
                    {t(
                      'Add players even if they haven\'t registered yet. Track their stats immediately. They can "claim" their ghost profile and stats later when they join.'
                    )}
                  </p>
                </CardContent>
              </Card>
              <Card className='h-full border-2 hover:border-primary/50 transition-colors'>
                <CardHeader>
                  <Trophy className='h-10 w-10 mb-2 text-primary' />
                  <CardTitle>{t('Professional ELO')}</CardTitle>
                  <CardDescription>{t('Fair ranking system.')}</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className='text-sm text-muted-foreground'>
                    {t(
                      'We use advanced rating algorithms adapted for racket sports. Watch your progress from Rookie to Pro with detailed charts.'
                    )}
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>

        <section className='w-full py-12 md:py-24 lg:py-32 bg-secondary/20 rounded-3xl'>
          <div className='container px-4 md:px-6'>
            <div className='grid gap-10 lg:grid-cols-2 items-center'>
              <div className='space-y-4'>
                <h2 className='text-3xl font-bold tracking-tighter sm:text-4xl'>
                  {t('Play Your Way')}
                </h2>
                <p className='text-muted-foreground md:text-lg'>
                  {t(
                    'Different groups have different needs. Choose the mode that fits your atmosphere.'
                  )}
                </p>
                <ul className='grid gap-4 mt-6'>
                  <li className='flex items-start gap-3'>
                    <ShieldCheck className='h-6 w-6 text-primary shrink-0' />
                    <div>
                      <h3 className='font-bold'>{t('Professional')}</h3>
                      <p className='text-sm text-muted-foreground'>
                        {t(
                          'Strict rules, zero-sum ELO. Every point matters. For serious clubs.'
                        )}
                      </p>
                    </div>
                  </li>
                  <li className='flex items-start gap-3'>
                    <Building2 className='h-6 w-6 text-primary shrink-0' />
                    <div>
                      <h3 className='font-bold'>{t('Office League')}</h3>
                      <p className='text-sm text-muted-foreground'>
                        {t(
                          'Inflationary ELO to encourage participation. Fun but competitive. Best for workplaces.'
                        )}
                      </p>
                    </div>
                  </li>
                  <li className='flex items-start gap-3'>
                    <Gamepad2 className='h-6 w-6 text-primary shrink-0' />
                    <div>
                      <h3 className='font-bold'>{t('Arcade')}</h3>
                      <p className='text-sm text-muted-foreground'>
                        {t(
                          'Fast matches, simplified tracking. Just for fun, no rating pressure.'
                        )}
                      </p>
                    </div>
                  </li>
                </ul>
              </div>
              <div className='flex justify-center lg:justify-end'>
                <div className='relative group'>
                  <div className='absolute -inset-1 bg-gradient-to-r from-primary to-purple-600 rounded-lg blur opacity-25 group-hover:opacity-50 transition duration-1000 group-hover:duration-200'></div>
                  <div className='relative bg-background p-6 rounded-lg border shadow-xl w-full max-w-sm'>
                    <div className='flex items-center gap-4 mb-4'>
                      <Users className='h-8 w-8 text-primary' />
                      <div>
                        <div className='font-bold text-lg'>
                          {t('Match Statistics')}
                        </div>
                        <div className='text-xs text-muted-foreground'>
                          Community Hub • Ping Pong
                        </div>
                      </div>
                    </div>
                    <div className='space-y-2'>
                      <div className='flex justify-between items-center p-3 bg-secondary rounded'>
                        <span className='font-medium'>Alex (Ghost)</span>
                        <span className='font-bold text-xl'>11</span>
                      </div>
                      <div className='flex justify-between items-center p-3 bg-primary/10 border border-primary/20 rounded'>
                        <span className='font-medium'>Dmitry</span>
                        <span className='font-bold text-xl'>9</span>
                      </div>
                    </div>
                    <div className='mt-4 text-center text-xs text-muted-foreground'>
                      {t('Match finished • Rating updated')}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className='w-full py-12 md:py-24 lg:py-32'>
          <div className='container px-4 md:px-6 text-center'>
            <h2 className='text-3xl font-bold tracking-tighter sm:text-4xl mb-4'>
              {t('Ready to compete?')}
            </h2>
            <p className='mx-auto max-w-[600px] text-muted-foreground md:text-xl mb-8'>
              {t(
                'Join SmashLog today. Create your community and start tracking your path to victory.'
              )}
            </p>
            <Link href='/register'>
              <Button size='lg' className='h-11 px-8 font-bold'>
                {t('Create Account')}
              </Button>
            </Link>
          </div>
        </section>
      </main>
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