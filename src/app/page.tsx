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
	CardHeader,
	CardTitle
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
	Briefcase,
	Compass,
	Gamepad2,
	History,
	LogIn,
	Medal,
	Network,
	Play,
	Rocket,
	Shield,
	Target,
	Trophy,
	User,
} from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

// --- Helpers ---
const AI_CUTOFF_DATE = new Date('2025-12-01').getTime();

const parseCreatedAt = (dateStr?: string) => {
  if (!dateStr) return 0;
  // Пытаемся распарсить финский формат "DD.MM.YYYY"
  const parts = dateStr.split(' ');
  const dateParts = parts[0].split('.');
  if (dateParts.length === 3) {
    const d = new Date(+dateParts[2], +dateParts[1] - 1, +dateParts[0]);
    return d.getTime();
  }
  // Если формат другой, пробуем стандартный парсер
  const iso = Date.parse(dateStr);
  return isNaN(iso) ? 0 : iso;
};

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
              className='group relative overflow-hidden rounded-2xl bg-card text-card-foreground shadow-lg transition-all hover:shadow-lg hover:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2'
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
  const router = useRouter();
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
  const rankKey = getRank(elo);
  const rankLabel = t(rankKey);
  const medalSrc = medalMap[rankKey];

  // Next rank progress
  const thresholds = [1001, 1100, 1200, 1400, 1800, 2000, 3000];
  const nextRankElo = thresholds.find((t) => t > elo) || 3000;
  const prevRankElo =
    [...thresholds].reverse().find((t) => t <= elo) || (elo < 1001 ? 0 : 1000);
  // const pointsNeeded = nextRankElo - elo; 
  const progress = Math.min(
    100,
    Math.max(0, ((elo - prevRankElo) / (nextRankElo - prevRankElo || 1)) * 100)
  );

  useEffect(() => {
    const fetchLastActiveRoom = async () => {
      setLastActiveRoom(null); // Reset on sport change
      
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

  const handleRecordMatch = () => {
    // 1. Проверяем, есть ли активная комната
    if (lastActiveRoom) {
      router.push(`/rooms/${lastActiveRoom.id}`);
      return;
    }

    // 2. Если комнаты нет, проверяем дату регистрации пользователя
    const createdTs = parseCreatedAt(userProfile?.createdAt);
    const isNewUser = createdTs >= AI_CUTOFF_DATE;

    if (isNewUser) {
      // Новых пользователей отправляем выбирать комнату
      router.push('/rooms');
    } else {
      // Старых пользователей отправляем к AI (триггерим событие)
      window.dispatchEvent(new CustomEvent('open-ai-assistant'));
    }
  };

  return (
    <div className='animate-in fade-in duration-500 space-y-8'>
      {/* 1. PLAYER HERO CARD */}
      <Card className='border-none shadow-lg overflow-hidden bg-card relative'>
        <div
          className={`absolute top-0 left-0 w-full h-2 bg-gradient-to-r ${config.theme.gradientFrom} ${config.theme.gradientTo}`}
        />
        <div className='p-6 sm:p-8 flex flex-col md:flex-row gap-8 items-start md:items-center'>
          
          {/* Avatar & Rank */}
          <div className='flex items-center gap-5'>
            <div className='relative'>
              <Avatar className='h-24 w-24 border-4 border-background shadow-md overflow-hidden bg-muted'>
                <AvatarImage src={userProfile?.photoURL || undefined} className="object-cover" />
                <AvatarFallback className='text-3xl bg-muted'>
                  {userProfile?.name?.[0]}
                </AvatarFallback>
              </Avatar>
            </div>
            <div>
              <h1 className='text-3xl font-bold tracking-tight'>
                {userProfile?.name}
              </h1>
              <div className='flex items-center gap-2 text-muted-foreground font-medium'>
                <span>{rankLabel}</span>
                <span className='w-1 h-1 bg-muted-foreground/40 rounded-full' />
                <span className='text-primary font-bold'>{elo.toFixed(0)} ELO</span>
              </div>
            </div>
          </div>

          {/* Key Stats */}
          <div className='flex-1 grid grid-cols-3 gap-2 w-full md:w-auto md:border-l md:pl-8'>
            <div className='text-center md:text-left'>
              <div className='text-2xl font-bold'>{matchesPlayed}</div>
              <div className='text-[10px] uppercase text-muted-foreground font-bold tracking-wider'>{t('Matches')}</div>
            </div>
            <div className='text-center md:text-left'>
              <div className='text-2xl font-bold text-green-600'>{wins}</div>
              <div className='text-[10px] uppercase text-muted-foreground font-bold tracking-wider'>{t('Wins')}</div>
            </div>
            <div className='text-center md:text-left'>
              <div className='text-2xl font-bold'>{winRate}%</div>
              <div className='text-[10px] uppercase text-muted-foreground font-bold tracking-wider'>{t('Win Rate')}</div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className='flex flex-col sm:flex-row gap-3 w-full md:w-auto min-w-[200px]'>
            <Button size='lg' className='w-full shadow-md gap-2' onClick={handleRecordMatch}>
              <Rocket size={18} /> {t('Record Match')}
            </Button>
            <div className='flex gap-2'>
              <Button variant='outline' className='flex-1 gap-2' asChild title={t('Wrap 2025')}>
                <Link href='/wrap'>
                  <History size={18} /> {t('Wrap')}
                </Link>
              </Button>
              <Button variant='outline' size='icon' asChild title={t('Profile')}>
                <Link href={`/profile/${user?.uid}`}>
                  <User size={18} />
                </Link>
              </Button>
            </div>
          </div>
        </div>

        {/* Progress Bar Footer */}
        <div className='bg-muted/30 px-6 py-2 border-t flex items-center justify-between text-xs font-medium text-muted-foreground'>
          <div className="flex items-center gap-2">
             <Target className="h-3 w-3" />
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
      </Card>

      {/* JUMP BACK IN BANNER */}
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
                    {t('Jump back into: {{room}}', { room: lastActiveRoom.name })}
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

      {/* MAIN CONTENT GRID */}
      <div className='grid grid-cols-1 lg:grid-cols-3 gap-8'>
        
        {/* LEFT COL: Leaderboard */}
        <div className='lg:col-span-2 space-y-6'>

          <Card className='shadow-lg border-none overflow-hidden'>
            <PlayersTable sport={sport} />
          </Card>
        </div>

        {/* RIGHT COL: Live Feed */}
        <div className='space-y-6'>
          <LiveFeed />
          
          <div className='pt-4 border-t flex flex-wrap justify-center gap-6 text-xs text-muted-foreground opacity-50 hover:opacity-100 transition-opacity'>
             <Link href="/privacy" className='hover:text-primary transition-colors'>{t('Privacy Policy')}</Link>
             <Link href="/terms" className='hover:text-primary transition-colors'>{t('Terms of Service')}</Link>
          </div>
        </div>
      </div>

      {/* ONBOARDING (Empty State) */}
      {matchesPlayed === 0 && (
        // Расположен слева, чтобы не перекрывать AI Assistant (если он есть)
        <div className='fixed bottom-6 left-6 max-w-sm z-50 animate-in slide-in-from-left-10 fade-in duration-700'>
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

const GameModesShowcase = () => {
  const { t } = useTranslation();
  return (
    <section className='mb-24'>
      <div className='text-center mb-12'>
        <h2 className='text-3xl font-bold'>{t('Play Your Way')}</h2>
        <p className='text-muted-foreground mt-2'>
          {t('Choose the scoring system that fits your group.')}
        </p>
      </div>
      <div className='grid grid-cols-1 md:grid-cols-3 gap-6'>
        <Card className='border-l-4 border-l-primary hover:shadow-md transition-all'>
          <CardHeader>
            <div className='mb-4 w-12 h-12 bg-primary/10 rounded-2xl flex items-center justify-center text-primary'>
              <Briefcase size={24} />
            </div>
            <CardTitle className='text-xl'>{t('Office League')}</CardTitle>
            <CardDescription className='text-sm font-medium text-primary'>
              {t('Fun & Engaging')}
            </CardDescription>
          </CardHeader>
          <CardContent className='text-sm text-muted-foreground leading-relaxed'>
            {t(
              'Inflationary ELO keeps everyone motivated. Losers lose less points, active players climb higher. Perfect for workplace rivalries.'
            )}
          </CardContent>
        </Card>

        <Card className='border-l-4 border-l-amber-500 hover:shadow-md transition-all'>
          <CardHeader>
            <div className='mb-4 w-12 h-12 bg-amber-500/10 rounded-2xl flex items-center justify-center text-amber-600'>
              <Medal size={24} />
            </div>
            <CardTitle className='text-xl'>{t('Professional')}</CardTitle>
            <CardDescription className='text-sm font-medium text-amber-600'>
              {t('Strict & Fair')}
            </CardDescription>
          </CardHeader>
          <CardContent className='text-sm text-muted-foreground leading-relaxed'>
            {t(
              'Classic Zero-Sum ELO (K-32). Every point is earned. The true test of skill for competitive clubs and serious players.'
            )}
          </CardContent>
        </Card>

        <Card className='border-l-4 border-l-purple-500 hover:shadow-md transition-all'>
          <CardHeader>
            <div className='mb-4 w-12 h-12 bg-purple-500/10 rounded-2xl flex items-center justify-center text-purple-600'>
              <Gamepad2 size={24} />
            </div>
            <CardTitle className='text-xl'>{t('Arcade')}</CardTitle>
            <CardDescription className='text-sm font-medium text-purple-600'>
              {t('Just for Fun')}
            </CardDescription>
          </CardHeader>
          <CardContent className='text-sm text-muted-foreground leading-relaxed'>
            {t(
              'No ELO stress. Track wins, losses, and history without worrying about your rating. Pure gameplay for chill sessions.'
            )}
          </CardContent>
        </Card>
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
    <section className='mb-24'>
      <h2 className='text-3xl font-bold text-center mb-12'>
        {t('What sports can I track?')}
      </h2>
      <div className='grid grid-cols-1 md:grid-cols-3 gap-6'>
        {sports.map((s) => (
          <Card
            key={s.key}
            className='hover:shadow-xl hover:-translate-y-1 transition-all duration-300 group border-muted'
          >
            <CardHeader className='items-center text-center pt-10 pb-8'>
              <div className='relative h-24 w-24 mb-6 transform group-hover:scale-110 transition-transform duration-300 drop-shadow-md'>
                <Image
                  src={s.icon}
                  alt={s.name}
                  fill
                  className='object-contain'
                  sizes='96px'
                />
              </div>
              <CardTitle className='text-2xl'>{s.name}</CardTitle>
              <CardDescription className='mt-3 text-base'>
                {s.blurb}
              </CardDescription>
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
      <section className='mb-32 text-center pt-16'>
        <h1 className='text-5xl sm:text-6xl md:text-7xl font-black tracking-tighter mb-6'>
          <span className='bg-clip-text text-transparent bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-600'>
            Smashlog
          </span>
        </h1>
        <h2 className='text-2xl sm:text-3xl font-bold text-slate-800 dark:text-slate-200 mb-6'>
          {t('Track. Compete. Improve.')}
        </h2>
        <p className='max-w-2xl mx-auto text-lg md:text-xl text-muted-foreground leading-relaxed mb-10'>
          {t(
            'The ultimate multi-sport ELO tracker. Create leagues, join tournaments, and visualize your progress in Ping-Pong, Tennis, and Badminton.'
          )}
        </p>
        <div className='flex flex-col sm:flex-row gap-4 justify-center'>
          <Button
            size='lg'
            className='text-lg px-8 h-14 shadow-lg hover:shadow-xl transition-shadow'
            asChild
          >
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

      <GameModesShowcase />

      <SportsShowcase />

      <section className='mb-24'>
        <div className='text-center mb-12'>
          <h2 className='text-3xl font-bold'>{t('Everything you need')}</h2>
          <p className='text-muted-foreground mt-2 text-lg'>
            {t('Built for clubs, offices, and friendly rivalries.')}
          </p>
        </div>
        <div className='grid grid-cols-1 md:grid-cols-3 gap-8'>
          <FeatureCard
            icon={<BarChart2 size={32} />}
            title={t('Dual ELO System')}
          >
            {t(
              'Track your True Skill globally while enjoying seasonal progress in private rooms.'
            )}
          </FeatureCard>
          <FeatureCard icon={<Network size={32} />} title={t('Private Rooms')}>
            {t(
              'Create invite-only leagues for your office or club with custom rules and separate leaderboards.'
            )}
          </FeatureCard>
          <FeatureCard icon={<Trophy size={32} />} title={t('Tournaments')}>
            {t(
              'Organize brackets seamlessly. We handle the scheduling, score tracking, and rewards.'
            )}
          </FeatureCard>
        </div>
      </section>

      <section className='text-center pb-12'>
        <Card className='max-w-3xl mx-auto bg-gradient-to-br from-slate-900 to-slate-800 text-white border-none shadow-2xl overflow-hidden'>
          <CardHeader className='pt-12 pb-8'>
            <CardTitle className='text-3xl md:text-4xl font-bold'>
              {t('Ready to climb the ranks?')}
            </CardTitle>
            <CardDescription className='text-slate-300 text-lg mt-2'>
              {t('Join thousands of players tracking their matches today.')}
            </CardDescription>
          </CardHeader>
          <CardContent className='pb-12'>
            <Button
              size='lg'
              variant='secondary'
              className='w-full sm:w-auto font-bold text-lg h-14 px-10 shadow-lg hover:shadow-white/10'
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