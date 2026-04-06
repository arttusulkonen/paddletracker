// src/app/profile/[uid]/page.tsx
'use client';

import { CoachDashboard } from '@/components/profile/CoachDashboard';
import { GarminLinkDialog } from '@/components/profile/GarminLinkDialog';
import { NewPlayerCard } from '@/components/profile/NewPlayerCard';
import { ProfileContent } from '@/components/profile/ProfileContent';
import { ProfileHeader } from '@/components/profile/ProfileHeader';
import { ProfileSidebar } from '@/components/profile/ProfileSidebar';
import { CreateRoomDialog } from '@/components/rooms/CreateRoomDialog';
import { Button, Card, CardContent } from '@/components/ui';
import { useAuth } from '@/contexts/AuthContext';
import { Sport, sportConfig, useSport } from '@/contexts/SportContext';
import { useToast } from '@/hooks/use-toast';
import { db } from '@/lib/firebase';
import * as Friends from '@/lib/friends';
import type { Match, UserProfile } from '@/lib/types';
import { parseFlexDate } from '@/lib/utils/date';
import { computeTennisStats, medalMap } from '@/lib/utils/profileUtils';
import {
	collection,
	doc,
	getDoc,
	getDocs,
	query,
	where,
} from 'firebase/firestore';
import { Rocket } from 'lucide-react';
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
  viewerUid: string | null,
): Promise<RoomsMap> {
  const sports: Sport[] = ['pingpong', 'tennis', 'badminton'];
  const out: RoomsMap = { pingpong: [], tennis: [], badminton: [] };
  if (!db) return out;

  for (const s of sports) {
    const roomsColl = sportConfig[s].collections.rooms;
    const qPublic = query(
      collection(db, roomsColl),
      where('isPublic', '==', true),
    );
    const dPublic = await getDocs(qPublic);

    let dMember: any = null;
    if (viewerUid) {
      const qMember = query(
        collection(db, roomsColl),
        where('memberIds', 'array-contains', viewerUid),
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
  const targetUid = (params?.uid as string) || '';
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
  const isCoachProfile =
    targetProfile?.accountType === 'coach' ||
    targetProfile?.roles?.includes('coach');
  const playedSports = useMemo(() => {
    if (!targetProfile?.sports) return [];
    return (Object.keys(targetProfile.sports) as Sport[]).filter(
      (s) =>
        (targetProfile.sports?.[s]?.wins ?? 0) +
          (targetProfile.sports?.[s]?.losses ?? 0) >
        0,
    );
  }, [targetProfile]);

  const isManager = targetProfile?.managedBy === user?.uid;
  const canView =
    isGlobalAdmin ||
    isSelf ||
    isManager ||
    (targetProfile?.isPublic ?? true) ||
    friendStatus === 'friends';

  useEffect(() => {
    if (!targetProfile) return;
    setViewedSport(
      selectedSport ||
        targetProfile.activeSport ||
        playedSports[0] ||
        'pingpong',
    );
  }, [targetProfile, selectedSport, playedSports]);

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const fetchProfileAndMatches = useCallback(async () => {
    if (!targetUid || !db) {
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

      const profileData: UserProfile = {
        uid: targetUid,
        ...(snap.data() as any),
      };
      setTargetProfile(profileData);

      const allMatches: Record<Sport, Match[]> = {
        pingpong: [],
        tennis: [],
        badminton: [],
      };
      const sportsToFetch: Sport[] = profileData.sports
        ? (Object.keys(profileData.sports) as Sport[])
        : [];
      const accessibleRooms =
        isGlobalAdmin || isSelf || profileData.managedBy === user?.uid
          ? null
          : await loadAccessibleRooms(user?.uid ?? null);

      for (const s of sportsToFetch) {
        const mColl = sportConfig[s].collections.matches;
        let collected: Match[] = [];

        if (!accessibleRooms) {
          const qAll = query(
            collection(db, mColl),
            where('players', 'array-contains', targetUid),
          );
          const dsAll = await getDocs(qAll);
          collected = dsAll.docs.map(
            (d) => ({ id: d.id, ...d.data() }) as Match,
          );
        } else {
          const roomIds = accessibleRooms[s] || [];
          for (const chunkIds of chunk(roomIds, 10)) {
            const qPart = query(
              collection(db, mColl),
              where('players', 'array-contains', targetUid),
              where('roomId', 'in', chunkIds),
            );
            const dsPart = await getDocs(qPart);
            collected = collected.concat(
              dsPart.docs.map((d) => ({ id: d.id, ...d.data() }) as Match),
            );
          }
        }
        collected.sort(
          (a, b) =>
            parseFlexDate(b.tsIso || b.timestamp).getTime() -
            parseFlexDate(a.tsIso || a.timestamp).getTime(),
        );
        allMatches[s] = collected;
      }

      if (mountedRef.current) setMatchesBySport(allMatches);
    } catch (e) {
      console.error(e);
    } finally {
      if (mountedRef.current) {
        setLoading(false);
        setLoadingMatches(false);
      }
    }
  }, [targetUid, router, t, isGlobalAdmin, isSelf, user?.uid, toast]);

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
    action: 'add' | 'cancel' | 'accept' | 'remove',
  ) => {
    if (!user) return;
    const actions = {
      add: () =>
        Friends.sendFriendRequest(user.uid, targetUid).then(() =>
          setFriendStatus('outgoing'),
        ),
      cancel: () =>
        Friends.cancelRequest(user.uid, targetUid).then(() =>
          setFriendStatus('none'),
        ),
      accept: () =>
        Friends.acceptRequest(user.uid, targetUid).then(() =>
          setFriendStatus('friends'),
        ),
      remove: () =>
        Friends.unfriend(user.uid, targetUid).then(() =>
          setFriendStatus('none'),
        ),
    };
    await actions[action]();
  };

  const sportSpecificData = useMemo(() => {
    if (!viewedSport || !targetProfile) return null;
    const matches = matchesBySport[viewedSport] ?? [];
    const rankedMatches = matches.filter((m) => m.isRanked !== false);
    const sportProfile = targetProfile.sports?.[viewedSport];
    const tennisStats =
      viewedSport === 'tennis'
        ? computeTennisStats(
            rankedMatches,
            targetProfile.uid,
            targetProfile,
            'tennis',
          )
        : null;

    const opponentsMap = new Map<string, string>();
    matches.forEach((m) => {
      const isP1 = m.player1Id === targetProfile.uid;
      const oppId = isP1 ? m.player2Id : m.player1Id;
      const oppName = isP1 ? m.player2.name : m.player1.name;
      if (oppId) opponentsMap.set(oppId, oppName);
    });

    const perfData =
      rankedMatches.length > 0
        ? rankedMatches
            .slice()
            .reverse()
            .map((m) => {
              const isP1 = m.player1Id === targetProfile.uid;
              const me = isP1 ? m.player1 : m.player2;
              const opp = isP1 ? m.player2 : m.player1;
              const d = parseFlexDate(m.tsIso || m.timestamp);
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
              result: 0 as const,
              opponent: '',
              score: '',
              addedPoints: 0,
            },
          ];

    return {
      matches,
      tennisStats,
      sportProfile,
      opponents: Array.from(opponentsMap, ([id, name]) => ({ id, name })),
      perfData,
    };
  }, [viewedSport, matchesBySport, targetProfile]);

  const { rankLabel, medalSrc } = useMemo(() => {
    if (!viewedSport || !targetProfile?.sports?.[viewedSport])
      return { rankLabel: null, medalSrc: null };
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

  if (loading || !targetProfile)
    return (
      <div className='flex items-center justify-center min-h-screen bg-background'>
        <div className='animate-pulse h-16 w-16 rounded-full bg-primary/20 blur-sm' />
      </div>
    );

  return (
    <section className='container mx-auto py-10 space-y-10 animate-in fade-in duration-700'>
      <ProfileHeader
        targetProfile={targetProfile}
        friendStatus={friendStatus}
        handleFriendAction={handleFriendAction}
        isSelf={!!isSelf}
        isManager={!!isManager}
        onUpdate={fetchProfileAndMatches}
        rank={rankLabel}
        medalSrc={medalSrc}
      />
      {isCoachProfile ? (
        <CoachDashboard profile={targetProfile} isSelf={!!isSelf} />
      ) : (
        <div className='grid grid-cols-1 lg:grid-cols-12 gap-8 items-start mb-8'>
          <div className='lg:col-span-8 xl:col-span-9 space-y-8'>
            {playedSports.length === 0 ? (
              <NewPlayerCard isSelf={!!isSelf} profile={targetProfile} />
            ) : (
              <>
                {viewedSport && canView && sportSpecificData ? (
                  <ProfileContent
                    key={viewedSport}
                    canViewProfile={canView}
                    sport={viewedSport}
                    sportProfile={sportSpecificData.sportProfile}
                    matches={sportSpecificData.matches}
                    loadingMatches={loadingMatches}
                    meUid={targetProfile.uid}
                    config={sportConfig[viewedSport]}
                    opponents={sportSpecificData.opponents}
                    targetProfile={targetProfile}
                    tennisStats={sportSpecificData.tennisStats}
                    achievements={targetProfile.achievements ?? []}
                    perfData={sportSpecificData.perfData}
                  />
                ) : (
                  <Card className='border-0 glass-panel shadow-xl rounded-[2.5rem] relative overflow-hidden'>
                    <CardContent className='py-20 flex flex-col items-center justify-center text-center relative z-10'>
                      <Rocket className='h-10 w-10 text-primary mb-6' />
                      <h3 className='text-3xl font-extrabold mb-3'>
                        {isSelf
                          ? t('No matches yet')
                          : t('This player has no matches')}
                      </h3>
                      {isSelf && (
                        <div className='flex gap-4 mt-8'>
                          <Button asChild size='lg'>
                            <Link href='/rooms'>{t('Browse Rooms')}</Link>
                          </Button>
                          <CreateRoomDialog
                            onSuccess={fetchProfileAndMatches}
                          />
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}
              </>
            )}
          </div>
          <div className='lg:col-span-4 xl:col-span-3 flex flex-col gap-4'>
            {isSelf && (
              <GarminLinkDialog
                profile={targetProfile}
                onUpdate={fetchProfileAndMatches}
              />
            )}
            <ProfileSidebar
              canViewProfile={canView}
              targetProfile={targetProfile}
            />
          </div>
        </div>
      )}
    </section>
  );
}
