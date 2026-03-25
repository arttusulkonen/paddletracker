'use client';

import { ProtectedRoute } from '@/components/ProtectedRoutes';
import { RecordBlock } from '@/components/RecordBlock';
import { DerbyFeed } from '@/components/rooms/DerbyFeed';
import { DerbyHallOfFame } from '@/components/rooms/DerbyHallOfFame';
import { DerbySimulator } from '@/components/rooms/DerbySimulator';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
import {
	Archive,
	ArrowLeft,
	Clock,
	History,
	LayoutDashboard,
	Lock,
	Trophy,
	UserPlus,
	Zap,
} from 'lucide-react';
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

const cleanForFirebase = (obj: any): any => {
  if (!obj) return null;
  return JSON.parse(
    JSON.stringify(obj, (_, value) => {
      return value === undefined ? null : value;
    }),
  );
};

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

  const debugModeEnv =
    typeof process !== 'undefined'
      ? process.env.NEXT_PUBLIC_ROOMS_DEBUG_MODE
      : undefined;
  const debugMode =
    typeof debugModeEnv === 'string' && debugModeEnv.toLowerCase() === 'true';

  const memberIdsSet = useMemo(
    () => new Set(room?.memberIds ?? []),
    [room?.memberIds],
  );

  useEffect(() => {
    if (!room) return;
    setSelectedFriends((prev) => prev.filter((id) => !memberIdsSet.has(id)));
  }, [room?.memberIds, memberIdsSet, room]);

  useEffect(() => setHasMounted(true), []);

  useEffect(() => {
    if (!user || !db) return;
    const firestore = db;
    const unsubRoom = onSnapshot(
      doc(firestore, config.collections.rooms, roomId),
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
      },
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
    const firestore = db;
    const roomsQ = query(
      collection(firestore, config.collections.rooms),
      where('memberIds', 'array-contains', user.uid),
    );
    const unsub = onSnapshot(roomsQ, async (snap) => {
      const idsSet = new Set<string>();
      const currentMemberIds = new Set<string>(room?.memberIds ?? []);
      snap.forEach((d) => {
        const memberIds: string[] = d.data()?.memberIds ?? [];
        for (const id of memberIds) {
          if (id && id !== user.uid && !currentMemberIds.has(id))
            idsSet.add(id);
        }
      });
      if (idsSet.size === 0) return setCoPlayers([]);
      const loaded = await Promise.all(
        Array.from(idsSet).map(async (uid) => await getUserLite(uid)),
      );
      setCoPlayers(loaded.filter((p): p is UserProfile => !!p));
    });
    return () => unsub();
  }, [user, config.collections.rooms, room?.memberIds, accessDenied]);

  const friendsAll = useMemo(
    () =>
      friends
        .filter((p) => !memberIdsSet.has(p.uid) && p.accountType !== 'coach')
        .sort((a, b) =>
          (a.name || a.displayName || '').localeCompare(
            b.name || b.displayName || '',
          ),
        ),
    [friends, memberIdsSet],
  );
  const othersInSport = useMemo(() => {
    const friendSet = new Set(friends.map((f) => f.uid));
    return coPlayers
      .filter(
        (p) =>
          !friendSet.has(p.uid) &&
          !memberIdsSet.has(p.uid) &&
          p.accountType !== 'coach',
      )
      .sort((a, b) =>
        (a.name || a.displayName || '').localeCompare(
          b.name || b.displayName || '',
        ),
      );
  }, [coPlayers, friends, memberIdsSet]);

  const isCreator = useMemo(
    () =>
      !!(
        user &&
        room &&
        (room.creator === user.uid || room.createdBy === user.uid)
      ),
    [user, room],
  );

  const canManageRoom = useMemo(() => {
    if (!room || !user) return false;
    if (isCreator || isGlobalAdmin) return true;
    return Array.isArray(room.adminIds) && room.adminIds.includes(user.uid);
  }, [room, user, isGlobalAdmin, isCreator]);

  const isMember = useMemo(
    () => room?.memberIds?.includes(user?.uid ?? ''),
    [user, room],
  );

  useEffect(() => {
    if (!user || !db || accessDenied) return;
    const firestore = db;
    const q = query(
      collection(firestore, config.collections.matches),
      where('roomId', '==', roomId),
    );
    const unsub = onSnapshot(q, (snap) => {
      const all = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }) as Match)
        .sort((a, b) => tsToMs(a.tsIso) - tsToMs(b.tsIso));
      setRawMatches(all);
    });
    return () => unsub();
  }, [user, roomId, config.collections.matches, accessDenied]);

  useEffect(() => {
    const fetchFriends = async () => {
      if (userProfile?.friends?.length) {
        const friendProfiles = await Friends.getMultipleUsersLite(
          userProfile.friends,
        );
        setFriends(friendProfiles);
      } else setFriends([]);
    };
    fetchFriends();
  }, [userProfile]);

  useEffect(() => {
    if (!room) return;
    const syncData = async () => {
      if (!db) return;
      const firestore = db;
      const starts: Record<string, number> = {};
      const roomStarts: Record<string, number> = {};
      rawMatches.forEach((m) => {
        if (starts[m.player1Id] == null)
          starts[m.player1Id] = m.player1.oldRating;
        if (starts[m.player2Id] == null)
          starts[m.player2Id] = m.player2.oldRating;
        if (roomStarts[m.player1Id] == null)
          roomStarts[m.player1Id] = m.player1.roomOldRating;
        if (roomStarts[m.player2Id] == null)
          roomStarts[m.player2Id] = m.player2.roomOldRating;
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
            return await getDoc(doc(firestore, 'users', id));
          } catch {
            return null;
          }
        }),
      );
      const freshProfiles = new Map<string, UserProfile>();
      userDocsSnaps.forEach((s) => {
        if (s?.exists()) freshProfiles.set(s.id, s.data() as UserProfile);
      });

      const syncedMembers: RoomMember[] = memberIds
        .filter((uid) => !freshProfiles.get(uid)?.isDeleted)
        .map((uid) => {
          const p = freshProfiles.get(uid);
          const existing = existingMembersMap.get(uid);
          const displayName = p
            ? p.name || p.displayName || 'Unknown'
            : existing?.name || 'Unknown';
          const accountType =
            p?.accountType || (existing as any)?.accountType || 'player';

          if (existing) {
            return {
              ...existing,
              name: displayName,
              photoURL: p?.photoURL || null,
              globalElo: p?.sports?.[sport]?.globalElo || 1000,
              rank: p?.rank || null,
              accountType,
            } as any;
          }

          return {
            userId: uid,
            name: displayName,
            email: p?.email ?? '',
            photoURL: p?.photoURL || null,
            rating: 1000,
            wins: 0,
            losses: 0,
            role: 'viewer',
            date: new Date().toISOString(),
            globalElo: p?.sports?.[sport]?.globalElo ?? 1000,
            accountType,
          } as any;
        });
      setMembers(syncedMembers);

      const syncedMatches = rawMatches.map((match) => {
        const p1 = freshProfiles.get(match.player1Id);
        const p2 = freshProfiles.get(match.player2Id);
        const newMatch = {
          ...match,
          player1: { ...match.player1 },
          player2: { ...match.player2 },
        };
        if (p1) newMatch.player1.name = p1.name || p1.displayName || 'Unknown';
        if (p2) newMatch.player2.name = p2.name || p2.displayName || 'Unknown';
        const winnerId =
          match.player1.scores > match.player2.scores
            ? match.player1Id
            : match.player2Id;
        const winner = freshProfiles.get(winnerId);
        if (winner)
          newMatch.winner = winner.name || winner.displayName || 'Unknown';
        return newMatch;
      });
      setRecentMatches(syncedMatches.slice().reverse());
      setIsLoading(false);
    };
    syncData();
  }, [room, rawMatches, sport]);

  const last5Form = useCallback(
    (m: RoomMember) =>
      recentMatches
        .filter((x) => x.player1Id === m.userId || x.player2Id === m.userId)
        .slice(0, 5)
        .map((x) => {
          const win =
            (x.player1.scores > x.player2.scores
              ? x.player1Id
              : x.player2Id) === m.userId;
          const isPlayer1 = x.player1Id === m.userId;
          return {
            result: win ? 'W' : 'L',
            opponent:
              (isPlayer1 ? x.player2.name : x.player1.name) || 'Unknown',
            score: `${isPlayer1 ? x.player1.scores : x.player2.scores}-${isPlayer1 ? x.player2.scores : x.player1.scores}`,
          } as any;
        }),
    [recentMatches],
  );

  const regularPlayers = useMemo(() => {
    const matchStats: Record<string, { wins: number; losses: number }> = {};
    const latestRoomRatings: Record<string, number> = {};
    rawMatches.forEach((m) => {
      const winnerId =
        m.player1.scores > m.player2.scores ? m.player1Id : m.player2Id;
      [m.player1Id, m.player2Id].forEach((id) => {
        if (!matchStats[id]) matchStats[id] = { wins: 0, losses: 0 };
        if (id === winnerId) matchStats[id].wins++;
        else matchStats[id].losses++;
        latestRoomRatings[m.player1Id] = m.player1.roomNewRating;
        latestRoomRatings[m.player2Id] = m.player2.roomNewRating;
      });
    });

    const basePlayers = members.map((m: RoomMember) => {
      const wins = matchStats[m.userId]?.wins ?? 0;
      const losses = matchStats[m.userId]?.losses ?? 0;
      const currentRating = latestRoomRatings[m.userId] ?? m.rating ?? 1000;
      const startingRating = seasonRoomStarts[m.userId] ?? 1000;

      let max = 0,
        cur = 0;
      rawMatches.forEach((match) => {
        if (match.player1Id === m.userId || match.player2Id === m.userId) {
          const isP1 = match.player1Id === m.userId;
          const win = isP1
            ? match.player1.scores > match.player2.scores
            : match.player2.scores > match.player1.scores;
          cur = win ? cur + 1 : 0;
          if (cur > max) max = cur;
        }
      });

      const total = wins + losses;

      return {
        ...m,
        rating: currentRating,
        ratingVisible: total >= 1,
        wins,
        losses,
        totalMatches: total,
        winPct: calcWinPct(wins, losses),
        deltaRoom: currentRating - startingRating,
        globalDelta:
          (m.globalElo ?? 1000) -
          (seasonStarts[m.userId] ?? m.globalElo ?? 1000),
        avgPtsPerMatch:
          total > 0 ? (currentRating - startingRating) / total : 0,
        last5Form: last5Form(m),
        longestWinStreak: max,
        startRoomRating: startingRating,
        startGlobalElo: seasonStarts[m.userId] ?? m.globalElo ?? 1000,
      };
    });

    const activePlayers = basePlayers.filter((p: any) => p.totalMatches > 0);
    const totalMatchesAll = activePlayers.reduce(
      (sum: number, r: any) => sum + r.totalMatches,
      0,
    );
    const avgM =
      activePlayers.length > 0 ? totalMatchesAll / activePlayers.length : 1;

    const adjFactor = (ratio: number) => {
      if (!isFinite(ratio) || ratio <= 0) return 0;
      return Math.sqrt(ratio);
    };

    return basePlayers.map((p: any) => ({
      ...p,
      adjPointsLive: p.deltaRoom * adjFactor(p.totalMatches / avgM),
    }));
  }, [members, rawMatches, seasonStarts, seasonRoomStarts, last5Form]);

  const playersOnlyMembers = useMemo(
    () => regularPlayers.filter((m: any) => m.accountType !== 'coach'),
    [regularPlayers],
  );

  const handleFinishSeason = useCallback(async () => {
    if (!db) return;
    const firestore = db;
    try {
      const qs = query(
        collection(firestore, config.collections.matches),
        where('roomId', '==', roomId),
        orderBy('tsIso', 'asc'),
      );
      const snap = await getDocs(qs);
      const firstSeen: Record<string, number> = {};
      const lastSeen: Record<string, number> = {};
      snap.docs.forEach((d) => {
        const m = d.data() as any;
        if (!(m.player1Id in firstSeen))
          firstSeen[m.player1Id] = m.player1.oldRating;
        if (!(m.player2Id in firstSeen))
          firstSeen[m.player2Id] = m.player2.oldRating;
        lastSeen[m.player1Id] = m.player1.newRating;
        lastSeen[m.player2Id] = m.player2.newRating;
      });
      const snapshots: any = {};
      Object.keys(firstSeen).forEach(
        (uid) =>
          (snapshots[uid] = {
            start: firstSeen[uid],
            end: lastSeen[uid] ?? firstSeen[uid],
          }),
      );
      await finalizeSeason(roomId, snapshots, config.collections, sport);
      toast({ title: t('Season finished') });
    } catch (err) {
      console.error(err);
      toast({ title: t('Error'), variant: 'destructive' });
    }
  }, [roomId, config.collections, sport, t, toast]);

  const handleForceEndSprint = async () => {
    if (!room || room.mode !== 'derby' || !db) return;
    const firestore = db;
    try {
      const nowMs = Date.now();
      const nowIso = new Date().toISOString();
      const startDate = (room as any).sprintStartTs
        ? new Date((room as any).sprintStartTs).toLocaleDateString()
        : '???';
      const endDate = new Date(nowMs).toLocaleDateString();
      const periodLabel = `${startDate} — ${endDate}`;
      if (members.length === 0) return;

      const participants = [...playersOnlyMembers].sort((a, b) => {
        const rA = a.rating || 1000;
        const rB = b.rating || 1000;
        if (rB !== rA) return rB - rA;
        const wA = a.wins || 0;
        const wB = b.wins || 0;
        if (wB !== wA) return wB - wA;
        const wrA = (a.wins || 0) / (a.totalMatches || 1);
        const wrB = (b.wins || 0) / (b.totalMatches || 1);
        return wrB - wrA;
      });

      const podium = participants.slice(0, 3);
      const champion = podium[0];
      const topSlayerPlayer = [...playersOnlyMembers].sort(
        (a, b) =>
          (b.badges?.filter((x: string) => x === 'giant_slayer').length || 0) -
          (a.badges?.filter((x: string) => x === 'giant_slayer').length || 0),
      )[0];
      const slayerCount =
        topSlayerPlayer?.badges?.filter((x: string) => x === 'giant_slayer')
          .length || 0;
      const topStreakPlayer = [...playersOnlyMembers].sort(
        (a, b) => (b.highestStreak || 0) - (a.highestStreak || 0),
      )[0];

      const sprintResult = {
        sprintNumber: ((room as any).sprintCount || 0) + 1,
        period: periodLabel,
        winnerId: champion?.userId || null,
        winnerName: champion?.name || 'Unknown',
        podium: podium.map((p) => ({
          name: p.name || 'Unknown',
          userId: p.userId,
          rating: p.rating || 1000,
        })),
        topSlayerName: topSlayerPlayer?.name || null,
        topSlayerCount: slayerCount || 0,
        maxStreak: topStreakPlayer?.highestStreak || 0,
        maxStreakPlayerName: topStreakPlayer?.name || null,
      };

      const hallOfFame = Array.isArray(room.hallOfFame)
        ? [...room.hallOfFame]
        : [];
      const sprintHistory = Array.isArray((room as any).sprintHistory)
        ? [...(room as any).sprintHistory]
        : [];
      sprintHistory.push(sprintResult);

      const batch = writeBatch(firestore);
      const updatedMembers = members.map((m: any) => {
        let hof = hallOfFame.find((e: any) => e.userId === m.userId);
        if (!hof) {
          hof = {
            userId: m.userId,
            name: m.name || 'Unknown',
            championships: 0,
            streaksBroken: 0,
            maxStreakEver: 0,
            totalDerbyWins: 0,
          };
          hallOfFame.push(hof);
        }
        if (m.userId === champion?.userId)
          hof.championships = (hof.championships || 0) + 1;
        const curSlayers =
          m.badges?.filter((b: string) => b === 'giant_slayer').length || 0;
        hof.streaksBroken = (hof.streaksBroken || 0) + curSlayers;
        if ((m.highestStreak || 0) > (hof.maxStreakEver || 0))
          hof.maxStreakEver = m.highestStreak;
        hof.totalDerbyWins = (hof.totalDerbyWins || 0) + (m.wins || 0);

        const podiumIdx = podium.findIndex((p) => p.userId === m.userId);
        if (podiumIdx !== -1) {
          const userRef = doc(firestore, 'users', m.userId);
          const baseAchievement = {
            sport,
            dateFinished: nowIso,
            roomName: room.name || 'Derby',
            place: podiumIdx + 1,
            matchesPlayed: m.totalMatches || 0,
            wins: m.wins || 0,
            mode: 'derby',
          };
          const achievementsToAdd = [
            { ...baseAchievement, type: 'seasonFinish' },
          ];
          if (podiumIdx === 0)
            achievementsToAdd.push({
              ...baseAchievement,
              type: 'derbyChampion',
            });
          batch.update(userRef, {
            achievements: arrayUnion(...achievementsToAdd),
          });
        }
        if (
          m.userId === topStreakPlayer?.userId &&
          (m.highestStreak || 0) >= 5
        ) {
          batch.update(doc(firestore, 'users', m.userId), {
            achievements: arrayUnion({
              type: 'derbyUnstoppable',
              sport,
              dateFinished: nowIso,
              roomName: room.name || 'Derby',
              longestWinStreak: m.highestStreak,
            }),
          });
        }
        const oldRating = m.rating || 1000;
        return {
          ...m,
          rating: Math.round(1000 + (oldRating - 1000) * 0.75),
          currentStreak: 0,
          highestStreak: 0,
          badges: [],
        };
      });

      batch.update(
        doc(firestore, config.collections.rooms, roomId),
        cleanForFirebase({
          members: updatedMembers,
          hallOfFame,
          sprintHistory,
          sprintStartTs: nowMs,
          sprintCount: ((room as any).sprintCount || 0) + 1,
        }),
      );
      await batch.commit();
      toast({
        title: t('Sprint Finished'),
        description: `${champion?.name || 'Someone'} is the Champion!`,
      });
    } catch (error) {
      console.error(error);
      toast({ title: t('Error'), variant: 'destructive' });
    }
  };

  const handleInviteFriends = async () => {
    if (!user || !room || !db || selectedFriends.length === 0) return;
    const firestore = db;
    setIsInviting(true);
    try {
      const batch = writeBatch(firestore);
      const profiles = await Promise.all(
        selectedFriends.map(async (uid) => {
          const p = await getUserLite(uid);
          return { uid, profile: p };
        }),
      );
      const newMembers = profiles.map(({ uid, profile }) => ({
        userId: uid,
        name: profile?.name || profile?.displayName || 'New Player',
        email: profile?.email || '',
        rating: 1000,
        wins: 0,
        losses: 0,
        date: new Date().toISOString(),
        role: 'editor' as const,
      }));
      selectedFriends.forEach((uid) =>
        batch.update(doc(firestore, 'users', uid), {
          rooms: arrayUnion(roomId),
        }),
      );
      batch.update(doc(firestore, config.collections.rooms, roomId), {
        members: arrayUnion(...newMembers),
        memberIds: arrayUnion(...selectedFriends),
      });
      await batch.commit();
      toast({ title: t('Invitations Sent') });
      setSelectedFriends([]);
    } catch (e) {
      console.error(e);
      toast({ title: t('Error'), variant: 'destructive' });
    } finally {
      setIsInviting(false);
    }
  };

  const handleRemovePlayer = async (uid: string) => {
    if (!room || !db || !canManageRoom) return;
    const firestore = db;
    try {
      const batch = writeBatch(firestore);
      const member = members.find((m) => m.userId === uid);
      batch.update(doc(firestore, config.collections.rooms, roomId), {
        memberIds: arrayRemove(uid),
        members: member ? arrayRemove(member) : undefined,
      });
      batch.update(doc(firestore, 'users', uid), {
        rooms: arrayRemove(roomId),
      });
      await batch.commit();
      toast({ title: t('Player removed') });
    } catch (e) {
      console.error(e);
      toast({ title: t('Error'), variant: 'destructive' });
    }
  };

  if (accessDenied)
    return (
      <Dialog open>
        <DialogContent className='glass-panel border-0 rounded-3xl'>
          <DialogHeader>
            <DialogTitle>{t('Private Room')}</DialogTitle>
            <DialogDescription>
              {t('This room is private. Redirecting...')}
            </DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    );
  if (!hasMounted || isLoading || !room)
    return (
      <div className='flex items-center justify-center min-h-screen'>
        <div className='animate-pulse h-16 w-16 rounded-full bg-primary/20 blur-sm' />
      </div>
    );

  return (
    <ProtectedRoute>
      <div className='container mx-auto py-8 px-4 max-w-7xl'>
        <Button
          variant='ghost'
          className='mb-4 -ml-2 text-muted-foreground hover:text-foreground rounded-full h-10 transition-all'
          onClick={() => router.push('/rooms')}
        >
          <ArrowLeft className='mr-2 h-4 w-4' /> {t('Back to Rooms')}
        </Button>

        <RoomHeader
          room={room}
          members={members}
          isMember={!!isMember}
          hasPendingRequest={!!room.joinRequests?.includes(user?.uid ?? '')}
          isCreator={isCreator}
          onJoin={() => {
            if (!db) return;
            updateDoc(doc(db, config.collections.rooms, roomId), {
              joinRequests: arrayUnion(user!.uid),
            });
          }}
          onCancelJoin={() => {
            if (!db) return;
            updateDoc(doc(db, config.collections.rooms, roomId), {
              joinRequests: arrayRemove(user!.uid),
            });
          }}
          onLeave={() => router.push('/rooms')}
        />

        <div className='space-y-4 mb-10'>
          {room.isArchived && (
            <Alert
              variant='destructive'
              className='rounded-2xl border-0 shadow-md'
            >
              <Archive className='h-4 w-4' />
              <AlertTitle>{t('Archived Room')}</AlertTitle>
              <AlertDescription>
                {t('This room is read-only.')}
              </AlertDescription>
            </Alert>
          )}
          {!room.isArchived && latestSeason && (
            <Alert className='border-0 bg-amber-50 dark:bg-amber-950/20 text-amber-800 dark:text-amber-400 rounded-2xl shadow-md ring-1 ring-amber-200 dark:ring-amber-900'>
              <Clock className='h-4 w-4 text-amber-600' />
              <AlertTitle>{t('Season Finished')}</AlertTitle>
              <AlertDescription>
                {t('Matches are paused until a new season starts.')}
              </AlertDescription>
            </Alert>
          )}
        </div>

        <div className='grid grid-cols-1 lg:grid-cols-12 gap-8 mb-12'>
          <div className='lg:col-span-4 space-y-6'>
            <Card className='shadow-xl border-0 rounded-[2rem] bg-card glass-panel'>
              <CardHeader className='px-6 pt-6 pb-2'>
                <CardTitle className='text-xl font-bold flex items-center gap-2'>
                  <UserPlus className='w-5 h-5 text-primary' />
                  {t('Players')}
                </CardTitle>
              </CardHeader>
              <CardContent className='px-6 pb-6'>
                <MembersList
                  members={playersOnlyMembers}
                  room={room}
                  isCreator={isCreator}
                  canManage={canManageRoom}
                  currentUser={user}
                  onRemovePlayer={handleRemovePlayer}
                />
                {isMember && !latestSeason && !room.isArchived && (
                  <div className='mt-8 pt-6 border-t border-border/40'>
                    <h4 className='font-bold text-sm mb-4 uppercase tracking-widest text-muted-foreground'>
                      {t('Invite Friends')}
                    </h4>
                    <ScrollArea className='h-[180px] border-0 ring-1 ring-black/5 rounded-2xl bg-muted/20 p-2 shadow-inner'>
                      {friendsAll.concat(othersInSport).map((p) => (
                        <label
                          key={p.uid}
                          className='flex items-center gap-3 p-2 rounded-xl hover:bg-background cursor-pointer transition-colors'
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
                                      (id) => id !== p.uid,
                                    ),
                                  )
                            }
                          />
                          <Avatar className='h-8 w-8'>
                            <AvatarImage src={p.photoURL || undefined} />
                            <AvatarFallback className='text-xs'>
                              {(p.name || '?')[0]}
                            </AvatarFallback>
                          </Avatar>
                          <span className='truncate text-sm font-semibold'>
                            {p.name || p.displayName}
                          </span>
                        </label>
                      ))}
                    </ScrollArea>
                    <Button
                      onClick={handleInviteFriends}
                      disabled={isInviting || selectedFriends.length === 0}
                      className='w-full mt-4 h-12 rounded-xl font-bold shadow-md'
                    >
                      {isInviting ? t('Sending...') : t('Send Invites')}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>

            {(isCreator || isGlobalAdmin) &&
              room.mode === 'derby' &&
              debugMode && (
                <div className='p-4 rounded-3xl border border-red-500/20 bg-red-500/5 space-y-4'>
                  <p className='text-[10px] uppercase font-black text-red-600 dark:text-red-400 tracking-widest text-center'>
                    {t('Admin Dev Mode')}
                  </p>
                  <Button
                    variant='destructive'
                    className='w-full rounded-xl font-bold'
                    onClick={() => {
                      if (confirm(t('Reset ELO and update Hall of Fame?')))
                        handleForceEndSprint();
                    }}
                  >
                    {t('Force End Sprint')}
                  </Button>
                </div>
              )}
          </div>

          <div className='lg:col-span-8'>
            {isMember && !latestSeason && !room.isArchived ? (
              <RecordBlock
                members={playersOnlyMembers}
                roomId={roomId}
                room={room}
                isCreator={isCreator}
                isGlobalAdmin={isGlobalAdmin}
                onFinishSeason={handleFinishSeason}
              />
            ) : (
              <Card className='h-full border-0 rounded-[2rem] glass-panel bg-muted/20 flex items-center justify-center p-8 text-center'>
                <div className='max-w-xs space-y-2'>
                  <Lock className='w-10 h-10 mx-auto opacity-20' />
                  <h3 className='font-bold text-lg opacity-40'>
                    {t('Join this room to record matches')}
                  </h3>
                </div>
              </Card>
            )}
          </div>
        </div>

        <div className='space-y-12'>
          {(canManageRoom || isGlobalAdmin) &&
            room.mode === 'derby' &&
            debugMode && (
              <section className='animate-in slide-in-from-bottom-4 duration-1000'>
                <DerbySimulator
                  roomId={roomId}
                  members={playersOnlyMembers}
                  sport={sport}
                />
              </section>
            )}

          <section className='animate-in fade-in duration-1000'>
            {room.mode === 'derby' ? (
              <Tabs defaultValue='derby' className='w-full'>
                <TabsList className='mb-8 grid w-full max-w-2xl mx-auto grid-cols-3 p-1.5 bg-muted/30 rounded-2xl ring-1 ring-black/5 dark:ring-white/10 backdrop-blur-xl h-auto min-h-[3.5rem]'>
                  <TabsTrigger
                    value='derby'
                    className='rounded-xl h-auto py-2.5 text-xs sm:text-sm font-bold gap-2'
                  >
                    <Zap className='w-4 h-4 hidden sm:block' />
                    {t('Events')}
                  </TabsTrigger>
                  <TabsTrigger
                    value='hof'
                    className='rounded-xl h-auto py-2.5 text-xs sm:text-sm font-bold gap-2'
                  >
                    <Trophy className='w-4 h-4 hidden sm:block' />
                    {t('Hall of Fame')}
                  </TabsTrigger>
                  <TabsTrigger
                    value='matches'
                    className='rounded-xl h-auto py-2.5 text-xs sm:text-sm font-bold gap-2'
                  >
                    <History className='w-4 h-4 hidden sm:block' />
                    {t('History')}
                  </TabsTrigger>
                </TabsList>
                <TabsContent
                  value='derby'
                  className='mt-0 text-left animate-in fade-in zoom-in-95 duration-500'
                >
                  <DerbyFeed
                    room={room}
                    members={playersOnlyMembers}
                    matches={recentMatches}
                  />
                </TabsContent>
                <TabsContent
                  value='hof'
                  className='mt-0 text-left animate-in fade-in zoom-in-95 duration-500'
                >
                  <DerbyHallOfFame room={room} />
                </TabsContent>
                <TabsContent
                  value='matches'
                  className='mt-0 text-left animate-in fade-in zoom-in-95 duration-500'
                >
                  <RecentMatches matches={recentMatches} />
                </TabsContent>
              </Tabs>
            ) : (
              <div className='text-left'>
                <div className='flex items-center gap-3 mb-6 px-2'>
                  <div className='bg-primary/10 p-2 rounded-xl text-primary ring-1 ring-primary/20 shadow-sm'>
                    <History className='w-5 h-5' />
                  </div>
                  <h2 className='text-2xl font-black tracking-tight'>
                    {t('Match History')}
                  </h2>
                </div>
                <RecentMatches matches={recentMatches} />
              </div>
            )}
          </section>

          <section className='animate-in fade-in duration-700'>
            <div className='flex items-center gap-3 mb-6 px-2'>
              <div className='bg-primary/10 p-2 rounded-xl text-primary ring-1 ring-primary/20 shadow-sm'>
                <LayoutDashboard className='w-5 h-5' />
              </div>
              <h2 className='text-2xl font-black tracking-tight'>
                {t('Leaderboard')}
              </h2>
            </div>
            <StandingsTable
              players={playersOnlyMembers}
              latestSeason={latestSeason}
              roomCreatorId={room.createdBy || room.creator || ''}
              roomMode={room.mode || 'office'}
            />
          </section>
        </div>
      </div>
    </ProtectedRoute>
  );
}
