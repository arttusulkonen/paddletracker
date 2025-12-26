// src/app/rooms/[roomId]/page.tsx
'use client';

import { ProtectedRoute } from '@/components/ProtectedRoutes';
import { RecordBlock } from '@/components/RecordBlock';
import { MembersList } from '@/components/rooms/MembersList';
import { RecentMatches } from '@/components/rooms/RecentMatches';
import { RoomHeader } from '@/components/rooms/RoomHeader';
import { StandingsTable } from '@/components/rooms/StandingsTable';
import {
	Avatar,
	AvatarFallback,
	AvatarImage,
	Button,
	Card,
	CardContent,
	CardHeader,
	CardTitle,
	Checkbox,
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	ScrollArea,
} from '@/components/ui';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useAuth } from '@/contexts/AuthContext';
import { useSport } from '@/contexts/SportContext';
import { useToast } from '@/hooks/use-toast';
import { db } from '@/lib/firebase';
import * as Friends from '@/lib/friends';
import { getUserLite } from '@/lib/friends';
import { finalizeSeason } from '@/lib/season';
import type {
	Match,
	Room,
	Member as RoomMember,
	Season,
	UserProfile,
} from '@/lib/types';
import { parseFlexDate } from '@/lib/utils/date';
import {
	arrayRemove,
	arrayUnion,
	collection,
	doc,
	getDoc,
	getDocs,
	onSnapshot,
	orderBy,
	query,
	updateDoc,
	where,
	writeBatch,
} from 'firebase/firestore';
import { Archive, ArrowLeft, Clock, Info, Lock, UserPlus } from 'lucide-react';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

const calcWinPct = (w: number, l: number) => {
  const t = w + l;
  return t ? ((w / t) * 100).toFixed(1) : '0.0';
};

const tsToMs = (v?: string) => {
  const ms = parseFlexDate(v ?? '').getTime();
  return isNaN(ms) ? Date.parse(v ?? '') || 0 : ms;
};

type StartEndElo = Record<string, { start: number; end: number }>;
type MiniMatch = { result: 'W' | 'L'; opponent: string; score: string };

