// src/app/rooms/[roomId]/page.tsx
'use client';

import { ProtectedRoute } from '@/components/ProtectedRoutes';
import { RecordBlock } from '@/components/RecordBlock';
import { MembersList } from '@/components/rooms/MembersList';
import { RecentMatches } from '@/components/rooms/RecentMatches';
import { RoomHeader } from '@/components/rooms/RoomHeader';
import { StandingsTable } from '@/components/rooms/StandingsTable';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
  Button,
  Card,
  CardContent,
  Separator,
} from '@/components/ui';
import { useAuth } from '@/contexts/AuthContext';
import { useSport } from '@/contexts/SportContext';
import { useToast } from '@/hooks/use-toast';
import { db } from '@/lib/firebase';
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
  const { user } = useAuth();
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
  const [hasMounted, setHasMounted] = useState(false);

  useEffect(() => {
    setHasMounted(true);
  }, []);

  useEffect(() => {
    if (!user || !db) return;
    const unsubRoom = onSnapshot(
      doc(db, config.collections.rooms, roomId),
      (roomSnap) => {
        if (!roomSnap.exists()) {
          toast({ title: t('Room not found'), variant: 'destructive' });
          router.push('/rooms');
          return;
        }
        const roomData = { id: roomSnap.id, ...roomSnap.data() } as Room;
        setRoom(roomData);
        const latest =
          roomData.seasonHistory
            ?.slice()
            .reverse()
            .find(
              (s) => Array.isArray(s.summary) || Array.isArray(s.members)
            ) ?? null;
        setLatestSeason(latest);
      }
    );
    return () => unsubRoom();
  }, [user, roomId, config.collections.rooms, router, t, toast]);

  useEffect(() => {
    if (!user || !db) return;
    const matchesQuery = query(
      collection(db, config.collections.matches),
      where('roomId', '==', roomId)
    );
    const unsubMatches = onSnapshot(matchesQuery, (matchesSnap) => {
      const allMatches = matchesSnap.docs
        .map((d) => ({ id: d.id, ...d.data() } as Match))
        .sort((a, b) => tsToMs(a.tsIso) - tsToMs(b.tsIso));
      setRawMatches(allMatches);
    });
    return () => unsubMatches();
  }, [user, roomId, config.collections.matches]);

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
      rawMatches.forEach((m) => {
        const p1 = m.player1Id,
          p2 = m.player2Id;
        if (starts[p1] == null) starts[p1] = m.player1.oldRating;
        if (starts[p2] == null) starts[p2] = m.player2.oldRating;
      });
      setSeasonStarts(starts);

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

  // ✅ **ИСПРАВЛЕНИЕ**: Возвращаем функцию `last5Form`
  const last5Form = (m: any): MiniMatch[] =>
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
      });

  const matchStats = useMemo(() => {
    const st: Record<string, { wins: number; losses: number }> = {};
    rawMatches.forEach((m) => {
      const winnerId =
        m.player1.scores > m.player2.scores ? m.player1Id : m.player2Id;
      [m.player1Id, m.player2Id].forEach((id) => {
        if (!st[id]) st[id] = { wins: 0, losses: 0 };
        id === winnerId ? st[id].wins++ : st[id].losses++;
      });
    });
    return st;
  }, [rawMatches]);

  const tennisStats = useMemo(() => {
    if (sport !== 'tennis') return {};
    const stats: Record<
      string,
      { aces: number; doubleFaults: number; winners: number }
    > = {};
    rawMatches.forEach((m) => {
      // Суммируем статистику для каждого игрока из каждого матча
      const p1Id = m.player1Id;
      const p2Id = m.player2Id;
      const p1 = m.player1;
      const p2 = m.player2;

      if (!stats[p1Id]) stats[p1Id] = { aces: 0, doubleFaults: 0, winners: 0 };
      if (!stats[p2Id]) stats[p2Id] = { aces: 0, doubleFaults: 0, winners: 0 };

      stats[p1Id].aces += Number(p1.aces) || 0;
      stats[p1Id].doubleFaults += Number(p1.doubleFaults) || 0;
      stats[p1Id].winners += Number(p1.winners) || 0;

      stats[p2Id].aces += Number(p2.aces) || 0;
      stats[p2Id].doubleFaults += Number(p2.doubleFaults) || 0;
      stats[p2Id].winners += Number(p2.winners) || 0;
    });
    return stats;
  }, [rawMatches, sport]);

  const regularPlayers = useMemo(() => {
    return members.map((m: any) => {
      const wins = matchStats[m.userId]?.wins ?? 0;
      const losses = matchStats[m.userId]?.losses ?? 0;
      const total = wins + losses;
      const globalStart = seasonStarts[m.userId] ?? m.globalElo ?? 1000;
      const globalDelta = (m.globalElo ?? globalStart) - globalStart;
      const seasonDeltaRoom = (m.rating || 1000) - (m.startRating ?? 1000);
      const avgPtsPerMatch = total > 0 ? seasonDeltaRoom / total : 0;

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
        ratingVisible: total >= 5,
        wins,
        losses,
        totalMatches: total,
        winPct: calcWinPct(wins, losses),
        deltaRoom: seasonDeltaRoom,
        globalDelta,
        avgPtsPerMatch,
        last5Form: last5Form(m), // ✅ **ИСПРАВЛЕНИЕ**: Возвращаем вызов функции
        longestWinStreak: max,
      };
    });
  }, [
    members,
    rawMatches,
    matchStats,
    seasonStarts,
    tennisStats,
    recentMatches,
  ]);

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
          <ArrowLeft className='mr-2 h-4 w-4' />
          {t('Back to Rooms')}
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
          <CardContent className='p-6 grid md:grid-cols-3 gap-6'>
            <div className='md:col-span-1'>
              <MembersList members={regularPlayers} room={room} />
            </div>
            {isMember && !latestSeason && !room.isArchived && (
              <div className='md:col-span-2'>
                <RecordBlock members={members} roomId={roomId} room={room} />
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
