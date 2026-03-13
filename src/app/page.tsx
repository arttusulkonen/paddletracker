// src/app/page.tsx
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
          className='group relative overflow-hidden rounded-[2rem] glass-panel transition-all hover:scale-[1.02] hover:shadow-2xl focus:outline-none focus:ring-2 focus:ring-primary'
        >
          <div className='p-10 flex flex-col items-center h-full'>
            <div className='mb-6 p-5 rounded-full bg-gradient-to-br from-orange-400 to-red-600 text-white shadow-lg transform group-hover:scale-110 transition-transform duration-500 ease-out'>
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
    Math.max(0, ((elo - prevRankElo) / (nextRankElo - prevRankElo || 1)) * 100),
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
            doc(db, 'communities', userProfile.communityIds[0]),
          );
          if (cDoc.exists()) cName = cDoc.data().name;
        } catch {}
      }

      if (!cName) {
        try {
          const q = query(
            collection(db, 'communities'),
            where('members', 'array-contains', user.uid),
            limit(1),
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
          limit(1),
        );
        const matchSnap = await getDocs(matchesQuery);

        if (!matchSnap.empty) {
          const lastMatch = matchSnap.docs[0].data();
          if (lastMatch.roomId) {
            const roomDoc = await getDoc(
              doc(db, config.collections.rooms, lastMatch.roomId),
            );
            if (roomDoc.exists() && !roomDoc.data().isArchived) {
              setLastActiveRoom({
                id: roomDoc.id,
                ...roomDoc.data(),
              } as Room & { id: string });
            }
          }
        }
      } catch {}
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
    <div className='animate-in fade-in duration-700 space-y-8'>
      <Card className='border-0 shadow-2xl rounded-[2.5rem] overflow-hidden glass-panel relative'>
        <div
          className={`absolute top-0 left-0 w-full h-1.5 opacity-80 bg-gradient-to-r ${config.theme.gradientFrom} ${config.theme.gradientTo}`}
        />

        <div className='p-8 md:p-10 flex flex-col xl:flex-row gap-10 items-start xl:items-center'>
          <div className='flex items-center gap-6 w-full xl:w-auto'>
            <div className='relative shrink-0'>
              <Avatar className='h-28 w-28 ring-4 ring-white/40 dark:ring-black/20 shadow-2xl overflow-hidden bg-muted'>
                <AvatarImage
                  src={userProfile?.photoURL || undefined}
                  className='object-cover'
                />
                <AvatarFallback className='text-4xl bg-muted font-light'>
                  {userProfile?.name?.[0]}
                </AvatarFallback>
              </Avatar>
              <div
                className={`absolute -bottom-2 -right-2 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest text-white shadow-xl backdrop-blur-md ${
                  isOrganizer ? 'bg-indigo-500/90' : 'bg-primary/90'
                }`}
              >
                {isOrganizer ? t('Organizer') : t('Player')}
              </div>
            </div>

            <div className='flex-1 min-w-0'>
              <h1 className='text-4xl md:text-5xl font-extrabold tracking-tight truncate mb-1'>
                {userProfile?.name}
              </h1>
              {communityName && (
                <div className='flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-2'>
                  <Building2 className='h-3.5 w-3.5' />
                  {communityName}
                </div>
              )}
              <div className='flex items-center gap-2.5 text-muted-foreground font-medium mt-2'>
                <span className='bg-muted/50 px-3 py-1 rounded-full text-xs'>
                  {rankLabel}
                </span>
                <span className='text-primary font-bold text-lg'>
                  {elo.toFixed(0)}{' '}
                  <span className='text-xs font-normal opacity-70'>ELO</span>
                </span>
              </div>
            </div>
          </div>

          {!isNewPlayer && (
            <div className='flex-1 grid grid-cols-3 gap-6 w-full xl:w-auto xl:border-l xl:border-border/40 xl:pl-10'>
              <div className='flex flex-col items-center xl:items-start'>
                <div className='text-4xl font-light tracking-tighter'>
                  {matchesPlayed}
                </div>
                <div className='text-[10px] uppercase text-muted-foreground font-bold tracking-widest mt-1'>
                  {t('Matches')}
                </div>
              </div>
              <div className='flex flex-col items-center xl:items-start'>
                <div className='text-4xl font-light tracking-tighter text-emerald-500'>
                  {wins}
                </div>
                <div className='text-[10px] uppercase text-emerald-500/70 font-bold tracking-widest mt-1'>
                  {t('Wins')}
                </div>
              </div>
              <div className='flex flex-col items-center xl:items-start'>
                <div className='text-4xl font-light tracking-tighter'>
                  {winRate}
                  <span className='text-xl'>%</span>
                </div>
                <div className='text-[10px] uppercase text-muted-foreground font-bold tracking-widest mt-1'>
                  {t('Win Rate')}
                </div>
              </div>
            </div>
          )}

          <div className='flex flex-col sm:flex-row gap-4 w-full xl:w-auto xl:ml-auto min-w-[240px]'>
            <Button
              size='lg'
              className='w-full rounded-full shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all gap-2 h-14 text-base font-semibold'
              onClick={handleRecordMatch}
            >
              <Rocket size={20} /> {t('Record Match')}
            </Button>

            <div className='flex gap-3'>
              {!isNewPlayer && (
                <Button
                  variant='outline'
                  className='flex-1 gap-2 rounded-full h-14 bg-white/40 dark:bg-black/40 backdrop-blur-md border-0 ring-1 ring-black/5 dark:ring-white/10 hover:bg-white/60 dark:hover:bg-white/10 hover:text-black hover:-translate-y-0.5 hover:shadow-xl transition-all'
                  asChild
                >
                  <Link href='/wrap'>
                    <History size={20} /> {t('Wrap')}
                  </Link>
                </Button>
              )}

              <Button
                variant='outline'
                size='icon'
                asChild
                className='aspect-square rounded-full h-14 w-14 bg-white/40 dark:bg-black/40 backdrop-blur-md border-0 ring-1 ring-black/5 dark:ring-white/10 hover:bg-white/60 dark:hover:bg-white/10 hover:text-black hover:-translate-y-0.5 hover:shadow-xl transition-all'
              >
                <Link href={`/profile/${user?.uid}`}>
                  <User size={20} />
                </Link>
              </Button>
            </div>
          </div>
        </div>

        {!isNewPlayer && (
          <div className='bg-black/5 dark:bg-white/5 px-8 py-4 border-t border-white/10 flex items-center justify-between text-xs font-medium text-muted-foreground backdrop-blur-3xl'>
            <div className='flex items-center gap-2'>
              <Target className='h-4 w-4' />
              <span className='font-mono'>{elo.toFixed(0)}</span>
            </div>
            <div className='flex-1 mx-6 max-w-2xl'>
              <Progress
                value={progress}
                className='h-2.5 bg-black/5 dark:bg-white/10'
              />
            </div>
            <div className='flex items-center gap-1.5'>
              <span className='font-mono'>{nextRankElo}</span>
              <span className='opacity-50 uppercase tracking-widest text-[9px]'>
                ({t('Next Rank')})
              </span>
            </div>
          </div>
        )}

        {isNewPlayer && (
          <div className='bg-black/5 dark:bg-white/5 px-8 py-5 border-t border-white/10 text-sm text-center text-muted-foreground backdrop-blur-3xl'>
            {t('Welcome! Use the control panel below to find a community.')}
          </div>
        )}
      </Card>

      <ControlPanel />

      {lastActiveRoom && (
        <div className='animate-in slide-in-from-bottom-4 fade-in duration-700'>
          <Card className='border-0 bg-primary/5 dark:bg-primary/10 backdrop-blur-xl shadow-lg ring-1 ring-primary/20 hover:ring-primary/40 transition-all rounded-3xl'>
            <CardContent className='p-6 flex items-center justify-between'>
              <div className='flex items-center gap-4'>
                <div className='bg-background/80 shadow-sm p-3 rounded-full text-primary backdrop-blur-md'>
                  <Play className='h-6 w-6 fill-current' />
                </div>
                <div>
                  <div className='font-bold text-lg'>
                    {t('Continue Playing')}
                  </div>
                  <div className='text-sm text-muted-foreground mt-0.5'>
                    {t('Jump back into: {{room}}', {
                      room: lastActiveRoom.name,
                    })}
                  </div>
                </div>
              </div>
              <Button
                size='lg'
                className='rounded-full shadow-md font-semibold'
                asChild
              >
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
          <Card className='border-0 shadow-xl rounded-[2.5rem] overflow-hidden glass-panel'>
            <PlayersTable sport={sport} />
          </Card>
        </div>

        <div className='space-y-6'>
          <LiveFeed />

          <div className='pt-6 flex flex-wrap justify-center gap-6 text-xs font-medium text-muted-foreground opacity-60 hover:opacity-100 transition-opacity'>
            <Link
              href='/privacy'
              className='hover:text-foreground transition-colors'
            >
              {t('Privacy Policy')}
            </Link>
            <Link
              href='/terms'
              className='hover:text-foreground transition-colors'
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
    <div className='flex flex-col min-h-screen font-sans'>
      <main className='flex-1'>
        <section className='w-full py-20 md:py-32 lg:py-48 bg-gradient-to-b from-primary/10 to-transparent rounded-[3rem] mb-16 relative overflow-hidden'>
          <div className='absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-3xl h-full bg-primary/5 blur-3xl rounded-full mix-blend-multiply pointer-events-none' />
          <div className='container px-4 md:px-6 relative z-10'>
            <div className='flex flex-col items-center space-y-6 text-center'>
              <div className='space-y-4'>
                <h1 className='text-5xl font-extrabold tracking-tight sm:text-6xl md:text-7xl lg:text-8xl/none text-transparent bg-clip-text bg-gradient-to-br from-foreground to-foreground/70 pb-2'>
                  {t('SmashLog: Elevate Your Game')}
                </h1>
                <p className='mx-auto max-w-[700px] text-muted-foreground md:text-xl lg:text-2xl leading-relaxed font-light'>
                  {t(
                    'The ultimate platform for tracking matches, ELO ratings, and tournaments. Perfect for office leagues, sports clubs, and professional sections.',
                  )}
                </p>
              </div>
              <div className='space-x-4 pt-8'>
                <Link href='/register'>
                  <Button
                    size='lg'
                    className='h-14 px-10 shadow-2xl rounded-full text-lg font-semibold hover:scale-105 transition-transform'
                  >
                    {t('Start for Free')}
                  </Button>
                </Link>
                <Link href='/login'>
                  <Button
                    variant='outline'
                    size='lg'
                    className='h-14 px-10 rounded-full text-lg font-semibold border-0 glass-panel hover:bg-white/80 dark:hover:bg-white/10 hover:text-foreground transition-all'
                  >
                    {t('Login')}
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </section>

        <section className='w-full pb-20 md:pb-32 lg:pb-40'>
          <div className='container px-4 md:px-6'>
            <div className='flex flex-col items-center justify-center space-y-4 text-center mb-16'>
              <div className='space-y-3'>
                <h2 className='text-4xl font-extrabold tracking-tight sm:text-5xl'>
                  {t('Why SmashLog?')}
                </h2>
                <p className='max-w-[700px] text-muted-foreground md:text-xl/relaxed lg:text-lg/relaxed xl:text-xl/relaxed font-light'>
                  {t(
                    'Built to support any group size — from casual office rivalries to competitive sports sections.',
                  )}
                </p>
              </div>
            </div>
            <div className='mx-auto grid max-w-6xl items-stretch gap-8 lg:grid-cols-3'>
              <Card className='h-full border-0 glass-panel p-2 rounded-[2.5rem] hover:shadow-2xl hover:-translate-y-2 transition-all duration-500'>
                <CardHeader className='px-8 pt-8'>
                  <div className='h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4'>
                    <Building2 className='h-8 w-8 text-primary' />
                  </div>
                  <CardTitle className='text-2xl'>
                    {t('Offices & Clubs')}
                  </CardTitle>
                  <CardDescription className='text-base mt-2'>
                    {t('A home for your community.')}
                  </CardDescription>
                </CardHeader>
                <CardContent className='px-8 pb-8'>
                  <p className='text-muted-foreground leading-relaxed font-light'>
                    {t(
                      'Create a dedicated space for your "IT Dept" or "City Sports Club". Manage members, organize internal leagues, and keep history in one place.',
                    )}
                  </p>
                </CardContent>
              </Card>
              <Card className='h-full border-0 glass-panel p-2 rounded-[2.5rem] hover:shadow-2xl hover:-translate-y-2 transition-all duration-500'>
                <CardHeader className='px-8 pt-8'>
                  <div className='h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4'>
                    <Ghost className='h-8 w-8 text-primary' />
                  </div>
                  <CardTitle className='text-2xl'>
                    {t('Ghost Players')}
                  </CardTitle>
                  <CardDescription className='text-base mt-2'>
                    {t('Seamless onboarding.')}
                  </CardDescription>
                </CardHeader>
                <CardContent className='px-8 pb-8'>
                  <p className='text-muted-foreground leading-relaxed font-light'>
                    {t(
                      'Add players even if they haven\'t registered yet. Track their stats immediately. They can "claim" their ghost profile and stats later when they join.',
                    )}
                  </p>
                </CardContent>
              </Card>
              <Card className='h-full border-0 glass-panel p-2 rounded-[2.5rem] hover:shadow-2xl hover:-translate-y-2 transition-all duration-500'>
                <CardHeader className='px-8 pt-8'>
                  <div className='h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4'>
                    <Trophy className='h-8 w-8 text-primary' />
                  </div>
                  <CardTitle className='text-2xl'>
                    {t('Professional ELO')}
                  </CardTitle>
                  <CardDescription className='text-base mt-2'>
                    {t('Fair ranking system.')}
                  </CardDescription>
                </CardHeader>
                <CardContent className='px-8 pb-8'>
                  <p className='text-muted-foreground leading-relaxed font-light'>
                    {t(
                      'We use advanced rating algorithms adapted for racket sports. Watch your progress from Rookie to Pro with detailed charts.',
                    )}
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>

        <section className='w-full py-20 md:py-32 glass-panel border-x-0 rounded-none relative overflow-hidden'>
          <div className='absolute inset-0 bg-gradient-to-r from-blue-500/5 to-purple-500/5 mix-blend-overlay' />
          <div className='container px-4 md:px-6 relative z-10'>
            <div className='grid gap-16 lg:grid-cols-2 items-center max-w-6xl mx-auto'>
              <div className='space-y-6'>
                <h2 className='text-4xl font-extrabold tracking-tight sm:text-5xl'>
                  {t('Play Your Way')}
                </h2>
                <p className='text-muted-foreground text-lg md:text-xl font-light leading-relaxed'>
                  {t(
                    'Different groups have different needs. Choose the mode that fits your atmosphere.',
                  )}
                </p>
                <ul className='grid gap-8 mt-10'>
                  <li className='flex items-start gap-5'>
                    <div className='p-3 bg-background shadow-md rounded-2xl ring-1 ring-black/5 dark:ring-white/10'>
                      <ShieldCheck className='h-6 w-6 text-primary' />
                    </div>
                    <div>
                      <h3 className='font-bold text-xl mb-1'>
                        {t('Professional')}
                      </h3>
                      <p className='text-muted-foreground font-light'>
                        {t(
                          'Strict rules, zero-sum ELO. Every point matters. For serious clubs.',
                        )}
                      </p>
                    </div>
                  </li>
                  <li className='flex items-start gap-5'>
                    <div className='p-3 bg-background shadow-md rounded-2xl ring-1 ring-black/5 dark:ring-white/10'>
                      <Building2 className='h-6 w-6 text-primary' />
                    </div>
                    <div>
                      <h3 className='font-bold text-xl mb-1'>
                        {t('Office League')}
                      </h3>
                      <p className='text-muted-foreground font-light'>
                        {t(
                          'Inflationary ELO to encourage participation. Fun but competitive. Best for workplaces.',
                        )}
                      </p>
                    </div>
                  </li>
                  <li className='flex items-start gap-5'>
                    <div className='p-3 bg-background shadow-md rounded-2xl ring-1 ring-black/5 dark:ring-white/10'>
                      <Gamepad2 className='h-6 w-6 text-primary' />
                    </div>
                    <div>
                      <h3 className='font-bold text-xl mb-1'>{t('Arcade')}</h3>
                      <p className='text-muted-foreground font-light'>
                        {t(
                          'Fast matches, simplified tracking. Just for fun, no rating pressure.',
                        )}
                      </p>
                    </div>
                  </li>
                </ul>
              </div>
              <div className='flex justify-center lg:justify-end relative'>
                <div className='relative group w-full max-w-md'>
                  <div className='absolute -inset-4 bg-gradient-to-r from-primary/30 to-purple-600/30 rounded-[3rem] blur-2xl opacity-50 group-hover:opacity-80 transition duration-1000 group-hover:duration-500'></div>
                  <div className='relative glass-panel bg-white/80 dark:bg-zinc-900/80 p-8 rounded-[2.5rem] border-0 shadow-2xl w-full transform group-hover:-translate-y-2 transition-transform duration-500'>
                    <div className='flex items-center gap-5 mb-8'>
                      <div className='p-3 bg-primary/10 rounded-2xl'>
                        <Users className='h-8 w-8 text-primary' />
                      </div>
                      <div>
                        <div className='font-bold text-xl'>
                          {t('Match Statistics')}
                        </div>
                        <div className='text-sm text-muted-foreground font-medium'>
                          Community Hub • Ping Pong
                        </div>
                      </div>
                    </div>
                    <div className='space-y-3'>
                      <div className='flex justify-between items-center p-4 bg-background/50 rounded-2xl ring-1 ring-black/5 dark:ring-white/5 backdrop-blur-sm'>
                        <span className='font-medium'>Alex (Ghost)</span>
                        <span className='font-bold text-2xl'>11</span>
                      </div>
                      <div className='flex justify-between items-center p-4 bg-primary/10 rounded-2xl ring-1 ring-primary/20 backdrop-blur-sm'>
                        <span className='font-bold text-primary'>Dmitry</span>
                        <span className='font-bold text-2xl text-primary'>
                          9
                        </span>
                      </div>
                    </div>
                    <div className='mt-8 flex justify-center'>
                      <div className='bg-background/80 backdrop-blur-md px-4 py-2 rounded-full text-xs font-semibold text-muted-foreground shadow-sm ring-1 ring-black/5 dark:ring-white/10'>
                        {t('Match finished • Rating updated')}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className='w-full py-24 md:py-40 relative'>
          <div className='container px-4 md:px-6 text-center relative z-10'>
            <h2 className='text-4xl font-extrabold tracking-tight sm:text-6xl mb-6'>
              {t('Ready to compete?')}
            </h2>
            <p className='mx-auto max-w-[600px] text-muted-foreground md:text-2xl mb-10 font-light leading-relaxed'>
              {t(
                'Join SmashLog today. Create your community and start tracking your path to victory.',
              )}
            </p>
            <Link href='/register'>
              <Button
                size='lg'
                className='h-16 px-12 text-xl rounded-full shadow-2xl hover:scale-105 transition-transform'
              >
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
        <div className='animate-pulse flex flex-col items-center gap-6'>
          <div className='h-16 w-16 rounded-full bg-primary/20 blur-sm'></div>
        </div>
      </div>
    );
  }

  const needsToSelectSport = user && userProfile && !userProfile.activeSport;

  return (
    <div className='min-h-screen bg-background selection:bg-primary/30'>
      <main className='container mx-auto px-4 py-8 sm:py-16'>
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
