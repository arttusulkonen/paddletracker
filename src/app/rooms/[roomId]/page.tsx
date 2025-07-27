// src/app/rooms/[roomId]/page.tsx
'use client';

import { ProtectedRoute } from '@/components/ProtectedRoutes';
import { RecordBlock } from '@/components/RecordBlock';
import { MembersList } from '@/components/rooms/MembersList';
import { RecentMatches } from '@/components/rooms/RecentMatches';
import { RoomHeader } from '@/components/rooms/RoomHeader';
import { StandingsTable } from '@/components/rooms/StandingsTable';
import { Button, Card, CardContent, Separator } from '@/components/ui';
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

// --- Вспомогательные функции ---
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

  // --- Состояния ---
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

  // Загрузка данных комнаты
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

  // Загрузка матчей
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

  // Синхронизация данных
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
    rawMatches.forEach((m) => {
      const winnerId =
        m.player1.scores > m.player2.scores ? m.player1Id : m.player2Id;
      [m.player1Id, m.player2Id].forEach((id) => {
        if (!matchStats[id]) matchStats[id] = { wins: 0, losses: 0 };
        id === winnerId ? matchStats[id].wins++ : matchStats[id].losses++;
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
        ratingVisible: total >= 5,
        wins,
        losses,
        totalMatches: total,
        winPct: calcWinPct(wins, losses),
        deltaRoom:
          (m.rating || 1000) - (seasonStarts[m.userId] ?? m.rating ?? 1000),
        globalDelta:
          (m.globalElo ?? 1000) -
          (seasonStarts[m.userId] ?? m.globalElo ?? 1000),
        avgPtsPerMatch:
          total > 0
            ? ((m.rating || 1000) -
                (seasonStarts[m.userId] ?? m.rating ?? 1000)) /
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
      // ✅ **ИСПРАВЛЕНИЕ**: Передаем `sport` в функцию
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
          <CardContent className='p-6 grid md:grid-cols-3 gap-6'>
            <div className='md:col-span-1'>
              <MembersList members={regularPlayers} room={room} />
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
