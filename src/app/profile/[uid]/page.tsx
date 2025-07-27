// src/app/profile/[uid]/page.tsx
'use client';

import { NewPlayerCard } from '@/components/profile/NewPlayerCard';
import { OverallStatsCard } from '@/components/profile/OverallStatsCard';
import { ProfileContent } from '@/components/profile/ProfileContent';
import { ProfileHeader } from '@/components/profile/ProfileHeader';
import { ProfileSidebar } from '@/components/profile/ProfileSidebar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui';
import { useAuth } from '@/contexts/AuthContext';
import { Sport, sportConfig } from '@/contexts/SportContext';
import { useToast } from '@/hooks/use-toast';
import { db } from '@/lib/firebase';
import * as Friends from '@/lib/friends';
import type { Match, UserProfile } from '@/lib/types';
import { parseFlexDate, safeFormatDate } from '@/lib/utils/date';
import {
  buildInsights,
  computeSideStats,
  computeStats,
  computeTennisStats,
  getRank,
  groupByMonth,
  medalMap,
  opponentStats,
} from '@/lib/utils/profileUtils';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
} from 'firebase/firestore';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

export default function ProfileUidPage() {
  const { t } = useTranslation();
  const { uid: targetUid } = useParams<{ uid: string }>();
  const router = useRouter();
  const { user, userProfile: viewerProfile } = useAuth();
  const { toast } = useToast();

  // Состояния
  const [targetProfile, setTargetProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [friendStatus, setFriendStatus] = useState<
    'none' | 'outgoing' | 'incoming' | 'friends'
  >('none');
  const [matchesBySport, setMatchesBySport] = useState<Record<Sport, Match[]>>({
    pingpong: [],
    tennis: [],
  });
  const [loadingMatches, setLoadingMatches] = useState(true);

  const isSelf = targetUid === user?.uid;

  const playedSports = useMemo(
    () =>
      targetProfile?.sports
        ? (Object.keys(targetProfile.sports) as Sport[])
        : [],
    [targetProfile]
  );

  const hasPlayedAnyMatches = useMemo(
    () =>
      playedSports.some(
        (sport) =>
          (targetProfile?.sports?.[sport]?.wins ?? 0) +
            (targetProfile?.sports?.[sport]?.losses ?? 0) >
          0
      ),
    [targetProfile, playedSports]
  );

  // Загрузка данных
  const fetchProfileAndMatches = useCallback(async () => {
    if (!targetUid) return;
    setLoading(true);

    const snap = await getDoc(doc(db, 'users', targetUid));
    if (!snap.exists() || snap.data()?.isDeleted) {
      toast({ title: t('Profile not found'), variant: 'destructive' });
      router.push('/');
      return;
    }
    const profileData = { uid: targetUid, ...(snap.data() as UserProfile) };
    setTargetProfile(profileData);

    const played = profileData.sports
      ? (Object.keys(profileData.sports) as Sport[])
      : [];
    const allMatches: Record<string, Match[]> = {};

    setLoadingMatches(true);
    for (const sport of played) {
      const config = sportConfig[sport];
      const q = query(
        collection(db, config.collections.matches),
        where('players', 'array-contains', targetUid)
      );
      const matchSnap = await getDocs(q);
      allMatches[sport] = matchSnap.docs
        .map((d) => ({ id: d.id, ...d.data() } as Match))
        .sort(
          (a, b) =>
            parseFlexDate(b.tsIso).getTime() - parseFlexDate(a.tsIso).getTime()
        );
    }
    setMatchesBySport(allMatches as Record<Sport, Match[]>);

    setLoading(false);
    setLoadingMatches(false);
  }, [targetUid, router, t, toast]);

  useEffect(() => {
    fetchProfileAndMatches();
  }, [fetchProfileAndMatches]);

  useEffect(() => {
    if (user && viewerProfile && !isSelf && targetUid) {
      if (viewerProfile.friends?.includes(targetUid))
        setFriendStatus('friends');
      else if (viewerProfile.outgoingRequests?.includes(targetUid))
        setFriendStatus('outgoing');
      else if (viewerProfile.incomingRequests?.includes(targetUid))
        setFriendStatus('incoming');
      else setFriendStatus('none');
    }
  }, [user, viewerProfile, targetUid, isSelf]);

  const handleFriendAction = async (
    action: 'add' | 'cancel' | 'accept' | 'remove'
  ) => {
    if (!user) return;
    try {
      const actions = {
        add: () =>
          Friends.sendFriendRequest(user.uid, targetUid).then(() =>
            setFriendStatus('outgoing')
          ),
        cancel: () =>
          Friends.cancelRequest(user.uid, targetUid).then(() =>
            setFriendStatus('none')
          ),
        accept: () =>
          Friends.acceptRequest(user.uid, targetUid).then(() =>
            setFriendStatus('friends')
          ),
        remove: () =>
          Friends.unfriend(user.uid, targetUid).then(() =>
            setFriendStatus('none')
          ),
      };
      await actions[action]();
      toast({ title: t('Success!') });
    } catch (error) {
      toast({
        title: t('Error'),
        description: t('Something went wrong'),
        variant: 'destructive',
      });
    }
  };

  if (loading || !targetProfile) {
    return (
      <div className='flex items-center justify-center min-h-screen'>
        <div className='animate-spin h-16 w-16 rounded-full border-b-4 border-primary' />
      </div>
    );
  }

  const rank = getRank(targetProfile.globalElo ?? 1000, t);
  const medalKey =
    Object.keys(medalMap).find((key) => t(key) === rank) ?? 'Ping-Pong Padawan';

  return (
    <section className='container mx-auto py-8 space-y-8'>
      <ProfileHeader
        targetProfile={targetProfile}
        friendStatus={friendStatus}
        handleFriendAction={handleFriendAction}
        isSelf={isSelf}
        onUpdate={fetchProfileAndMatches}
        rank={rank}
        medalSrc={medalMap[medalKey]}
      />

      <div className='grid grid-cols-1 lg:grid-cols-12 gap-8 items-start'>
        {/* === Основной контент (Статистика) === */}
        <div className='lg:col-span-8 xl:col-span-9 space-y-6'>
          {!hasPlayedAnyMatches ? (
            <NewPlayerCard isSelf={isSelf} playerName={targetProfile.name} />
          ) : (
            <ProfileStatsTabs
              profile={targetProfile}
              matchesBySport={matchesBySport}
              loading={loadingMatches}
              isSelf={isSelf}
            />
          )}
        </div>

        {/* === Сайдбар (Друзья, Комнаты) === */}
        <div className='lg:col-span-4 xl:col-span-3'>
          <ProfileSidebar targetProfile={targetProfile} />
        </div>
      </div>
    </section>
  );
}

// ... (остальной код файла без изменений) ...

function ProfileStatsTabs({
  profile,
  matchesBySport,
  loading,
  isSelf,
}: {
  profile: UserProfile;
  matchesBySport: Record<Sport, Match[]>;
  loading: boolean;
  isSelf: boolean;
}) {
  const { t } = useTranslation();
  const { userProfile: viewerProfile } = useAuth();
  const playedSports = useMemo(
    () => (profile.sports ? (Object.keys(profile.sports) as Sport[]) : []),
    [profile]
  );
  const [viewedSport, setViewedSport] = useState<Sport | 'overview'>(
    playedSports.length > 0 ? 'overview' : playedSports[0] || 'overview'
  );
  const [oppFilter, setOppFilter] = useState('all');

  const matches = matchesBySport[viewedSport as Sport] ?? [];

  const filteredMatches = useMemo(
    () =>
      oppFilter === 'all'
        ? matches
        : matches.filter(
            (m) => m.player1Id === oppFilter || m.player2Id === oppFilter
          ),
    [matches, oppFilter]
  );
  const rankedMatches = useMemo(
    () => filteredMatches.filter((match) => match.isRanked !== false),
    [filteredMatches]
  );
  const stats = useMemo(
    () => computeStats(rankedMatches, profile.uid),
    [rankedMatches, profile.uid]
  );
  const sideStats = useMemo(
    () => computeSideStats(rankedMatches, profile.uid),
    [rankedMatches, profile.uid]
  );
  const monthlyData = useMemo(
    () => groupByMonth(rankedMatches, profile.uid),
    [rankedMatches, profile.uid]
  );
  const insights = useMemo(
    () => buildInsights(stats, sideStats, monthlyData, t),
    [stats, sideStats, monthlyData, t]
  );
  const oppStats = useMemo(
    () => opponentStats(rankedMatches, profile.uid),
    [rankedMatches, profile.uid]
  );
  const tennisStats = useMemo(
    () =>
      viewedSport === 'tennis'
        ? computeTennisStats(rankedMatches, profile.uid, profile, 'tennis')
        : null,
    [rankedMatches, profile.uid, profile, viewedSport]
  );
  const sportProfile = profile.sports?.[viewedSport as Sport];

  const opponents = useMemo(() => {
    const m = new Map<string, string>();
    matches.forEach((match) => {
      const isP1 = match.player1Id === profile.uid;
      m.set(
        isP1 ? match.player2Id : match.player1Id,
        isP1 ? match.player2.name : match.player1.name
      );
    });
    return Array.from(m.entries()).map(([id, name]) => ({ id, name }));
  }, [matches, profile.uid]);

  const pieData = useMemo(
    () => [
      { name: t('Wins'), value: stats.wins, fill: 'hsl(var(--primary))' },
      {
        name: t('Losses'),
        value: stats.losses,
        fill: 'hsl(var(--destructive))',
      },
    ],
    [stats, t]
  );
  const sidePieData = useMemo(
    () => [
      {
        name: t('Left Wins'),
        value: sideStats.leftSideWins,
        fill: 'hsl(var(--primary))',
      },
      {
        name: t('Right Wins'),
        value: sideStats.rightSideWins,
        fill: 'hsl(var(--accent))',
      },
    ],
    [sideStats, t]
  );
  const sidePieLossData = useMemo(
    () => [
      {
        name: t('Left Losses'),
        value: sideStats.leftSideLosses,
        fill: 'hsl(var(--destructive))',
      },
      {
        name: t('Right Losses'),
        value: sideStats.rightSideLosses,
        fill: 'hsl(var(--muted))',
      },
    ],
    [sideStats, t]
  );

  const perfData = useMemo(
    () =>
      rankedMatches.length > 0
        ? rankedMatches
            .slice()
            .reverse()
            .map((m) => {
              const isP1 = m.player1Id === profile.uid;
              const me = isP1 ? m.player1 : m.player2;
              const opp = isP1 ? m.player2 : m.player1;
              return {
                label: safeFormatDate(m.tsIso, 'dd.MM.yy'),
                rating: me.newRating,
                diff: me.scores - opp.scores,
                result: me.scores > opp.scores ? 1 : -1,
                opponent: opp.name,
                score: `${me.scores}–${opp.scores}`,
                addedPoints: me.addedPoints,
              };
            })
        : [
            {
              label: 'Start',
              rating: sportProfile?.globalElo ?? 1000,
              diff: 0,
              result: 0,
              opponent: '',
              score: '',
              addedPoints: 0,
            },
          ],
    [rankedMatches, profile.uid, sportProfile]
  );

  return (
    <Tabs value={viewedSport} onValueChange={(v) => setViewedSport(v as any)}>
      <TabsList
        className={`grid w-full grid-cols-${
          playedSports.length > 0 ? playedSports.length + 1 : 1
        }`}
      >
        <TabsTrigger value='overview'>{t('Overview')}</TabsTrigger>
        {playedSports.map((sport) => (
          <TabsTrigger key={sport} value={sport}>
            {sportConfig[sport].name}
          </TabsTrigger>
        ))}
      </TabsList>
      <TabsContent value='overview' className='mt-6'>
        <OverallStatsCard profile={profile} />
      </TabsContent>
      {playedSports.map((sport) => (
        <TabsContent key={sport} value={sport} className='mt-6'>
          {viewedSport === sport && (
            <ProfileContent
              canViewProfile={profile.isPublic || isSelf}
              stats={stats}
              sportProfile={sportProfile}
              sideStats={sideStats}
              matches={filteredMatches}
              loadingMatches={loading}
              meUid={profile.uid}
              config={sportConfig[sport]}
              oppStats={oppStats}
              opponents={opponents}
              oppFilter={oppFilter}
              setOppFilter={setOppFilter}
              targetProfile={profile}
              tennisStats={tennisStats}
              achievements={profile.achievements ?? []}
              sport={sport}
              pieData={pieData}
              sidePieData={sidePieData}
              sidePieLossData={sidePieLossData}
              insights={insights}
              perfData={perfData}
              monthlyData={monthlyData}
            />
          )}
        </TabsContent>
      ))}
    </Tabs>
  );
}
