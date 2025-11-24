// src/app/profile/[uid]/page.tsx
'use client';

import { NewPlayerCard } from '@/components/profile/NewPlayerCard';
import { OverallStatsCard } from '@/components/profile/OverallStatsCard';
import { ProfileContent } from '@/components/profile/ProfileContent';
import { ProfileHeader } from '@/components/profile/ProfileHeader';
import { ProfileSidebar } from '@/components/profile/ProfileSidebar';
import { CreateRoomDialog } from '@/components/rooms/CreateRoomDialog';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui';
import { useAuth } from '@/contexts/AuthContext';
import { Sport, sportConfig, useSport } from '@/contexts/SportContext';
import { useToast } from '@/hooks/use-toast';
import { db } from '@/lib/firebase';
import * as Friends from '@/lib/friends';
import type { Match, UserProfile } from '@/lib/types';
import { parseFlexDate } from '@/lib/utils/date';
import {
  buildInsights,
  computeSideStats,
  computeStats,
  computeTennisStats,
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
import { Lock, Rocket } from 'lucide-react'; // Добавлены иконки
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

type RoomsMap = Record<Sport, string[]>;

function chunk<T>(arr: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

async function loadAccessibleRooms(
  viewerUid: string | null
): Promise<RoomsMap> {
  const sports: Sport[] = ['pingpong', 'tennis', 'badminton'];
  const out: RoomsMap = { pingpong: [], tennis: [], badminton: [] };

  for (const s of sports) {
    const roomsColl = sportConfig[s].collections.rooms;

    const qPublic = query(
      collection(db, roomsColl),
      where('isPublic', '==', true)
    );
    const dPublic = await getDocs(qPublic);

    let dMember: any = null;
    if (viewerUid) {
      const qMember = query(
        collection(db, roomsColl),
        where('memberIds', 'array-contains', viewerUid)
      );
      dMember = await getDocs(qMember);
    }

    const ids = new Set<string>();
    dPublic.forEach((d) => ids.add(d.id));
    dMember?.forEach((d: any) => ids.add(d.id));

    out[s] = Array.from(ids);
  }
  return out;
}

export default function ProfileUidPage() {
  const { t } = useTranslation();
  const params = useParams();
  const rawUid = (params as any)?.uid as string | string[] | undefined;
  const targetUid = Array.isArray(rawUid) ? rawUid[0] : rawUid || '';
  const router = useRouter();
  const { user, userProfile: viewerProfile, isGlobalAdmin } = useAuth();
  const { sport: selectedSport } = useSport();
  const { toast } = useToast();

  const [targetProfile, setTargetProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [friendStatus, setFriendStatus] = useState<
    'none' | 'outgoing' | 'incoming' | 'friends'
  >('none');
  const [matchesBySport, setMatchesBySport] = useState<Record<Sport, Match[]>>({
    pingpong: [],
    tennis: [],
    badminton: [],
  });
  const [loadingMatches, setLoadingMatches] = useState(true);
  const [viewedSport, setViewedSport] = useState<Sport | null>(null);

  const isSelf = targetUid && user?.uid && targetUid === user.uid;

  const playedSports = useMemo(() => {
    if (!targetProfile?.sports) return [];
    return (Object.keys(targetProfile.sports) as Sport[]).filter(
      (s) =>
        (targetProfile.sports?.[s]?.wins ?? 0) +
          (targetProfile.sports?.[s]?.losses ?? 0) >
        0
    );
  }, [targetProfile]);

  const canView =
    isGlobalAdmin ||
    isSelf ||
    (targetProfile?.isPublic ?? true) ||
    friendStatus === 'friends';

  // Гарантируем, что viewedSport всегда проставится
  useEffect(() => {
    if (!targetProfile) return;
    const fromCtx = selectedSport as Sport | undefined;
    const fromProfile =
      (targetProfile.activeSport as Sport | undefined) || undefined;
    const firstPlayed = playedSports[0];
    setViewedSport(fromCtx || fromProfile || firstPlayed || 'pingpong');
  }, [targetProfile, selectedSport, playedSports]);

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const fetchProfileAndMatches = useCallback(async () => {
    if (!targetUid) {
      setLoading(false);
      setLoadingMatches(false);
      return;
    }

    setLoading(true);
    setLoadingMatches(true);

    try {
      const snap = await getDoc(doc(db, 'users', targetUid));
      if (!mountedRef.current) return;

      if (!snap.exists() || (snap.data() as any)?.isDeleted) {
        toast({ title: t('Profile not found'), variant: 'destructive' });
        router.push('/');
        return;
      }

      const profileData = { uid: targetUid, ...(snap.data() as UserProfile) };
      setTargetProfile(profileData);

      const allMatches: Record<Sport, Match[]> = {
        pingpong: [],
        tennis: [],
        badminton: [],
      };

      const sportsToFetch: Sport[] = profileData.sports
        ? (Object.keys(profileData.sports) as Sport[])
        : [];

      const canFetchAll = isGlobalAdmin || isSelf;

      const accessibleRooms = canFetchAll
        ? null
        : await loadAccessibleRooms(user?.uid ?? null);
      if (!mountedRef.current) return;

      for (const s of sportsToFetch) {
        const mColl = sportConfig[s].collections.matches;
        let collected: Match[] = [];

        if (canFetchAll) {
          const qAll = query(
            collection(db, mColl),
            where('players', 'array-contains', targetUid)
          );
          const dsAll = await getDocs(qAll);
          if (!mountedRef.current) return;

          collected = dsAll.docs.map(
            (d) => ({ id: d.id, ...(d.data() as any) } as Match)
          );
        } else {
          const roomIds = accessibleRooms?.[s] ?? [];
          if (roomIds.length === 0) {
            allMatches[s] = [];
            continue;
          }
          for (const chunkIds of chunk(roomIds, 10)) {
            const qPart = query(
              collection(db, mColl),
              where('players', 'array-contains', targetUid),
              where('roomId', 'in', chunkIds)
            );
            const dsPart = await getDocs(qPart);
            if (!mountedRef.current) return;

            collected = collected.concat(
              dsPart.docs.map(
                (d) => ({ id: d.id, ...(d.data() as any) } as Match)
              )
            );
          }
        }

        collected.sort((a, b) => {
          const dateA = parseFlexDate(
            a.tsIso ?? a.timestamp ?? a.createdAt ?? (a as any).playedAt
          ).getTime();
          const dateB = parseFlexDate(
            b.tsIso ?? b.timestamp ?? b.createdAt ?? (b as any).playedAt
          ).getTime();
          return dateB - dateA;
        });

        allMatches[s] = collected;
      }

      if (!mountedRef.current) return;
      setMatchesBySport(allMatches);
    } catch (e) {
      console.error('Failed to load profile/matches', e);
      toast({
        title: t('Error'),
        description: t('Failed to load profile data. Please try again.'),
        variant: 'destructive',
      });
    } finally {
      if (!mountedRef.current) return;
      setLoading(false);
      setLoadingMatches(false);
    }
  }, [targetUid, router, t, toast, isGlobalAdmin, isSelf, user?.uid]);

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
    } catch {
      toast({
        title: t('Error'),
        description: t('Something went wrong'),
        variant: 'destructive',
      });
    }
  };

  const { rankLabel, medalSrc } = useMemo(() => {
    if (!viewedSport || !targetProfile?.sports?.[viewedSport]) {
      return {
        rankLabel: null as string | null,
        medalSrc: null as string | null,
      };
    }
    const elo = targetProfile.sports[viewedSport]?.globalElo ?? 1000;

    const key =
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

    return { rankLabel: t(key), medalSrc: medalMap[key] };
  }, [viewedSport, targetProfile, t]);

  const sportSpecificData = useMemo(() => {
    if (!viewedSport || !targetProfile) return null;
    const matches = matchesBySport[viewedSport] ?? [];
    const rankedMatches = matches.filter((match) => match.isRanked !== false);
    const stats = computeStats(rankedMatches, targetProfile.uid);
    const sideStats =
      viewedSport === 'tennis'
        ? {
            leftSideWins: 0,
            leftSideLosses: 0,
            rightSideWins: 0,
            rightSideLosses: 0,
          }
        : computeSideStats(rankedMatches, targetProfile.uid);
    const monthlyData = groupByMonth(rankedMatches, targetProfile.uid);

    // Исправленный вызов buildInsights: передаем все аргументы в правильном порядке
    const insights = buildInsights(
      rankedMatches,
      targetProfile.uid,
      stats,
      sideStats,
      monthlyData,
      t
    );

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

    const opponentsMap = new Map<string, string>();
    for (const m of matches) {
      const isP1 = m.player1Id === targetProfile.uid;
      const oppId = isP1 ? m.player2Id : m.player1Id;
      const oppName = isP1 ? m.player2.name : m.player1.name;
      if (oppId && !opponentsMap.has(oppId)) opponentsMap.set(oppId, oppName);
    }
    const opponents = Array.from(opponentsMap, ([id, name]) => ({ id, name }));

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
              const d = parseFlexDate(
                m.tsIso ?? m.timestamp ?? m.createdAt ?? (m as any).playedAt
              );
              return {
                label: d.toLocaleDateString(),
                ts: d.getTime(),
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
              ts: Date.now(),
              rating: sportProfile?.globalElo ?? 1000,
              diff: 0,
              result: 0 as 0,
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

  const hasMatchesInViewed = useMemo(() => {
    if (!viewedSport) return false;
    return (matchesBySport[viewedSport]?.length ?? 0) > 0;
  }, [viewedSport, matchesBySport]);

  if (loading || !targetProfile) {
    return (
      <div className='flex items-center justify-center min-h-screen'>
        <div className='animate-spin h-16 w-16 rounded-full border-b-4 border-primary' />
      </div>
    );
  }

  const sportKeyForEmpty = viewedSport ?? selectedSport ?? 'pingpong';
  const emptySelfTitle = t('No matches yet in {{sport}}', {
    sport: sportConfig[sportKeyForEmpty as Sport].name,
  });
  const emptySelfDesc = t(
    'Browse available rooms for this sport or create your own and start collecting stats!'
  );
  const emptyOtherTitle = t('This player has no matches in {{sport}}', {
    sport: sportConfig[sportKeyForEmpty as Sport].name,
  });
  const emptyOtherDesc = t('Invite them to a room and start playing together!');

  return (
    <section className='container mx-auto py-8 space-y-8 animate-in fade-in duration-500'>
      <ProfileHeader
        targetProfile={targetProfile}
        friendStatus={friendStatus}
        handleFriendAction={handleFriendAction}
        isSelf={!!isSelf}
        onUpdate={fetchProfileAndMatches}
        rank={rankLabel}
        medalSrc={medalSrc}
      />
      <div className='grid grid-cols-1 lg:grid-cols-12 gap-8 items-start'>
        <div className='lg:col-span-8 xl:col-span-9 space-y-6'>
          {playedSports.length === 0 ? (
            <NewPlayerCard
              isSelf={!!isSelf}
              playerName={
                targetProfile.displayName ??
                targetProfile.name ??
                t('Unknown Player')
              }
            />
          ) : (
            <>
              <OverallStatsCard profile={targetProfile} />
              {viewedSport &&
              canView &&
              hasMatchesInViewed &&
              sportSpecificData ? (
                <ProfileContent
                  key={viewedSport}
                  canViewProfile={canView}
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
              ) : (
                <Card className='border-dashed'>
                  <CardContent className='py-12 flex flex-col items-center justify-center text-center'>
                    <div className='bg-muted rounded-full p-4 mb-4'>
                      <Rocket className='h-8 w-8 text-muted-foreground' />
                    </div>
                    <h3 className='text-xl font-semibold'>
                      {isSelf ? emptySelfTitle : emptyOtherTitle}
                    </h3>
                    <p className='text-muted-foreground mt-2 max-w-sm mx-auto'>
                      {isSelf ? emptySelfDesc : emptyOtherDesc}
                    </p>
                    {isSelf && (
                      <div className='flex gap-3 mt-6'>
                        <Button asChild>
                          <Link href='/rooms'>{t('Browse Rooms')}</Link>
                        </Button>
                        <CreateRoomDialog onSuccess={fetchProfileAndMatches} />
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </div>
        <div className='lg:col-span-4 xl:col-span-3'>
          {/* Private Profile Message for Sidebar */}
          {!canView && (
            <Card>
              <CardContent className='py-8 flex flex-col items-center text-center text-muted-foreground'>
                <Lock className='h-10 w-10 mb-3 opacity-50' />
                <p>{t('Stats are hidden')}</p>
              </CardContent>
            </Card>
          )}
          <ProfileSidebar
            canViewProfile={canView}
            targetProfile={targetProfile}
          />
        </div>
      </div>
    </section>
  );
}
