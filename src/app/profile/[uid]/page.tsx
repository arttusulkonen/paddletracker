// src/app/profile/[uid]/page.tsx
'use client';

import { NewPlayerCard } from '@/components/profile/NewPlayerCard';
import { OverallStatsCard } from '@/components/profile/OverallStatsCard';
import { ProfileContent } from '@/components/profile/ProfileContent';
import { ProfileHeader } from '@/components/profile/ProfileHeader';
import { ProfileSidebar } from '@/components/profile/ProfileSidebar';
import {
  Card,
  CardContent,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui';
import { useAuth } from '@/contexts/AuthContext';
import { Sport, sportConfig } from '@/contexts/SportContext';
import { useToast } from '@/hooks/use-toast';
import { isAdmin } from '@/lib/config';
import { db } from '@/lib/firebase';
import * as Friends from '@/lib/friends';
import type { Match, UserProfile } from '@/lib/types';
import { parseFlexDate } from '@/lib/utils/date';
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
  const [viewedSport, setViewedSport] = useState<Sport | null>(null);

  const isSelf = targetUid === user?.uid;

  const playedSports = useMemo(() => {
    if (!targetProfile?.sports) return [];
    return (Object.keys(targetProfile.sports) as Sport[]).filter(
      (sport) =>
        (targetProfile.sports?.[sport]?.wins ?? 0) +
          (targetProfile.sports?.[sport]?.losses ?? 0) >
        0
    );
  }, [targetProfile]);

  useEffect(() => {
    if (targetProfile) {
      const defaultSport =
        targetProfile.activeSport &&
        playedSports.includes(targetProfile.activeSport)
          ? targetProfile.activeSport
          : playedSports[0] || null;
      setViewedSport(defaultSport);
    }
  }, [targetProfile, playedSports]);

  const hasPlayedAnyMatches = useMemo(
    () => playedSports.length > 0,
    [playedSports]
  );

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
        .sort((a, b) => {
          const dateA = parseFlexDate(
            a.tsIso ?? a.timestamp ?? a.createdAt ?? a.playedAt
          ).getTime();
          const dateB = parseFlexDate(
            b.tsIso ?? b.timestamp ?? b.createdAt ?? b.playedAt
          ).getTime();
          return dateB - dateA;
        });
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

  const { rank, medalSrc } = useMemo(() => {
    if (!viewedSport || !targetProfile?.sports?.[viewedSport]) {
      return { rank: null, medalSrc: null };
    }
    const sportElo = targetProfile.sports[viewedSport]?.globalElo ?? 1000;
    const calculatedRank = getRank(sportElo, t);
    const medalKey =
      Object.keys(medalMap).find((key) => t(key) === calculatedRank) ??
      'Ping-Pong Padawan';
    return { rank: calculatedRank, medalSrc: medalMap[medalKey] };
  }, [viewedSport, targetProfile, t]);

  const sportSpecificData = useMemo(() => {
    if (!viewedSport || !targetProfile) return null;

    const matches = matchesBySport[viewedSport] ?? [];
    const rankedMatches = matches.filter((match) => match.isRanked !== false);
    const stats = computeStats(rankedMatches, targetProfile.uid);
    const sideStats = computeSideStats(rankedMatches, targetProfile.uid);
    const monthlyData = groupByMonth(rankedMatches, targetProfile.uid);
    const insights = buildInsights(stats, sideStats, monthlyData, t);
    const oppStats = opponentStats(rankedMatches, targetProfile.uid);
    const tennisStats =
      viewedSport === 'tennis'
        ? computeTennisStats(
            rankedMatches,
            targetProfile.uid,
            targetProfile,
            'tennis'
          )
        : null;
    const sportProfile = targetProfile.sports?.[viewedSport];
    const opponents = Array.from(
      new Set(
        matches.map((m) =>
          m.player1Id === targetProfile.uid ? m.player2.name : m.player1.name
        )
      )
    ).map((name) => {
      const match = matches.find(
        (m) => m.player1.name === name || m.player2.name === name
      );
      const id =
        match?.player1.name === name ? match.player1Id : match?.player2Id;
      return { id: id!, name };
    });

    const pieData = [
      { name: t('Wins'), value: stats.wins, fill: 'hsl(var(--primary))' },
      {
        name: t('Losses'),
        value: stats.losses,
        fill: 'hsl(var(--destructive))',
      },
    ];
    const sidePieData = [
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
    ];
    const sidePieLossData = [
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
    ];
    const perfData =
      rankedMatches.length > 0
        ? rankedMatches
            .slice()
            .reverse()
            .map((m) => {
              const isP1 = m.player1Id === targetProfile.uid;
              const me = isP1 ? m.player1 : m.player2;
              const opp = isP1 ? m.player2 : m.player1;
              return {
                label: parseFlexDate(m.tsIso).toLocaleDateString(),
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
          ];

    return {
      stats,
      sideStats,
      matches,
      monthlyData,
      insights,
      oppStats,
      tennisStats,
      sportProfile,
      opponents,
      pieData,
      sidePieData,
      sidePieLossData,
      perfData,
    };
  }, [viewedSport, matchesBySport, targetProfile, t]);

  if (loading || !targetProfile) {
    return (
      <div className='flex items-center justify-center min-h-screen'>
        <div className='animate-spin h-16 w-16 rounded-full border-b-4 border-primary' />
      </div>
    );
  }

  return (
    <section className='container mx-auto py-8 space-y-8'>
      <ProfileHeader
        targetProfile={targetProfile}
        friendStatus={friendStatus}
        handleFriendAction={handleFriendAction}
        isSelf={isSelf}
        onUpdate={fetchProfileAndMatches}
        rank={rank}
        medalSrc={medalSrc}
      />

      <div className='grid grid-cols-1 lg:grid-cols-12 gap-8 items-start'>
        <div className='lg:col-span-8 xl:col-span-9 space-y-6'>
          {!hasPlayedAnyMatches ? (
            <NewPlayerCard isSelf={isSelf} playerName={targetProfile.name} />
          ) : (
            <>
              <OverallStatsCard profile={targetProfile} />
              {viewedSport && sportSpecificData && (
                <ProfileContent
                  key={viewedSport}
                  canViewProfile={
                    isAdmin(user?.uid) ||
                    !targetProfile.isPrivate ||
                    isSelf ||
                    friendStatus === 'friends'
                  }
                  sport={viewedSport}
                  playedSports={playedSports}
                  onSportChange={setViewedSport}
                  stats={sportSpecificData.stats}
                  sportProfile={sportSpecificData.sportProfile}
                  sideStats={sportSpecificData.sideStats}
                  matches={sportSpecificData.matches}
                  loadingMatches={loadingMatches}
                  meUid={targetProfile.uid}
                  config={sportConfig[viewedSport]}
                  oppStats={sportSpecificData.oppStats}
                  opponents={sportSpecificData.opponents}
                  targetProfile={targetProfile}
                  tennisStats={sportSpecificData.tennisStats}
                  achievements={targetProfile.achievements ?? []}
                  pieData={sportSpecificData.pieData}
                  sidePieData={sportSpecificData.sidePieData}
                  sidePieLossData={sportSpecificData.sidePieLossData}
                  insights={sportSpecificData.insights}
                  perfData={sportSpecificData.perfData}
                  monthlyData={sportSpecificData.monthlyData}
                />
              )}
            </>
          )}
        </div>

        <div className='lg:col-span-4 xl:col-span-3'>
          <ProfileSidebar
            canViewProfile={
              isAdmin(user?.uid) ||
              !targetProfile.isPrivate ||
              isSelf ||
              friendStatus === 'friends'
            }
            targetProfile={targetProfile}
          />
        </div>
      </div>
    </section>
  );
}
