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
  Checkbox,
  Label,
  ScrollArea,
  Separator,
} from '@/components/ui';
import { useAuth } from '@/contexts/AuthContext';
import { useSport } from '@/contexts/SportContext';
import { useToast } from '@/hooks/use-toast';
import { db } from '@/lib/firebase';
import * as Friends from '@/lib/friends';
import { finalizeSeason } from '@/lib/season';
import type { Match, Room, UserProfile } from '@/lib/types';
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

  const [room, setRoom] = useState<Room | null>(null);
  const [rawMatches, setRawMatches] = useState<Match[]>([]);
  const [members, setMembers] = useState<Room['members']>([]);
  const [recentMatches, setRecentMatches] = useState<Match[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [latestSeason, setLatestSeason] = useState<any | null>(null);
  const [seasonStarts, setSeasonStarts] = useState<Record<string, number>>({});
  const [seasonRoomStarts, setSeasonRoomStarts] = useState<
    Record<string, number>
  >({});
  const [hasMounted, setHasMounted] = useState(false);

  const [friends, setFriends] = useState<UserProfile[]>([]);
  const [selectedFriends, setSelectedFriends] = useState<string[]>([]);
  const [isInviting, setIsInviting] = useState(false);

  useEffect(() => {
    setHasMounted(true);
  }, []);

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
        setRoom(roomData);
        setLatestSeason(roomData.seasonHistory?.slice().reverse()[0] ?? null);
      }
    );
    return () => unsubRoom();
  }, [user, roomId, config.collections.rooms, router]);

  const canManageRoom = useMemo(() => {
    if (!room || !user) return false;
    const isRoomAdmin =
      Array.isArray(room.adminIds) && room.adminIds.includes(user.uid);
    return isGlobalAdmin || isRoomAdmin || room.creator === user.uid;
  }, [room, user, isGlobalAdmin]);

  useEffect(() => {
    if (!user || !db) return;
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
  }, [user, roomId, config.collections.matches]);

  useEffect(() => {
    const fetchFriends = async () => {
      if (userProfile?.friends && userProfile.friends.length > 0) {
        const friendProfiles = await Friends.getMultipleUsersLite(
          userProfile.friends
        );
        setFriends(friendProfiles);
      }
    };
    fetchFriends();
  }, [userProfile]);

  const inviteCandidates = useMemo(() => {
    if (!room) return [];
    const memberIds = new Set(room.members.map((m) => m.userId));
    return friends.filter((friend) => !memberIds.has(friend.uid));
  }, [friends, room]);

  useEffect(() => {
    if (!room) return;
    if (rawMatches.length === 0 && room.members) {
      setMembers(room.members);
      setRecentMatches([]);
      setIsLoading(false);
      return;
    }

    const syncData = async () => {
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
      const initialMembers = room.members ?? [];
      if (initialMembers.length === 0) {
        setMembers([]);
        setRecentMatches([]);
        setIsLoading(false);
        return;
      }

      const memberIds = initialMembers.map((m) => m.userId);
      const userDocsPromises = memberIds.map((id) =>
        getDoc(doc(db, 'users', id))
      );
      const userDocsSnaps = await Promise.all(userDocsPromises);
      const freshProfiles = new Map<string, UserProfile>();
      userDocsSnaps.forEach((userSnap) => {
        if (userSnap.exists()) {
          freshProfiles.set(userSnap.id, userSnap.data() as UserProfile);
        }
      });

      const syncedMembers = initialMembers
        .filter((member) => !freshProfiles.get(member.userId)?.isDeleted)
        .map((member) => {
          const freshProfile = freshProfiles.get(member.userId);
          return freshProfile
            ? {
                ...member,
                name:
                  freshProfile.name ?? freshProfile.displayName ?? member.name,
                photoURL: freshProfile.photoURL,
                globalElo: freshProfile.sports?.[sport]?.globalElo,
                rank: freshProfile.rank,
              }
            : member;
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
          newMatch.player1.name = p1Profile.name ?? p1Profile.displayName;
        if (p2Profile)
          newMatch.player2.name = p2Profile.name ?? p2Profile.displayName;
        const winnerId =
          match.player1.scores > match.player2.scores
            ? match.player1Id
            : match.player2Id;
        const winnerProfile = freshProfiles.get(winnerId);
        if (winnerProfile)
          newMatch.winner = winnerProfile.name ?? winnerProfile.displayName;
        return newMatch;
      });
      setRecentMatches(syncedMatches.slice().reverse());
      setIsLoading(false);
    };
    syncData();
  }, [room, rawMatches, sport, t]);

  const last5Form = useCallback(
    (m: any): MiniMatch[] =>
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
    const matchStats: Record<string, { wins: number; losses: number }> = {};
    const latestRoomRatings: Record<string, number> = {};
    rawMatches.forEach((m) => {
      const winnerId =
        m.player1.scores > m.player2.scores ? m.player1Id : m.player2Id;
      [m.player1Id, m.player2Id].forEach((id) => {
        if (!matchStats[id]) matchStats[id] = { wins: 0, losses: 0 };
        id === winnerId ? matchStats[id].wins++ : matchStats[id].losses++;
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

    return members.map((m: any) => {
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
        ratingVisible: total >= 5,
        wins,
        losses,
        totalMatches: total,
        winPct: calcWinPct(wins, losses),
        deltaRoom:
          currentRating - (seasonRoomStarts[m.userId] ?? currentRating),
        globalDelta:
          (m.globalElo ?? 1000) -
          (seasonStarts[m.userId] ?? m.globalElo ?? 1000),
        avgPtsPerMatch:
          total > 0
            ? (currentRating - +(seasonRoomStarts[m.userId] ?? currentRating)) /
              total
            : 0,
        last5Form: last5Form(m),
        longestWinStreak: max,
      };
    });
  }, [members, rawMatches, seasonStarts, sport, last5Form]);

  const getSeasonEloSnapshots = useCallback(
    async (roomId: string): Promise<StartEndElo> => {
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
    if (!user || !room) return;
    await updateDoc(doc(db, config.collections.rooms, roomId), {
      joinRequests: arrayUnion(user.uid),
    });
    toast({ title: t('Request Sent') });
  }, [user, room, roomId, config.collections.rooms, toast, t]);

  const handleCancelRequestToJoin = useCallback(async () => {
    if (!user || !room) return;
    await updateDoc(doc(db, config.collections.rooms, roomId), {
      joinRequests: arrayRemove(user.uid),
    });
    toast({ title: t('Request Canceled') });
  }, [user, room, roomId, config.collections.rooms, toast, t]);

  const handleLeaveRoom = useCallback(async () => {
    if (!user || !room) return;
    const memberToRemove = room.members.find((m) => m.userId === user.uid);
    if (memberToRemove) {
      await updateDoc(doc(db, config.collections.rooms, roomId), {
        members: arrayRemove(memberToRemove),
        memberIds: arrayRemove(user.uid),
      });
      toast({ title: t("You've left the room") });
      router.push('/rooms');
    }
  }, [user, room, roomId, config.collections.rooms, router, toast, t]);

  const handleInviteFriends = async () => {
    if (!user || !room || selectedFriends.length === 0) {
      toast({
        title: 'Select friends to invite',
        variant: 'destructive',
      });
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

      const batch = writeBatch(db);
      const roomRef = doc(db, config.collections.rooms, roomId);

      const newMembers = selectedFriends.map((uid) => {
        const friend = friends.find((f) => f.uid === uid);
        const userRef = doc(db, 'users', uid);
        batch.update(userRef, { rooms: arrayUnion(roomId) });
        return {
          userId: uid,
          name: friend?.name ?? friend?.displayName ?? 'New Player',
          email: friend?.email ?? '',
          rating: 1000,
          wins: 0,
          losses: 0,
          date: new Date().toISOString(),
          role: 'editor',
        };
      });

      batch.update(roomRef, {
        members: arrayUnion(...newMembers),
        memberIds: arrayUnion(...selectedFriends),
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
    if (!room || !user) return;

    const memberToRemove = room.members.find(
      (m) => m.userId === userIdToRemove
    );
    if (!memberToRemove) {
      toast({ title: 'Player not found in this room', variant: 'destructive' });
      return;
    }

    try {
      const isStillCreator = room.creator === user.uid;
      const isRoomAdmin =
        Array.isArray(room.adminIds) && room.adminIds.includes(user.uid);
      const canManage = isGlobalAdmin || isStillCreator || isRoomAdmin;

      if (!canManage) {
        toast({
          title: t('Permission Denied'),
          description: t('You do not have rights to remove players.'),
          variant: 'destructive',
        });
        return;
      }

      const batch = writeBatch(db);
      const roomRef = doc(db, config.collections.rooms, roomId);
      batch.update(roomRef, {
        members: arrayRemove(memberToRemove),
        memberIds: arrayRemove(userIdToRemove),
      });

      const userRef = doc(db, 'users', userIdToRemove);
      batch.update(userRef, {
        rooms: arrayRemove(roomId),
      });

      await batch.commit();

      toast({ title: 'Player removed successfully' });
    } catch (error) {
      console.error('Failed to remove player:', error);
      toast({
        title: 'Error',
        description: 'Failed to remove player from the room.',
        variant: 'destructive',
      });
    }
  };

  const isMember = useMemo(
    () => room?.members.some((m) => m.userId === user?.uid),
    [user, room]
  );
  const isCreator = useMemo(() => room?.creator === user?.uid, [user, room]);
  const hasPendingRequest = useMemo(
    () => room?.joinRequests?.includes(user?.uid ?? ''),
    [user, room]
  );

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
          isMember={isMember}
          hasPendingRequest={hasPendingRequest}
          isCreator={isCreator}
          onJoin={handleRequestToJoin}
          onCancelJoin={handleCancelRequestToJoin}
          onLeave={handleLeaveRoom}
        />
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
              {isMember && (
                <div className='pt-4 border-t'>
                  <Label className='text-sm font-medium'>
                    {t('Invite players:')}
                  </Label>
                  <ScrollArea className='h-32 mt-2 border rounded-md p-2'>
                    {inviteCandidates.length > 0 ? (
                      inviteCandidates.map((p) => {
                        const displayName = p.name ?? p.displayName ?? '?';
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
                                <AvatarImage src={p.photoURL ?? undefined} />
                                <AvatarFallback>
                                  {displayName.charAt(0)}
                                </AvatarFallback>
                              </Avatar>
                              <span>{displayName}</span>
                            </div>
                          </label>
                        );
                      })
                    ) : (
                      <p className='text-muted-foreground text-sm text-center py-4'>
                        {t('No friends available to invite.')}
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
          roomCreatorId={room.creator}
        />
        <RecentMatches matches={recentMatches} />
      </div>
    </ProtectedRoute>
  );
}
