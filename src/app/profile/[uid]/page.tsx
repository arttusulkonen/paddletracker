// src/app/profile/[uid]/page.tsx
'use client';

import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useAuth } from '@/contexts/AuthContext';
import { useSport } from '@/contexts/SportContext';
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

// Новые дочерние компоненты
import { ProfileContent } from '@/components/profile/ProfileContent';
import { ProfileHeader } from '@/components/profile/ProfileHeader';

// --- Основной компонент страницы ---
export default function ProfileUidPage() {
  const { t } = useTranslation();
  const { uid: targetUid } = useParams<{ uid: string }>();
  const router = useRouter();
  const { user, userProfile } = useAuth();
  const { sport, config, loading: sportLoading } = useSport();
  const { toast } = useToast();

  const [targetProfile, setTargetProfile] = useState<UserProfile | null>(null);
  const [friendStatus, setFriendStatus] = useState<
    'none' | 'outgoing' | 'incoming' | 'friends'
  >('none');
  const [allMatches, setAllMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [oppFilter, setOppFilter] = useState('all');

  const isSelf = targetUid === user?.uid;
  const sportProfile = targetProfile?.sports?.[sport];

  const fetchProfileData = useCallback(async () => {
    if (!targetUid) return;
    setLoading(true);
    const snap = await getDoc(doc(db, 'users', targetUid));
    if (!snap.exists() || snap.data()?.isDeleted) {
      toast({ title: t('Profile not found'), variant: 'destructive' });
      router.push('/');
      return;
    }
    setTargetProfile({ uid: targetUid, ...(snap.data() as UserProfile) });
  }, [targetUid, router, t, toast]);

  const loadMatches = useCallback(async () => {
    if (!targetUid || !config) return;
    const matchesCollectionName = config.collections.matches;
    const matchesRef = collection(db, matchesCollectionName);
    const q = query(matchesRef, where('players', 'array-contains', targetUid));
    const snapshot = await getDocs(q);
    const rows: Match[] = snapshot.docs.map(
      (d) => ({ id: d.id, ...d.data() } as Match)
    );
    rows.sort(
      (a, b) =>
        parseFlexDate(b.tsIso).getTime() - parseFlexDate(a.tsIso).getTime()
    );
    setAllMatches(rows);
    setLoading(false);
  }, [targetUid, config]);

  useEffect(() => {
    fetchProfileData();
  }, [fetchProfileData]);
  useEffect(() => {
    if (targetProfile && config) {
      loadMatches();
    }
  }, [targetProfile, config, loadMatches]);

  useEffect(() => {
    if (user && userProfile && !isSelf && targetUid) {
      if (userProfile.friends?.includes(targetUid)) setFriendStatus('friends');
      else if (userProfile.outgoingRequests?.includes(targetUid))
        setFriendStatus('outgoing');
      else if (userProfile.incomingRequests?.includes(targetUid))
        setFriendStatus('incoming');
      else setFriendStatus('none');
    }
  }, [user, userProfile, targetUid, isSelf]);

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

  const filteredMatches = useMemo(
    () =>
      oppFilter === 'all'
        ? allMatches
        : allMatches.filter(
            (m) => m.player1Id === oppFilter || m.player2Id === oppFilter
          ),
    [allMatches, oppFilter]
  );
  const rankedMatches = useMemo(
    () => filteredMatches.filter((match) => match.isRanked !== false),
    [filteredMatches]
  );

  const stats = useMemo(
    () => computeStats(rankedMatches, targetUid),
    [rankedMatches, targetUid]
  );
  const sideStats = useMemo(
    () => computeSideStats(rankedMatches, targetUid),
    [rankedMatches, targetUid]
  );
  const monthlyData = useMemo(
    () => groupByMonth(rankedMatches, targetUid),
    [rankedMatches, targetUid]
  );
  const insights = useMemo(
    () => buildInsights(stats, sideStats, monthlyData, t),
    [stats, sideStats, monthlyData, t]
  );
  const oppStats = useMemo(
    () => opponentStats(rankedMatches, targetUid),
    [rankedMatches, targetUid]
  );
  const tennisStats = useMemo(() => {
    if (sport === 'tennis') {
      return computeTennisStats(rankedMatches, targetUid, targetProfile, sport);
    }
    return null;
  }, [rankedMatches, targetUid, targetProfile, sport]);

  const perfData = useMemo(
    () =>
      rankedMatches.length
        ? rankedMatches
            .slice()
            .reverse()
            .map((m) => {
              const isP1 = m.player1Id === targetUid;
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
    [rankedMatches, targetUid, sportProfile]
  );

  const opponents = useMemo(() => {
    const m = new Map<string, string>();
    allMatches.forEach((match) => {
      const isP1 = match.player1Id === targetUid;
      m.set(
        isP1 ? match.player2Id : match.player1Id,
        isP1 ? match.player2.name : match.player1.name
      );
    });
    return Array.from(m.entries()).map(([id, name]) => ({ id, name }));
  }, [allMatches, targetUid]);

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

  if (loading || sportLoading || !targetProfile || !config) {
    return (
      <div className='flex items-center justify-center min-h-screen'>
        <div className='animate-spin h-16 w-16 rounded-full border-b-4 border-primary' />
      </div>
    );
  }

  const rank = getRank(sportProfile?.globalElo ?? 1000, t);
  const medalKey =
    Object.keys(medalMap).find((key) => t(key) === rank) ?? 'Ping-Pong Padawan';
  const medalSrc = medalMap[medalKey];

  return (
    <section className='container mx-auto py-8 space-y-8'>
      <ProfileHeader
        targetProfile={targetProfile}
        friendStatus={friendStatus}
        handleFriendAction={handleFriendAction}
        isSelf={isSelf}
        rank={rank}
        medalSrc={medalSrc}
        onUpdate={fetchProfileData}
      />
      <ProfileContent
        canViewProfile={
          targetProfile.isPublic || friendStatus === 'friends' || isSelf
        }
        stats={stats}
        sportProfile={sportProfile}
        sideStats={sideStats}
        pieData={pieData}
        sidePieData={sidePieData}
        sidePieLossData={sidePieLossData}
        insights={insights}
        perfData={perfData}
        monthlyData={monthlyData}
        opponents={opponents}
        oppFilter={oppFilter}
        setOppFilter={setOppFilter}
        filteredMatches={filteredMatches}
        loadingMatches={loading}
        meUid={targetUid}
        config={config}
        oppStats={oppStats}
        targetProfile={targetProfile}
        tennisStats={tennisStats}
      />
    </section>
  );
}