export default function RoomPage() {
  const { t } = useTranslation();
  const { user, userProfile, isGlobalAdmin } = useAuth();
  const { sport, config } = useSport();
  const { toast } = useToast();
  const router = useRouter();
  const roomId = useParams().roomId as string;

  const [accessDenied, setAccessDenied] = useState(false);

  const [room, setRoom] = useState<Room | null>(null);
  const [rawMatches, setRawMatches] = useState<Match[]>([]);
  const [members, setMembers] = useState<RoomMember[]>([]);
  const [recentMatches, setRecentMatches] = useState<Match[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [latestSeason, setLatestSeason] = useState<Season | null>(null);

  const [seasonStarts, setSeasonStarts] = useState<Record<string, number>>({});
  const [seasonRoomStarts, setSeasonRoomStarts] = useState<
    Record<string, number>
  >({});

  const [hasMounted, setHasMounted] = useState(false);

  const [friends, setFriends] = useState<UserProfile[]>([]);
  const [coPlayers, setCoPlayers] = useState<UserProfile[]>([]);
  const [selectedFriends, setSelectedFriends] = useState<string[]>([]);
  const [isInviting, setIsInviting] = useState(false);

  const memberIdsSet = useMemo(
    () => new Set(room?.memberIds ?? []),
    [room?.memberIds]
  );

  useEffect(() => {
    if (!room) return;
    setSelectedFriends((prev) => prev.filter((id) => !memberIdsSet.has(id)));
  }, [room?.memberIds, memberIdsSet, room]);

  useEffect(() => setHasMounted(true), []);

  useEffect(() => {
    if (!user || !db) return;
    const unsubRoom = onSnapshot(
      doc(db, config.collections.rooms, roomId),
      (snap) => {
        if (!snap.exists()) {
          router.push('/rooms');
          return;
        }
        const roomData = { id: snap.id, ...snap.data() } as Room;

        const viewerId = user?.uid ?? '';
        const isMemberNow =
          Array.isArray(roomData.memberIds) &&
          roomData.memberIds.includes(viewerId);
        const canViewRoom = isGlobalAdmin || roomData.isPublic || isMemberNow;

        if (!canViewRoom) {
          setAccessDenied(true);
          return;
        }

        setRoom(roomData);
        const history = roomData.seasonHistory as unknown as
          | Season[]
          | undefined;
        setLatestSeason(history?.slice().reverse()[0] ?? null);
      }
    );
    return () => unsubRoom();
  }, [user, roomId, config.collections.rooms, router, isGlobalAdmin]);

  useEffect(() => {
    if (!accessDenied) return;
    const tId = setTimeout(() => router.replace('/rooms'), 2000);
    return () => clearTimeout(tId);
  }, [accessDenied, router]);

  useEffect(() => {
    if (!user || accessDenied || !db) return;
    const roomsQ = query(
      collection(db, config.collections.rooms),
      where('memberIds', 'array-contains', user.uid)
    );
    const unsub = onSnapshot(roomsQ, async (snap) => {
      const idsSet = new Set<string>();
      const currentMemberIds = new Set<string>(room?.memberIds ?? []);

      snap.forEach((d) => {
        const memberIds: string[] = d.data()?.memberIds ?? [];
        for (const id of memberIds) {
          if (!id) continue;
          if (id === user.uid) continue;
          if (currentMemberIds.has(id)) continue;
          idsSet.add(id);
        }
      });

      if (idsSet.size === 0) return setCoPlayers([]);

      const loaded = await Promise.all(
        Array.from(idsSet).map(async (uid) => {
          const profile = await getUserLite(uid);
          return profile && profile.uid === uid ? profile : null;
        })
      );
      setCoPlayers(loaded.filter((p): p is UserProfile => !!p));
    });
    return () => unsub();
  }, [user, config.collections.rooms, room?.memberIds, accessDenied]);

  const friendsAll = useMemo(
    () =>
      friends
        .filter((p) => !memberIdsSet.has(p.uid))
        .sort((a, b) =>
          (a.name ?? a.displayName ?? '').localeCompare(
            b.name ?? b.displayName ?? ''
          )
        ),
    [friends, memberIdsSet]
  );

  const othersInSport = useMemo(() => {
    const friendSet = new Set(friends.map((f) => f.uid));
    return coPlayers
      .filter((p) => !friendSet.has(p.uid) && !memberIdsSet.has(p.uid))
      .sort((a, b) =>
        (a.name ?? a.displayName ?? '').localeCompare(
          b.name ?? b.displayName ?? ''
        )
      );
  }, [coPlayers, friends, memberIdsSet]);

  const isCreator = useMemo(() => {
    if (!user || !room) return false;
    return room.creator === user.uid || room.createdBy === user.uid;
  }, [user, room]);

  const canManageRoom = useMemo(() => {
    if (!room || !user) return false;
    if (isCreator || isGlobalAdmin) return true;
    const r = room as Room & { adminIds?: string[] };
    return Array.isArray(r.adminIds) && r.adminIds.includes(user.uid);
  }, [room, user, isGlobalAdmin, isCreator]);

  const isMember = useMemo(
    () => room?.memberIds?.includes(user?.uid ?? ''),
    [user, room]
  );

  useEffect(() => {
    if (!user || !db || accessDenied) return;
    const q = query(
      collection(db, config.collections.matches),
      where('roomId', '==', roomId)
    );
    const unsub = onSnapshot(q, (snap) => {
      const all = snap.docs
        .map((d) => ({ id: d.id, ...d.data() } as Match))
        .sort((a, b) => tsToMs(a.tsIso) - tsToMs(b.tsIso));
      setRawMatches(all);
    });
    return () => unsub();
  }, [user, roomId, config.collections.matches, accessDenied]);

  useEffect(() => {
    const fetchFriends = async () => {
      if (userProfile?.friends && userProfile.friends.length > 0) {
        const friendProfiles = await Friends.getMultipleUsersLite(
          userProfile.friends
        );
        setFriends(friendProfiles);
      } else {
        setFriends([]);
      }
    };
    fetchFriends();
  }, [userProfile]);

  useEffect(() => {
    if (!room) return;

    const syncData = async () => {
      if (!db) return;

      const starts: Record<string, number> = {};
      const roomStarts: Record<string, number> = {};

      rawMatches.forEach((m) => {
        const p1 = m.player1Id,
          p2 = m.player2Id;
        if (starts[p1] == null) starts[p1] = m.player1.oldRating;
        if (starts[p2] == null) starts[p2] = m.player2.oldRating;
        if (roomStarts[p1] == null) roomStarts[p1] = m.player1.roomOldRating;
        if (roomStarts[p2] == null) roomStarts[p2] = m.player2.roomOldRating;
      });

      setSeasonStarts(starts);
      setSeasonRoomStarts(roomStarts);

      const memberIds = room.memberIds || [];
      const existingMembersMap = new Map<string, RoomMember>();

      if (Array.isArray(room.members)) {
        room.members.forEach((m) => existingMembersMap.set(m.userId, m));
      }

      if (memberIds.length === 0) {
        setMembers([]);
        setRecentMatches([]);
        setIsLoading(false);
        return;
      }

      const userDocsSnaps = await Promise.all(
        memberIds.map(async (id) => {
          try {
            return await getDoc(doc(db!, 'users', id));
          } catch {
            return null;
          }
        })
      );

      const freshProfiles = new Map<string, UserProfile>();
      userDocsSnaps.forEach((userSnap) => {
        if (userSnap && userSnap.exists())
          freshProfiles.set(userSnap.id, userSnap.data() as UserProfile);
      });

      const syncedMembers: RoomMember[] = memberIds
        .filter((uid) => !freshProfiles.get(uid)?.isDeleted)
        .map((uid) => {
          const profile = freshProfiles.get(uid);
          const existing = existingMembersMap.get(uid);

          const displayName = profile
            ? profile.name ?? profile.displayName ?? 'Unknown'
            : existing?.name ?? 'Unknown';

          if (existing) {
            return {
              ...existing,
              name: displayName,
              photoURL: profile?.photoURL,
              globalElo: profile?.sports?.[sport]?.globalElo,
              rank: profile?.rank,
            };
          }

          return {
            userId: uid,
            name: displayName,
            email: profile?.email ?? '',
            photoURL: profile?.photoURL,
            rating: 1000,
            wins: 0,
            losses: 0,
            role: 'viewer',
            date: new Date().toISOString(),
            globalElo: profile?.sports?.[sport]?.globalElo ?? 1000,
          };
        });

      setMembers(syncedMembers);

      const syncedMatches = rawMatches.map((match) => {
        const p1Profile = freshProfiles.get(match.player1Id);
        const p2Profile = freshProfiles.get(match.player2Id);

        const newMatch = {
          ...match,
          player1: { ...match.player1 },
          player2: { ...match.player2 },
        };

        if (p1Profile)
          newMatch.player1.name =
            p1Profile.name ?? p1Profile.displayName ?? 'Unknown';
        if (p2Profile)
          newMatch.player2.name =
            p2Profile.name ?? p2Profile.displayName ?? 'Unknown';

        const winnerId =
          match.player1.scores > match.player2.scores
            ? match.player1Id
            : match.player2Id;
        const winnerProfile = freshProfiles.get(winnerId);

        if (winnerProfile)
          newMatch.winner =
            winnerProfile.name ?? winnerProfile.displayName ?? 'Unknown';

        return newMatch;
      });

      setRecentMatches(syncedMatches.slice().reverse());
      setIsLoading(false);
    };

    syncData();
  }, [room, rawMatches, sport]);

  const last5Form = useCallback(
    (m: RoomMember): MiniMatch[] =>
      recentMatches
        .filter((x) => x.player1Id === m.userId || x.player2Id === m.userId)
        .slice(0, 5)
        .map((x) => {
          const winnerId =
            x.player1.scores > x.player2.scores ? x.player1Id : x.player2Id;
          const win = winnerId === m.userId;
          const isPlayer1 = x.player1Id === m.userId;
          const youScore = isPlayer1 ? x.player1.scores : x.player2.scores;
          const oppScore = isPlayer1 ? x.player2.scores : x.player1.scores;
          const opponent = isPlayer1 ? x.player2.name : x.player1.name;
          return {
            result: win ? 'W' : 'L',
            opponent,
            score: `${youScore}-${oppScore}`,
          };
        }),
    [recentMatches]
  );

  const regularPlayers = useMemo(() => {
    const baseMembers = members;
    const matchStats: Record<string, { wins: number; losses: number }> = {};
    const latestRoomRatings: Record<string, number> = {};

    rawMatches.forEach((m) => {
      const winnerId =
        m.player1.scores > m.player2.scores ? m.player1Id : m.player2Id;

      [m.player1Id, m.player2Id].forEach((id) => {
        if (!matchStats[id]) matchStats[id] = { wins: 0, losses: 0 };
        if (id === winnerId) {
          matchStats[id].wins++;
        } else {
          matchStats[id].losses++;
        }

        latestRoomRatings[m.player1Id] = m.player1.roomNewRating;
        latestRoomRatings[m.player2Id] = m.player2.roomNewRating;
      });
    });

    const tennisStats: Record<
      string,
      { aces: number; doubleFaults: number; winners: number }
    > = {};
    if (sport === 'tennis') {
      rawMatches.forEach((m) => {
        const p1Id = m.player1Id,
          p2Id = m.player2Id;
        if (!tennisStats[p1Id])
          tennisStats[p1Id] = { aces: 0, doubleFaults: 0, winners: 0 };
        if (!tennisStats[p2Id])
          tennisStats[p2Id] = { aces: 0, doubleFaults: 0, winners: 0 };

        tennisStats[p1Id].aces += Number(m.player1.aces) || 0;
        tennisStats[p1Id].doubleFaults += Number(m.player1.doubleFaults) || 0;
        tennisStats[p1Id].winners += Number(m.player1.winners) || 0;

        tennisStats[p2Id].aces += Number(m.player2.aces) || 0;
        tennisStats[p2Id].doubleFaults += Number(m.player2.doubleFaults) || 0;
        tennisStats[p2Id].winners += Number(m.player2.winners) || 0;
      });
    }

    return baseMembers.map((m: RoomMember) => {
      const wins = matchStats[m.userId]?.wins ?? 0;
      const losses = matchStats[m.userId]?.losses ?? 0;
      const currentRating = latestRoomRatings[m.userId] ?? m.rating ?? 1000;
      const total = wins + losses;

      let max = 0,
        cur = 0;
      rawMatches.forEach((match) => {
        if (match.player1Id === m.userId || match.player2Id === m.userId) {
          const isPlayer1 = match.player1Id === m.userId;
          const win =
            (isPlayer1 && match.player1.scores > match.player2.scores) ||
            (!isPlayer1 && match.player2.scores > match.player1.scores);
          cur = win ? cur + 1 : 0;
          if (cur > max) max = cur;
        }
      });

      return {
        ...m,
        ...tennisStats[m.userId],
        rating: currentRating,
        ratingVisible: total >= 1,
        wins,
        losses,
        totalMatches: total,
        winPct: calcWinPct(wins, losses),
        deltaRoom: currentRating - (seasonRoomStarts[m.userId] ?? 1000),
        globalDelta:
          (m.globalElo ?? 1000) -
          (seasonStarts[m.userId] ?? m.globalElo ?? 1000),
        avgPtsPerMatch:
          total > 0
            ? (currentRating - +(seasonRoomStarts[m.userId] ?? 1000)) / total
            : 0,
        last5Form: last5Form(m),
        longestWinStreak: max,
      };
    });
  }, [members, rawMatches, seasonStarts, seasonRoomStarts, sport, last5Form]);

  const getSeasonEloSnapshots = useCallback(
    async (roomId: string): Promise<StartEndElo> => {
      if (!db) throw new Error('DB not initialized');
      const qs = query(
        collection(db, config.collections.matches),
        where('roomId', '==', roomId),
        orderBy('tsIso', 'asc')
      );
      const snap = await getDocs(qs);
      const firstSeen: Record<string, number> = {};
      const lastSeen: Record<string, number> = {};

      snap.docs.forEach((d) => {
        const m = d.data() as any;
        [
          {
            id: m.player1Id,
            old: m.player1.oldRating,
            new: m.player1.newRating,
          },
          {
            id: m.player2Id,
            old: m.player2.oldRating,
            new: m.player2.newRating,
          },
        ].forEach((p) => {
          if (!(p.id in firstSeen)) firstSeen[p.id] = p.old;
          lastSeen[p.id] = p.new;
        });
      });

      const out: StartEndElo = {};
      Object.keys(firstSeen).forEach((uid) => {
        out[uid] = {
          start: firstSeen[uid],
          end: lastSeen[uid] ?? firstSeen[uid],
        };
      });
      return out;
    },
    [config.collections.matches]
  );

  const handleFinishSeason = useCallback(async () => {
    try {
      const snapshots = await getSeasonEloSnapshots(roomId);
      await finalizeSeason(roomId, snapshots, config.collections, sport);
      toast({ title: t('Season finished') });
    } catch (err) {
      console.error(err);
      toast({
        title: t('Error'),
        description: t('Failed to finish season'),
        variant: 'destructive',
      });
    }
  }, [roomId, getSeasonEloSnapshots, config.collections, sport, toast, t]);

  const handleRequestToJoin = useCallback(async () => {
    if (!user || !room || !db) return;
    await updateDoc(doc(db, config.collections.rooms, roomId), {
      joinRequests: arrayUnion(user.uid),
    });
    toast({ title: t('Request Sent') });
  }, [user, room, roomId, config.collections.rooms, toast, t]);

  const handleCancelRequestToJoin = useCallback(async () => {
    if (!user || !room || !db) return;
    await updateDoc(doc(db, config.collections.rooms, roomId), {
      joinRequests: arrayRemove(user.uid),
    });
    toast({ title: t('Request Canceled') });
  }, [user, room, roomId, config.collections.rooms, toast, t]);

  const handleLeaveRoom = useCallback(async () => {
    if (!user || !room || !db) return;
    const memberToRemove = members.find((m) => m.userId === user.uid);
    await updateDoc(doc(db, config.collections.rooms, roomId), {
      members: memberToRemove ? arrayRemove(memberToRemove) : undefined,
      memberIds: arrayRemove(user.uid),
    });
    toast({ title: t("You've left the room") });
    router.push('/rooms');
  }, [user, room, roomId, config.collections.rooms, router, toast, t, members]);

  const handleInviteFriends = async () => {
    if (!user || !room || !db || selectedFriends.length === 0) {
      toast({ title: t('Select friends to invite'), variant: 'destructive' });
      return;
    }
    const effectiveSelected = selectedFriends.filter(
      (id) => !memberIdsSet.has(id)
    );
    if (effectiveSelected.length === 0) {
      toast({ title: t('Select friends to invite'), variant: 'destructive' });
      setIsInviting(false);
      return;
    }
    setIsInviting(true);
    try {
      const isStillMember = room.members.some((m) => m.userId === user.uid);
      if (!isStillMember) {
        toast({
          title: t('Permission Denied'),
          description: t('You are no longer a member of this room.'),
          variant: 'destructive',
        });
        setIsInviting(false);
        return;
      }

      const getLite = async (uid: string): Promise<UserProfile | null> => {
        const fromFriends = friends.find((f) => f.uid === uid);
        if (fromFriends) return fromFriends;
        const fromCo = coPlayers.find((p) => p.uid === uid);
        if (fromCo) return fromCo;
        const lite = await getUserLite(uid);
        // FIX: Use Omit to prevent TS error about uid overwrite
        return lite
          ? ({ uid, ...(lite as Omit<typeof lite, 'uid'>) } as UserProfile)
          : null;
      };

      const profiles = await Promise.all(
        effectiveSelected.map(async (uid) => ({
          uid,
          profile: await getLite(uid),
        }))
      );

      const batch = writeBatch(db);
      const roomRef = doc(db, config.collections.rooms, roomId);

      const newMembers = profiles.map(({ uid, profile }) => ({
        userId: uid,
        name: profile?.name ?? profile?.displayName ?? 'New Player',
        email: profile?.email ?? '',
        rating: 1000,
        wins: 0,
        losses: 0,
        date: new Date().toISOString(),
        role: 'editor' as const,
      }));

      profiles.forEach(({ uid }) => {
        const userRef = doc(db!, 'users', uid);
        batch.update(userRef, { rooms: arrayUnion(roomId) });
      });

      batch.update(roomRef, {
        members: arrayUnion(...newMembers),
        memberIds: arrayUnion(...effectiveSelected),
      });

      await batch.commit();

      toast({
        title: t('Invitations Sent'),
        description: t('Your friends have been added to the room.'),
      });
      setSelectedFriends([]);
    } catch (error) {
      console.error('Failed to invite friends:', error);
      toast({
        title: t('Error'),
        description: t('Failed to invite friends.'),
        variant: 'destructive',
      });
    } finally {
      setIsInviting(false);
    }
  };

  const handleRemovePlayer = async (userIdToRemove: string) => {
    if (!room || !user || !db) return;

    const memberToRemove = members.find((m) => m.userId === userIdToRemove);

    try {
      if (!canManageRoom) {
        toast({
          title: t('Permission Denied'),
          description: t('You do not have rights to remove players.'),
          variant: 'destructive',
        });
        return;
      }

      const batch = writeBatch(db);
      const roomRef = doc(db, config.collections.rooms, roomId);

      const updates: any = {
        memberIds: arrayRemove(userIdToRemove),
      };
      if (memberToRemove) {
        updates.members = arrayRemove(memberToRemove);
      }

      batch.update(roomRef, updates);

      const userRef = doc(db, 'users', userIdToRemove);
      batch.update(userRef, { rooms: arrayRemove(roomId) });

      await batch.commit();

      toast({ title: t('Player removed successfully') });
    } catch (error) {
      console.error('Failed to remove player:', error);
      toast({
        title: t('Error'),
        description: t('Failed to remove player from the room.'),
        variant: 'destructive',
      });
    }
  };

  const hasPendingRequest = useMemo(
    () => room?.joinRequests?.includes(user?.uid ?? ''),
    [user, room]
  );

  const showInviteSection = isMember && !latestSeason && !room?.isArchived;

  if (accessDenied) {
    return (
      <div className='fixed inset-0 z-50 flex items-center justify-center'>
        <div className='absolute inset-0 backdrop-blur-sm bg-black/40' />
        <Dialog open>
          <DialogContent className='sm:max-w-md'>
            <DialogHeader>
              <DialogTitle>{t('Private Room')}</DialogTitle>
              <DialogDescription>
                {t(
                  'This room is private. You will be redirected to the rooms list.'
                )}
              </DialogDescription>
            </DialogHeader>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  if (!hasMounted || isLoading || !room) {
    return (
      <div className='flex items-center justify-center min-h-screen'>
        <div className='animate-spin h-16 w-16 rounded-full border-b-4 border-primary' />
      </div>
    );
  }

  return (
    <ProtectedRoute>
      <div className='container mx-auto py-8 px-4'>
        <Button
          variant='ghost'
          className='mb-4 -ml-2 text-muted-foreground hover:text-foreground'
          onClick={() => router.push('/rooms')}
        >
          <ArrowLeft className='mr-2 h-4 w-4' /> {t('Back to Rooms')}
        </Button>

        <RoomHeader
          room={room}
          members={members}
          isMember={!!isMember}
          hasPendingRequest={!!hasPendingRequest}
          isCreator={isCreator}
          onJoin={handleRequestToJoin}
          onCancelJoin={handleCancelRequestToJoin}
          onLeave={handleLeaveRoom}
        />

        {/* ALERTS SECTION */}
        <div className='space-y-4 mb-8'>
          {room.isArchived && (
            <Alert variant='destructive'>
              <Archive className='h-4 w-4' />
              <AlertTitle>{t('Archived Room')}</AlertTitle>
              <AlertDescription>
                {t('This room is read-only. No new matches can be recorded.')}
              </AlertDescription>
            </Alert>
          )}

          {!room.isArchived && latestSeason && (
            <Alert className='border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/20'>
              <Clock className='h-4 w-4 text-amber-600 dark:text-amber-500' />
              <AlertTitle className='text-amber-800 dark:text-amber-400'>
                {t('Season Finished')}
              </AlertTitle>
              <AlertDescription className='text-amber-700 dark:text-amber-300'>
                {t('Matches are paused until a new season starts.')}
              </AlertDescription>
            </Alert>
          )}

          {!isMember &&
            room.isPublic &&
            !hasPendingRequest &&
            !room.isArchived && (
              <Alert className='border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950/20'>
                <Info className='h-4 w-4 text-blue-600 dark:text-blue-500' />
                <AlertTitle className='text-blue-800 dark:text-blue-400'>
                  {t('Join to Play')}
                </AlertTitle>
                <AlertDescription className='text-blue-700 dark:text-blue-300'>
                  {t(
                    'This is a public room. Join to start recording matches and see your stats.'
                  )}
                </AlertDescription>
              </Alert>
            )}

          {hasPendingRequest && (
            <Alert className='border-yellow-200 bg-yellow-50 dark:border-yellow-900 dark:bg-yellow-950/20'>
              <Lock className='h-4 w-4 text-yellow-600 dark:text-yellow-500' />
              <AlertTitle className='text-yellow-800 dark:text-yellow-400'>
                {t('Request Pending')}
              </AlertTitle>
              <AlertDescription className='text-yellow-700 dark:text-yellow-300'>
                {t('Waiting for admin approval to join.')}
              </AlertDescription>
            </Alert>
          )}
        </div>

        {/* MAIN LAYOUT GRID */}
        <div className='grid grid-cols-1 lg:grid-cols-12 gap-8'>
          {/* LEFT COLUMN: Players & Invites (4 cols) */}
          <div className='lg:col-span-4 space-y-6'>
            <Card className='shadow-sm border-0 bg-transparent sm:bg-card sm:border'>
              <CardHeader className='px-0 sm:px-6'>
                <CardTitle>{t('Players')}</CardTitle>
              </CardHeader>
              <CardContent className='px-0 sm:px-6'>
                <MembersList
                  members={regularPlayers}
                  room={room}
                  isCreator={isCreator}
                  canManage={canManageRoom}
                  currentUser={user}
                  onRemovePlayer={handleRemovePlayer}
                />

                {showInviteSection && (
                  <div className='mt-6 pt-6 border-t'>
                    <div className='flex items-center gap-2 mb-3'>
                      <UserPlus className='h-4 w-4 text-muted-foreground' />
                      <h4 className='font-semibold text-sm'>
                        {t('Invite Friends')}
                      </h4>
                    </div>

                    <ScrollArea className='h-40 border rounded-lg bg-muted/30 p-2'>
                      {friendsAll.length + othersInSport.length > 0 ? (
                        <div className='space-y-4'>
                          {friendsAll.length > 0 && (
                            <div className='space-y-1'>
                              <div className='px-2 text-[10px] uppercase font-bold text-muted-foreground tracking-wider'>
                                {t('My Friends')}
                              </div>
                              {friendsAll.map((p) => (
                                <label
                                  key={p.uid}
                                  className='flex items-center gap-3 p-2 rounded-md hover:bg-background cursor-pointer transition-colors border border-transparent hover:border-border'
                                >
                                  <Checkbox
                                    checked={selectedFriends.includes(p.uid)}
                                    onCheckedChange={(v) =>
                                      v
                                        ? setSelectedFriends([
                                            ...selectedFriends,
                                            p.uid,
                                          ])
                                        : setSelectedFriends(
                                            selectedFriends.filter(
                                              (id) => id !== p.uid
                                            )
                                          )
                                    }
                                  />
                                  <div className='flex items-center gap-2 overflow-hidden'>
                                    <Avatar className='h-6 w-6'>
                                      <AvatarImage
                                        src={p.photoURL ?? undefined}
                                      />
                                      <AvatarFallback>
                                        {(p.name ?? '?')[0]}
                                      </AvatarFallback>
                                    </Avatar>
                                    <span className='truncate text-sm font-medium'>
                                      {p.name ?? p.displayName}
                                    </span>
                                  </div>
                                </label>
                              ))}
                            </div>
                          )}

                          {othersInSport.length > 0 && (
                            <div className='space-y-1'>
                              <div className='px-2 text-[10px] uppercase font-bold text-muted-foreground tracking-wider'>
                                {t('Recent Opponents')}
                              </div>
                              {othersInSport.map((p) => (
                                <label
                                  key={p.uid}
                                  className='flex items-center gap-3 p-2 rounded-md hover:bg-background cursor-pointer transition-colors border border-transparent hover:border-border'
                                >
                                  <Checkbox
                                    checked={selectedFriends.includes(p.uid)}
                                    onCheckedChange={(v) =>
                                      v
                                        ? setSelectedFriends([
                                            ...selectedFriends,
                                            p.uid,
                                          ])
                                        : setSelectedFriends(
                                            selectedFriends.filter(
                                              (id) => id !== p.uid
                                            )
                                          )
                                    }
                                  />
                                  <div className='flex items-center gap-2 overflow-hidden'>
                                    <Avatar className='h-6 w-6'>
                                      <AvatarImage
                                        src={p.photoURL ?? undefined}
                                      />
                                      <AvatarFallback>
                                        {(p.name ?? '?')[0]}
                                      </AvatarFallback>
                                    </Avatar>
                                    <span className='truncate text-sm font-medium'>
                                      {p.name ?? p.displayName}
                                    </span>
                                  </div>
                                </label>
                              ))}
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className='h-full flex flex-col items-center justify-center text-muted-foreground text-xs text-center p-4'>
                          <UserPlus className='h-8 w-8 mb-2 opacity-20' />
                          <p>{t('No friends available to invite.')}</p>
                        </div>
                      )}
                    </ScrollArea>
                    <Button
                      onClick={handleInviteFriends}
                      disabled={isInviting || selectedFriends.length === 0}
                      className='w-full mt-3'
                      size='sm'
                    >
                      {isInviting ? t('Sending...') : t('Send Invites')}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* RIGHT COLUMN: Record -> Standings -> History (8 cols) */}
          <div className='lg:col-span-8 space-y-8'>
            {/* 1. Record Block */}
            {isMember && !latestSeason && !room.isArchived && (
              <section>
                <RecordBlock
                  members={members}
                  roomId={roomId}
                  room={room}
                  isCreator={isCreator}
                  isGlobalAdmin={isGlobalAdmin}
                  onFinishSeason={handleFinishSeason}
                />
              </section>
            )}

            {/* 2. Standings */}
            <section>
              <div className='flex items-center justify-between mb-4'>
                <h2 className='text-xl font-bold tracking-tight'>
                  {t('Standings')}
                </h2>
              </div>
              <StandingsTable
                players={regularPlayers}
                latestSeason={latestSeason}
                roomCreatorId={room.createdBy || room.creator || ''}
                roomMode={room.mode || 'office'}
              />
            </section>

            {/* 3. Match History */}
            <section>
              <div className='flex items-center justify-between mb-4 pt-4 border-t'>
                <h2 className='text-xl font-bold tracking-tight mt-4'>
                  {t('Match History')}
                </h2>
              </div>
              <RecentMatches matches={recentMatches} />
            </section>
          </div>
        </div>
      </div>
    </ProtectedRoute>
  );
}
