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
	Checkbox,
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	Label,
	ScrollArea,
	Separator,
} from '@/components/ui';
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
import { ArrowLeft } from 'lucide-react';
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
  }, [room?.memberIds, memberIdsSet]);

  useEffect(() => setHasMounted(true), []);

  useEffect(() => {
    if (!user || !db) return;
    const unsubRoom = onSnapshot(
      doc(db!, config.collections.rooms, roomId),
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
      collection(db!, config.collections.rooms),
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

  // --- ИСПРАВЛЕННАЯ ЛОГИКА ПРАВ ---

  // 1. Создатель (проверяем оба поля: creator и старое createdBy)
  const isCreator = useMemo(() => {
    if (!user || !room) return false;
    return room.creator === user.uid || room.createdBy === user.uid;
  }, [user, room]);

  // 2. Управление (Создатель, Админ комнаты, Супер-админ)
  const canManageRoom = useMemo(() => {
    if (!room || !user) return false;
    if (isCreator || isGlobalAdmin) return true;

    // Проверка массива adminIds
    const r = room as Room & { adminIds?: string[] };
    return Array.isArray(r.adminIds) && r.adminIds.includes(user.uid);
  }, [room, user, isGlobalAdmin, isCreator]);

  // 3. Членство (проверяем массив ID)
  const isMember = useMemo(
    () => room?.memberIds?.includes(user?.uid ?? ''),
    [user, room]
  );

  useEffect(() => {
    if (!user || !db || accessDenied) return;
    const q = query(
      collection(db!, config.collections.matches),
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

      // Синхронизация мемберов
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
        collection(db!, config.collections.matches),
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
    await updateDoc(doc(db!, config.collections.rooms, roomId), {
      joinRequests: arrayUnion(user.uid),
    });
    toast({ title: t('Request Sent') });
  }, [user, room, roomId, config.collections.rooms, toast, t]);

  const handleCancelRequestToJoin = useCallback(async () => {
    if (!user || !room || !db) return;
    await updateDoc(doc(db!, config.collections.rooms, roomId), {
      joinRequests: arrayRemove(user.uid),
    });
    toast({ title: t('Request Canceled') });
  }, [user, room, roomId, config.collections.rooms, toast, t]);

  const handleLeaveRoom = useCallback(async () => {
    if (!user || !room || !db) return;
    const memberToRemove = members.find((m) => m.userId === user.uid);
    await updateDoc(doc(db!, config.collections.rooms, roomId), {
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
        return lite ? ({ uid, ...lite } as UserProfile) : null;
      };

      const profiles = await Promise.all(
        effectiveSelected.map(async (uid) => ({
          uid,
          profile: await getLite(uid),
        }))
      );

      const batch = writeBatch(db!);
      const roomRef = doc(db!, config.collections.rooms, roomId);

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

      const batch = writeBatch(db!);
      const roomRef = doc(db!, config.collections.rooms, roomId);

      const updates: any = {
        memberIds: arrayRemove(userIdToRemove),
      };
      if (memberToRemove) {
        updates.members = arrayRemove(memberToRemove);
      }

      batch.update(roomRef, updates);

      const userRef = doc(db!, 'users', userIdToRemove);
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
          variant='outline'
          className='mb-6'
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

        <div className='space-y-3 mb-6'>
          {room.isArchived && (
            <Card>
              <CardContent className='text-sm text-muted-foreground p-4'>
                {t(
                  'This room is archived. Recording and member changes are disabled. You can still view standings and history.'
                )}
              </CardContent>
            </Card>
          )}

          {room.mode === 'arcade' && (
            <Card className='border-purple-200 bg-purple-50 dark:bg-purple-900/20'>
              <CardContent className='text-sm text-purple-900 dark:text-purple-100 p-4 flex gap-2'>
                <span>👾</span>
                <span>
                  <strong>{t('Arcade Mode Active:')}</strong>{' '}
                  {t(
                    'Matches in this room do NOT affect your Global ELO. Play for fun and experiment!'
                  )}
                </span>
              </CardContent>
            </Card>
          )}
          {room.mode === 'office' && (
            <Card className='border-slate-200 bg-slate-50 dark:bg-slate-900/20'>
              <CardContent className='text-sm text-slate-700 dark:text-slate-300 p-4 flex gap-2'>
                <span>💼</span>
                <span>
                  <strong>{t('Office Mode Active:')}</strong>{' '}
                  {t(
                    'Losses are penalized less (inflated ELO) to keep office morale high. Global ELO is still affected.'
                  )}
                </span>
              </CardContent>
            </Card>
          )}
          {room.mode === 'professional' && (
            <Card className='border-amber-200 bg-amber-50 dark:bg-amber-900/20'>
              <CardContent className='text-sm text-amber-800 dark:text-amber-200 p-4 flex gap-2'>
                <span>🏆</span>
                <span>
                  <strong>{t('Professional Mode Active:')}</strong>{' '}
                  {t(
                    'Standard ELO rules apply. Every match counts towards your Global Ranking.'
                  )}
                </span>
              </CardContent>
            </Card>
          )}

          {!room.isArchived && latestSeason && (
            <Card>
              <CardContent className='text-sm text-muted-foreground p-4'>
                {t(
                  'The latest season has been finalized. Recording is disabled until a new season starts.'
                )}
              </CardContent>
            </Card>
          )}
          {!isMember && room.isPublic && !hasPendingRequest && (
            <Card>
              <CardContent className='text-sm text-muted-foreground p-4'>
                {t(
                  'This is a public room. You can request to join to start recording matches and appear in the standings.'
                )}
              </CardContent>
            </Card>
          )}
          {hasPendingRequest && (
            <Card>
              <CardContent className='text-sm text-muted-foreground p-4'>
                {t(
                  'Join request sent. You will be added when an admin approves it.'
                )}
              </CardContent>
            </Card>
          )}
          {canManageRoom && (
            <Card>
              <CardContent className='text-sm text-muted-foreground p-4'>
                {t(
                  'You can manage members (add/remove), record matches, and finish the season. Use the member list to remove players and the recorder to submit results.'
                )}
              </CardContent>
            </Card>
          )}
        </div>

        <Card>
          <CardContent className='grid md:grid-cols-3 gap-6 p-4'>
            <div className='md:col-span-1 space-y-4'>
              <MembersList
                members={regularPlayers}
                room={room}
                isCreator={isCreator}
                canManage={canManageRoom}
                currentUser={user}
                onRemovePlayer={handleRemovePlayer}
              />

              {showInviteSection && (
                <div className='pt-4 border-t'>
                  <Label className='text-sm font-medium'>
                    {t('Invite players:')}
                  </Label>
                  <ScrollArea className='h-32 mt-2 border rounded-md p-2'>
                    {friendsAll.length + othersInSport.length > 0 ? (
                      <>
                        {friendsAll.length > 0 && (
                          <>
                            <div className='px-2 pt-1 pb-2 text-xs uppercase tracking-wide text-muted-foreground'>
                              {t('Friends')}
                            </div>
                            {friendsAll.map((p) => {
                              const displayName =
                                p.name ?? p.displayName ?? '?';
                              return (
                                <label
                                  key={p.uid}
                                  className='flex items-center gap-2 py-1.5 px-2 rounded hover:bg-muted'
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
                                  <div className='flex items-center gap-2'>
                                    <Avatar className='h-6 w-6'>
                                      <AvatarImage
                                        src={p.photoURL ?? undefined}
                                      />
                                      <AvatarFallback>
                                        {displayName.charAt(0)}
                                      </AvatarFallback>
                                    </Avatar>
                                    <span>{displayName}</span>
                                  </div>
                                </label>
                              );
                            })}
                          </>
                        )}

                        {othersInSport.length > 0 && (
                          <>
                            <div className='px-2 pt-3 pb-2 text-xs uppercase tracking-wide text-muted-foreground'>
                              {t('From your sport rooms')}
                            </div>
                            {othersInSport.map((p) => {
                              const displayName =
                                p.name ?? p.displayName ?? '?';
                              return (
                                <label
                                  key={p.uid}
                                  className='flex items-center gap-2 py-1.5 px-2 rounded hover:bg-muted'
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
                                  <div className='flex items-center gap-2'>
                                    <Avatar className='h-6 w-6'>
                                      <AvatarImage
                                        src={p.photoURL ?? undefined}
                                      />
                                      <AvatarFallback>
                                        {displayName.charAt(0)}
                                      </AvatarFallback>
                                    </Avatar>
                                    <span>{displayName}</span>
                                  </div>
                                </label>
                              );
                            })}
                          </>
                        )}
                      </>
                    ) : (
                      <p className='text-muted-foreground text-sm text-center py-4'>
                        {t('No players to show here yet.')}
                      </p>
                    )}
                  </ScrollArea>
                  <Button
                    onClick={handleInviteFriends}
                    disabled={isInviting || selectedFriends.length === 0}
                    className='w-full mt-2'
                  >
                    {isInviting
                      ? t('Inviting...')
                      : t('Invite to {{roomName}}', { roomName: room.name })}
                  </Button>
                </div>
              )}
            </div>

            {isMember && !latestSeason && !room.isArchived && (
              <div className='md:col-span-2'>
                <RecordBlock
                  members={members}
                  roomId={roomId}
                  room={room}
                  isCreator={isCreator}
                  isGlobalAdmin={isGlobalAdmin}
                  onFinishSeason={handleFinishSeason}
                />
              </div>
            )}
          </CardContent>
        </Card>

        <Separator className='my-8' />

        <StandingsTable
          players={regularPlayers}
          latestSeason={latestSeason}
          roomCreatorId={room.createdBy || room.creator || ''}
          roomMode={room.mode || 'office'}
        />

        <RecentMatches matches={recentMatches} />
      </div>
    </ProtectedRoute>
  );
}
