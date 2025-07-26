// src/app/rooms/[roomId]/page.tsx
'use client';

import { ProtectedRoute } from '@/components/ProtectedRoutes';
import { RecordBlock } from '@/components/RecordBlock';
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
  Avatar,
  AvatarFallback,
  AvatarImage,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Checkbox,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Input,
  Label,
  ScrollArea,
  Separator,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui';
import { useAuth } from '@/contexts/AuthContext';
import { useSport } from '@/contexts/SportContext';
import { useToast } from '@/hooks/use-toast';
import { processAndSaveMatches } from '@/lib/elo';
import { db } from '@/lib/firebase';
import { finalizeSeason } from '@/lib/season';
import type { Match, Room, UserProfile } from '@/lib/types';
import { getFinnishFormattedDate } from '@/lib/utils';
import { parseFlexDate, safeFormatDate } from '@/lib/utils/date';
import {
  addDoc,
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
import {
  ArrowLeft,
  Crown,
  LogIn,
  LogOut,
  MailPlus,
  Plus,
  Settings,
  Shield,
  ShieldCheck,
  ShieldOff,
  Sword,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

/* --- Helpers --- */
const calcWinPct = (w: number, l: number) => {
  const t = w + l;
  return t ? ((w / t) * 100).toFixed(1) : '0.0';
};
const tsToMs = (v?: string) => {
  const ms = parseFlexDate(v ?? '').getTime();
  return isNaN(ms) ? Date.parse(v ?? '') || 0 : ms;
};
const flip = (s: string) =>
  s === 'left' ? 'right' : s === 'right' ? 'left' : '';
type StartEndElo = Record<string, { start: number; end: number }>;
function getRank(elo: number, t: (key: string) => string) {
  if (elo < 1001) return t('Ping-Pong Padawan');
  if (elo < 1100) return t('Table-Tennis Trainee');
  if (elo < 1200) return t('Racket Rookie');
  if (elo < 1400) return t('Paddle Prodigy');
  if (elo < 1800) return t('Spin Sensei');
  if (elo < 2000) return t('Smash Samurai');
  return t('Ping-Pong Paladin');
}

/* --- Main Component --- */
export default function RoomPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { sport, config } = useSport();
  const { toast } = useToast();
  const router = useRouter();
  const roomId = useParams().roomId as string;

  const [room, setRoom] = useState<Room | null>(null);
  const [members, setMembers] = useState<Room['members']>([]);
  const [recent, setRecent] = useState<Match[]>([]);
  const [seasonStarts, setSeasonStarts] = useState<Record<string, number>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [latestSeason, setLatestSeason] = useState<any | null>(null);
  const [viewMode, setViewMode] = useState<'regular' | 'final'>('regular');
  const [sortConfig, setSortConfig] = useState<{
    key: string;
    dir: 'asc' | 'desc';
  }>({ key: 'rating', dir: 'desc' });
  const [hasMounted, setHasMounted] = useState(false);

  useEffect(() => {
    setHasMounted(true);
  }, []);

  useEffect(() => {
    if (latestSeason) setViewMode('final');
  }, [latestSeason]);

  useEffect(() => {
    if (!user) {
      return;
    }
    if (!db) {
      console.error('Firestore (db) is not initialized!');
      return;
    }

    let unsubMatches = () => {};

    const unsubRoom = onSnapshot(
      doc(db, config.collections.rooms, roomId),
      (roomSnap) => {
        if (!roomSnap.exists()) {
          console.error('Room does not exist, redirecting.');
          router.push('/rooms');
          return;
        }
        const roomData = { id: roomSnap.id, ...roomSnap.data() } as Room;
        setRoom(roomData);

        unsubMatches();

        const matchesQuery = query(
          collection(db, config.collections.matches),
          where('roomId', '==', roomId)
        );

        unsubMatches = onSnapshot(
          matchesQuery,
          async (matchesSnap) => {
            try {
              const allMatches = matchesSnap.docs
                .map((d) => ({ id: d.id, ...(d.data() as any) } as Match))
                .sort(
                  (a, b) =>
                    tsToMs((a as any).timestamp) - tsToMs((b as any).timestamp)
                );

              const starts: Record<string, number> = {};
              allMatches.forEach((m) => {
                const p1 = m.player1Id,
                  p2 = m.player2Id;
                if (starts[p1] == null) starts[p1] = m.player1.oldRating;
                if (starts[p2] == null) starts[p2] = m.player2.oldRating;
              });
              setSeasonStarts(starts);

              const initialMembers = roomData.members ?? [];

              if (initialMembers.length > 0) {
                const memberIds = initialMembers.map((m) => m.userId);
                const userDocsPromises = memberIds.map((id) =>
                  getDoc(doc(db, 'users', id))
                );
                const userDocsSnaps = await Promise.all(userDocsPromises);
                const freshProfiles = new Map<string, UserProfile>();
                userDocsSnaps.forEach((userSnap) => {
                  if (userSnap.exists()) {
                    freshProfiles.set(
                      userSnap.id,
                      userSnap.data() as UserProfile
                    );
                  }
                });

                const syncedMembers = initialMembers
                  .filter(
                    (member) => !freshProfiles.get(member.userId)?.isDeleted
                  )
                  .map((member) => {
                    const freshProfile = freshProfiles.get(member.userId);
                    return freshProfile
                      ? {
                          ...member,
                          name:
                            freshProfile.name ??
                            freshProfile.displayName ??
                            member.name,
                          photoURL: freshProfile.photoURL,
                          globalElo: freshProfile.sports?.[sport]?.globalElo,
                          maxRating: freshProfile.maxRating,
                          rank: freshProfile.rank,
                          isDeleted: freshProfile.isDeleted ?? false,
                        }
                      : member;
                  });
                setMembers(syncedMembers);

                const syncedMatches = allMatches.map((match) => {
                  const p1Profile = freshProfiles.get(match.player1Id);
                  const p2Profile = freshProfiles.get(match.player2Id);
                  const newMatch = JSON.parse(JSON.stringify(match));

                  if (p1Profile?.isDeleted)
                    newMatch.player1.name = t('Deleted Player');
                  else if (p1Profile)
                    newMatch.player1.name =
                      p1Profile.name ??
                      p1Profile.displayName ??
                      match.player1.name;

                  if (p2Profile?.isDeleted)
                    newMatch.player2.name = t('Deleted Player');
                  else if (p2Profile)
                    newMatch.player2.name =
                      p2Profile.name ??
                      p2Profile.displayName ??
                      match.player2.name;

                  const winnerId =
                    match.player1.scores > match.player2.scores
                      ? match.player1Id
                      : match.player2Id;
                  const winnerProfile = freshProfiles.get(winnerId);

                  if (winnerProfile?.isDeleted)
                    newMatch.winner = t('Deleted Player');
                  else if (winnerProfile)
                    newMatch.winner =
                      winnerProfile.name ??
                      winnerProfile.displayName ??
                      match.winner;
                  return newMatch;
                });
                setRecent(syncedMatches.slice().reverse());
              } else {
                setMembers([]);
                setRecent([]);
              }

              setLatestSeason(
                roomData.seasonHistory
                  ?.slice()
                  .reverse()
                  .find(
                    (s) => Array.isArray(s.summary) || Array.isArray(s.members)
                  ) ?? null
              );

              setIsLoading(false);
            } catch (error) {
              console.error('Error inside matches listener:', error);
              setIsLoading(false);
            }
          },
          (error) => {
            console.error('Matches listener failed:', error);
            setIsLoading(false);
          }
        );
      },
      (error) => {
        console.error('Room listener failed:', error);
        setIsLoading(false);
      }
    );

    return () => {
      unsubRoom();
      unsubMatches();
    };
  }, [user, roomId, router, t, sport, config]);

  const getSeasonEloSnapshots = async (
    roomId: string
  ): Promise<StartEndElo> => {
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
      const players: { id: string; old: number; new: number }[] = [
        { id: m.player1Id, old: m.player1.oldRating, new: m.player1.newRating },
        { id: m.player2Id, old: m.player2.oldRating, new: m.player2.newRating },
      ];
      players.forEach((p) => {
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
  };

  const handleFinishSeason = async () => {
    try {
      const eloSnapshots = await getSeasonEloSnapshots(roomId);
      await finalizeSeason(roomId, eloSnapshots, config.collections.rooms);
      toast({ title: t('Season finished') });
      setViewMode('final');
    } catch (err) {
      console.error(err);
      toast({
        title: t('Error'),
        description: t('Failed to finish season'),
        variant: 'destructive',
      });
    }
  };

  const handleRequestToJoin = async () => {
    if (!user || !room) return;
    const roomRef = doc(db, config.collections.rooms, roomId);
    await updateDoc(roomRef, { joinRequests: arrayUnion(user.uid) });
    toast({
      title: t('Request Sent'),
      description: `${t('The room owner has been notified.')}`,
    });
  };

  const handleCancelRequestToJoin = async () => {
    if (!user || !room) return;
    const roomRef = doc(db, config.collections.rooms, roomId);
    await updateDoc(roomRef, { joinRequests: arrayRemove(user.uid) });
    toast({ title: t('Request Canceled') });
  };

  const hasPendingRequest = useMemo(() => {
    if (!user || !room?.joinRequests) return false;
    return room.joinRequests.includes(user.uid);
  }, [user, room]);

  const handleLeaveRoom = async () => {
    if (!user || !room) return;
    const roomRef = doc(db, config.collections.rooms, roomId);
    const memberToRemove = room.members.find((m) => m.userId === user.uid);
    if (memberToRemove) {
      await updateDoc(roomRef, {
        members: arrayRemove(memberToRemove),
        memberIds: arrayRemove(user.uid),
      });
      toast({
        title: t('Success'),
        description: `${t("You've left")} ${room.name}`,
      });
      router.push('/rooms');
    }
  };

  const isMember = useMemo(() => {
    if (!user || !room) return false;
    return room.members.some((m) => m.userId === user.uid);
  }, [user, room]);

  type MiniMatch = { result: 'W' | 'L'; opponent: string; score: string };

  const last5Form = (m: any): MiniMatch[] =>
    recent
      .filter((x) => x.player1Id === m.userId || x.player2Id === m.userId)
      .slice(0, 5)
      .map((x) => {
        const winnerId =
          x.player1.scores > x.player2.scores ? x.player1Id : x.player2Id;
        const win = winnerId === m.userId;
        const youOnLeft = x.player1Id === m.userId;
        const youScore = youOnLeft ? x.player1.scores : x.player2.scores;
        const oppScore = youOnLeft ? x.player2.scores : x.player1.scores;
        const opponent = youOnLeft ? x.player2.name : x.player1.name;
        return {
          result: win ? 'W' : 'L',
          opponent,
          score: `${youScore}-${oppScore}`,
        };
      });

  const bestWinStreak = (m: any) => {
    const arr = recent
      .filter((x) => x.player1Id === m.userId || x.player2Id === m.userId)
      .map((x) => {
        const winnerId =
          x.player1.scores > x.player2.scores ? x.player1Id : x.player2Id;
        return winnerId === m.userId ? 1 : 0;
      });
    let max = 0,
      cur = 0;
    arr.forEach((w) => {
      cur = w ? cur + 1 : 0;
      if (cur > max) max = cur;
    });
    return max;
  };

  const matchStats = useMemo(() => {
    const st: Record<string, { wins: number; losses: number }> = {};
    recent.forEach((m) => {
      const winnerId =
        m.player1.scores > m.player2.scores ? m.player1Id : m.player2Id;
      [m.player1Id, m.player2Id].forEach((id) => {
        if (!st[id]) st[id] = { wins: 0, losses: 0 };
        if (id === winnerId) st[id].wins++;
        else st[id].losses++;
      });
    });
    return st;
  }, [recent]);

  const regularPlayers = useMemo(() => {
    return members
      .map((m) => {
        const wins = matchStats[m.userId]?.wins ?? 0;
        const losses = matchStats[m.userId]?.losses ?? 0;
        const total = wins + losses;
        const globalStart = seasonStarts[m.userId] ?? m.globalElo ?? 1000;
        const globalDelta = (m.globalElo ?? globalStart) - globalStart;
        const seasonDeltaRoom = (m.rating || 0) - (m.startRating ?? 1000);
        const avgPtsPerMatch = total > 0 ? seasonDeltaRoom / total : 0;
        return {
          ...m,
          ratingVisible: total >= 5,
          wins,
          losses,
          totalMatches: total,
          winPct: calcWinPct(wins, losses),
          deltaRoom: seasonDeltaRoom,
          globalDelta,
          avgPtsPerMatch: avgPtsPerMatch,
          last5Form: last5Form(m),
          longestWinStreak: bestWinStreak(m),
        };
      })
      .sort((a: any, b: any) => {
        if (a.ratingVisible !== b.ratingVisible)
          return a.ratingVisible ? -1 : 1;
        const { key, dir } = sortConfig;
        const factor = dir === 'asc' ? 1 : -1;
        if (key === 'winPct')
          return factor * (parseFloat(a.winPct) - parseFloat(b.winPct));
        if (['name'].includes(key))
          return factor * a.name.localeCompare(b.name);
        return factor * ((a as any)[key] - (b as any)[key]);
      });
  }, [members, recent, seasonStarts, sortConfig, matchStats]);

  if (!hasMounted) {
    return null;
  }

  if (isLoading || !room) {
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
        <Card className='mb-8 shadow-xl'>
          <CardHeader className='bg-muted/50 p-6 flex flex-col md:flex-row items-center gap-6'>
            <div className='flex-1 flex items-center gap-6'>
              <Avatar className='h-24 w-24 border-4 border-background shadow-md'>
                <AvatarImage src={room.avatarURL || undefined} />
                <AvatarFallback>{room.name[0]}</AvatarFallback>
              </Avatar>
              <div className='text-center md:text-left'>
                <CardTitle className='text-3xl font-bold'>
                  {room.name}
                </CardTitle>
              </div>
            </div>
            <div>
              {!isMember &&
                room.isPublic &&
                !room.isArchived &&
                (hasPendingRequest ? (
                  <Button onClick={handleCancelRequestToJoin} variant='outline'>
                    <X className='mr-2 h-4 w-4' />
                    {t('Cancel Request')}
                  </Button>
                ) : (
                  <Button onClick={handleRequestToJoin}>
                    <LogIn className='mr-2 h-4 w-4' />
                    {t('Request to Join')}
                  </Button>
                ))}
              {isMember && room.creator !== user?.uid && !room.isArchived && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant='destructive'>
                      <LogOut className='mr-2 h-4 w-4' />
                      {t('Leave Room')}
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>{t('Are you sure?')}</AlertDialogTitle>
                      <AlertDialogDescription>
                        {t(
                          "You will lose access to this room's stats and matches. You can rejoin later if it's a public room."
                        )}
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>{t('Cancel')}</AlertDialogCancel>
                      <AlertDialogAction onClick={handleLeaveRoom}>
                        {t('Yes, Leave')}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
              {isMember && room.creator === user?.uid && (
                <Dialog>
                  <DialogTrigger asChild>
                    <Button variant='outline' size='icon'>
                      <Settings className='h-4 w-4' />
                    </Button>
                  </DialogTrigger>
                  <RoomSettingsDialog room={room} />
                </Dialog>
              )}
            </div>
          </CardHeader>
          <CardContent className='p-6 grid md:grid-cols-3 gap-6'>
            <MembersBlock
              members={regularPlayers}
              room={room}
              roomId={roomId}
              t={t}
            />
            {isMember && !latestSeason && !room.isArchived && (
              <RecordBlock members={members} roomId={roomId} room={room} />
            )}
            {isMember &&
              !latestSeason &&
              room.creator === user?.uid &&
              !room.isArchived && (
                <div className='md:col-span-3 text-right'>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant='destructive'>
                        {t('Finish Season')}
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>
                          {t('Are you absolutely sure?')}
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                          {t(
                            'This action will close the current season for this room. All standings will be finalized, and no new matches can be recorded for this season. This cannot be undone.'
                          )}
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>{t('Cancel')}</AlertDialogCancel>
                        <AlertDialogAction onClick={handleFinishSeason}>
                          {t('Yes, Finish Season')}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              )}
          </CardContent>
        </Card>
        <Separator className='my-8' />
        <Card className='shadow-lg mb-8'>
          <CardHeader>
            <div className='flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4'>
              <CardTitle>{t('Standings')}</CardTitle>
              {latestSeason && (
                <div className='flex gap-2'>
                  <Button
                    size='sm'
                    variant={viewMode === 'regular' ? 'default' : 'outline'}
                    onClick={() => setViewMode('regular')}
                  >
                    {t('Regular')}
                  </Button>
                  <Button
                    size='sm'
                    variant={viewMode === 'final' ? 'default' : 'outline'}
                    onClick={() => setViewMode('final')}
                  >
                    {t('Final')}
                  </Button>
                </div>
              )}
            </div>
            <CardDescription>
              {viewMode === 'regular'
                ? t('Live season standings')
                : t('Season awards (final)')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {viewMode === 'regular' && (
              <ScrollArea>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>#</TableHead>
                      <TableHead
                        className='cursor-pointer'
                        onClick={() =>
                          setSortConfig((s) => ({
                            key: 'name',
                            dir: s.dir === 'asc' ? 'desc' : 'asc',
                          }))
                        }
                      >
                        {t('Player')}
                      </TableHead>
                      <TableHead
                        className='cursor-pointer'
                        onClick={() =>
                          setSortConfig((s) => ({
                            key: 'rating',
                            dir: s.dir === 'asc' ? 'desc' : 'asc',
                          }))
                        }
                      >
                        {t('Room Rating')}
                      </TableHead>
                      <TableHead
                        className='cursor-pointer'
                        onClick={() =>
                          setSortConfig((s) => ({
                            key: 'deltaRoom',
                            dir: s.dir === 'asc' ? 'desc' : 'asc',
                          }))
                        }
                      >
                        {t('Room Δ')}
                      </TableHead>
                      <TableHead
                        className='cursor-pointer'
                        onClick={() =>
                          setSortConfig((s) => ({
                            key: 'globalDelta',
                            dir: s.dir === 'asc' ? 'desc' : 'asc',
                          }))
                        }
                      >
                        {t('Global Δ')}
                      </TableHead>
                      <TableHead
                        className='cursor-pointer'
                        onClick={() =>
                          setSortConfig((s) => ({
                            key: 'totalMatches',
                            dir: s.dir === 'asc' ? 'desc' : 'asc',
                          }))
                        }
                      >
                        {t('Games')}
                      </TableHead>
                      <TableHead
                        className='cursor-pointer'
                        onClick={() =>
                          setSortConfig((s) => ({
                            key: 'wins',
                            dir: s.dir === 'asc' ? 'desc' : 'asc',
                          }))
                        }
                      >
                        {t('Wins')}
                      </TableHead>
                      <TableHead
                        className='cursor-pointer'
                        onClick={() =>
                          setSortConfig((s) => ({
                            key: 'losses',
                            dir: s.dir === 'asc' ? 'desc' : 'asc',
                          }))
                        }
                      >
                        {t('Losses')}
                      </TableHead>
                      <TableHead
                        className='cursor-pointer'
                        onClick={() =>
                          setSortConfig((s) => ({
                            key: 'winPct',
                            dir: s.dir === 'asc' ? 'desc' : 'asc',
                          }))
                        }
                      >
                        {t('Win %')}
                      </TableHead>
                      <TableHead
                        className='cursor-pointer'
                        onClick={() =>
                          setSortConfig((s) => ({
                            key: 'avgPtsPerMatch',
                            dir: s.dir === 'asc' ? 'desc' : 'asc',
                          }))
                        }
                      >
                        {t('Avg Δ / Game')}
                      </TableHead>
                      <TableHead>{t('Last 5 ←')}</TableHead>
                      <TableHead
                        className='cursor-pointer'
                        onClick={() =>
                          setSortConfig((s) => ({
                            key: 'longestWinStreak',
                            dir: s.dir === 'asc' ? 'desc' : 'asc',
                          }))
                        }
                      >
                        {t('Best Streak')}
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {regularPlayers.map((p, i) => (
                      <TableRow key={p.userId}>
                        <TableCell>{i + 1}</TableCell>
                        <TableCell>
                          {p.isDeleted ? (
                            <span>{p.name}</span>
                          ) : (
                            <a
                              href={`/profile/${p.userId}`}
                              className='hover:underline'
                            >
                              {p.name}
                            </a>
                          )}
                          {p.userId === room.creator && (
                            <Crown className='inline ml-1 h-4 w-4 text-yellow-500' />
                          )}
                        </TableCell>
                        <TableCell>
                          {p.ratingVisible ? p.rating : '—'}
                        </TableCell>
                        <TableCell>
                          {p.ratingVisible ? p.deltaRoom.toFixed(0) : '—'}
                        </TableCell>
                        <TableCell>
                          {p.ratingVisible ? p.globalDelta.toFixed(0) : '—'}
                        </TableCell>
                        <TableCell>{p.totalMatches}</TableCell>
                        <TableCell>{p.wins}</TableCell>
                        <TableCell>{p.losses}</TableCell>
                        <TableCell>
                          {p.ratingVisible ? `${p.winPct}%` : '—'}
                        </TableCell>
                        <TableCell>
                          {p.ratingVisible ? p.avgPtsPerMatch.toFixed(2) : '—'}
                        </TableCell>
                        <TableCell>
                          {p.ratingVisible ? (
                            <div className='flex gap-1'>
                              {p.last5Form
                                .slice()
                                .reverse()
                                .map((mm: MiniMatch, idx: number) => (
                                  <span
                                    key={idx}
                                    className={`inline-block w-2 h-2 rounded-full ${
                                      mm.result === 'W'
                                        ? 'bg-green-500'
                                        : 'bg-red-500'
                                    }`}
                                    title={`${t(
                                      mm.result === 'W' ? 'Win' : 'Loss'
                                    )} ${t('vs')} ${mm.opponent} (${mm.score})`}
                                  />
                                ))}
                            </div>
                          ) : (
                            '—'
                          )}
                        </TableCell>
                        <TableCell>
                          {p.ratingVisible ? p.longestWinStreak : '—'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>
            )}
            {viewMode === 'final' && latestSeason && (
              <ScrollArea>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('Rank')}</TableHead>
                      <TableHead>{t('Player')}</TableHead>
                      <TableHead>{t('Games')}</TableHead>
                      <TableHead>{t('Wins')}</TableHead>
                      <TableHead>{t('Losses')}</TableHead>
                      <TableHead>{t('Best Streak')}</TableHead>
                      <TableHead>{t('Start Elo')}</TableHead>
                      <TableHead>{t('End Elo')}</TableHead>
                      <TableHead>{t('Elo Δ')}</TableHead>
                      <TableHead>{t('Total Δ')}</TableHead>
                      <TableHead>{t('Adjusted Pts')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(Array.isArray(latestSeason.summary)
                      ? latestSeason.summary
                      : latestSeason.members
                    ).map((r: any) => (
                      <TableRow key={r.userId}>
                        <TableCell>{r.place}</TableCell>
                        <TableCell>
                          {r.isDeleted ? (
                            <span>{r.name}</span>
                          ) : (
                            <a
                              href={`/profile/${r.userId}`}
                              className='hover:underline'
                            >
                              {r.name}
                            </a>
                          )}
                        </TableCell>
                        <TableCell>{r.matchesPlayed}</TableCell>
                        <TableCell>{r.wins}</TableCell>
                        <TableCell>{r.losses}</TableCell>
                        <TableCell>{r.longestWinStreak ?? '—'}</TableCell>
                        <TableCell>{r.startGlobalElo ?? '—'}</TableCell>
                        <TableCell>{r.endGlobalElo ?? '—'}</TableCell>
                        <TableCell>
                          {r.startGlobalElo != null && r.endGlobalElo != null
                            ? (r.endGlobalElo - r.startGlobalElo).toFixed(0)
                            : '—'}
                        </TableCell>
                        <TableCell>
                          {r.totalAddedPoints?.toFixed(2) ?? '—'}
                        </TableCell>
                        <TableCell>{r.adjPoints?.toFixed(2) ?? '—'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>
            )}
            <div className='mt-4 text-xs text-muted-foreground leading-relaxed space-y-1'>
              <p>
                <strong>{t('Room Rating')}</strong> —{' '}
                {t(
                  'Elo score, recalculated based only on matches in this room (starting = 1000).'
                )}
              </p>
              <p>
                <strong>{t('Room Δ')}</strong> —{' '}
                {t('vs. starting (1000): current room rating – 1000.')}
              </p>
              <p>
                <strong>{t('Global Δ')}</strong> —{' '}
                {t(
                  'Change in your overall Elo (across all rooms) since your first match this season.'
                )}
              </p>
              <p>
                <strong>{t('Games / Wins / Losses')}</strong> —{' '}
                {t('Matches played and outcomes.')}
              </p>
              <p>
                <strong>{t('Win %')}</strong> — {t('(Wins / Games) × 100.')}
              </p>
              <p>
                <strong>{t('Avg Δ / Game')}</strong> —{' '}
                {t('Average room Elo change per match.')}
              </p>
              <p>
                <strong>{t('Last 5')}</strong> —{' '}
                {t('W = win, L = loss for the last five games.')}
              </p>
              <p>
                <strong>{t('Best Streak')}</strong> —{' '}
                {t('Longest consecutive winning streak.')}
              </p>
              {viewMode === 'final' && (
                <>
                  <p>
                    <strong>{t('Total Δ')}</strong> —{' '}
                    {t(
                      'Sum of all Elo gains/losses for the season (room-specific).'
                    )}
                  </p>
                  <p>
                    <strong>{t('Adjusted Pts')}</strong> —{' '}
                    {t('Total Δ × √(AvgGames / YourGames)')}
                  </p>
                </>
              )}
            </div>
          </CardContent>
        </Card>
        <Card className='shadow-lg'>
          <CardHeader>
            <CardTitle className='flex items-center gap-2'>
              <ShieldCheck className='text-primary' />
              {t('Recent Matches')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {recent.length ? (
              <ScrollArea className='h-[800px]'>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('Players')}</TableHead>
                      <TableHead>{t('Score')}</TableHead>
                      <TableHead>{t('Room Δ')}</TableHead>
                      <TableHead>{t('Elo Δ')}</TableHead>
                      <TableHead>{t('Winner')}</TableHead>
                      <TableHead>{t('Date')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recent.map((m) => (
                      <TableRow key={m.id}>
                        <TableCell>
                          {m.player1.name} – {m.player2.name}
                        </TableCell>
                        <TableCell>
                          {m.player1.scores} – {m.player2.scores}
                        </TableCell>
                        <TableCell>
                          {m.player1.roomAddedPoints} |{' '}
                          {m.player2.roomAddedPoints}
                        </TableCell>
                        <TableCell>
                          {m.player1.newRating} | {m.player2.newRating}
                        </TableCell>
                        <TableCell className='font-semibold'>
                          {m.winner}
                        </TableCell>
                        <TableCell>
                          {safeFormatDate(
                            m.timestamp ??
                              (m as any).createdAt ??
                              (m as any).tsIso,
                            'dd.MM.yyyy HH:mm:ss'
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>
            ) : (
              <p className='text-center py-8 text-muted-foreground'>
                {t('No recent matches')}
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </ProtectedRoute>
  );
}

function MembersBlock({
  members,
  room,
  roomId,
  t,
}: {
  members: any[];
  room: Room;
  roomId: string;
  t: (key: string, options?: any) => string;
}) {
  const [isInviting, setIsInviting] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const { toast } = useToast();

  const handleInvite = async () => {
    if (!inviteEmail.trim() || !room) return;
    setIsInviting(true);
    try {
      const qs = query(
        collection(db, 'users'),
        where('email', '==', inviteEmail.trim())
      );
      const snap = await getDocs(qs);
      if (snap.empty) {
        toast({ title: t('User not found'), variant: 'destructive' });
        return;
      }
      const uDoc = snap.docs[0];
      const target = uDoc.data() as UserProfile;
      const uid = uDoc.id;
      if (members.some((m) => m.userId === uid)) {
        toast({ title: t('User already in room') });
        return;
      }
      const newMember = {
        userId: uid,
        name: target.name ?? target.displayName ?? target.email!,
        email: target.email!,
        rating: 1000,
        startRating: 1000,
        wins: 0,
        losses: 0,
        date: getFinnishFormattedDate(),
        role: 'editor' as const,
      };
      await updateDoc(doc(db, 'rooms', roomId), {
        members: arrayUnion(newMember),
        memberIds: arrayUnion(uid),
      });
      toast({
        title: t('Invited'),
        description: `${newMember.name} ${t('added')}`,
      });
      setInviteEmail('');
    } catch (e) {
      console.error(e);
      toast({ title: t('Error'), variant: 'destructive' });
    } finally {
      setIsInviting(false);
    }
  };

  return (
    <div>
      <Users className='text-primary' />{' '}
      <span className='font-semibold'>
        {t('Members', { context: 'blockTitle' })}: {members.length}
      </span>
      <ScrollArea className='border rounded-md p-3 bg-background'>
        {members.map((p) => {
          const rank = getRank(p.globalElo ?? 1000, t);
          return (
            <div
              key={p.userId}
              className='flex items-center justify-between p-2 hover:bg-muted/50 rounded-md transition-colors'
            >
              <div className='flex items-center gap-3'>
                <Avatar className='h-12 w-12'>
                  <AvatarImage src={p.photoURL || undefined} />
                  <AvatarFallback>{p.name.charAt(0)}</AvatarFallback>
                </Avatar>
                <div>
                  <p className='font-medium leading-none'>
                    {p.isDeleted ? (
                      <span>{p.name}</span>
                    ) : (
                      <a
                        href={`/profile/${p.userId}`}
                        className='hover:underline'
                      >
                        {p.name}
                      </a>
                    )}
                    {p.userId === room.creator && (
                      <Crown className='inline ml-1 h-4 w-4 text-yellow-500' />
                    )}
                  </p>
                  <p className='text-xs text-muted-foreground'>
                    {t('MP')} {p.totalMatches} · {t('W%')} {p.winPct}% ·{' '}
                    {t('ELO')} {p.globalElo?.toFixed(0) ?? '–'}
                  </p>
                  <p className='text-[10px] text-muted-foreground'>
                    {t('Rank')} {rank}
                  </p>
                </div>
              </div>
              <span className='text-sm font-semibold text-primary'>
                {p.rating}&nbsp;{t('pts')}
              </span>
            </div>
          );
        })}
      </ScrollArea>
    </div>
  );
}

function PlayerSelect({
  label,
  value,
  onChange,
  list,
  t,
}: {
  label: string;
  value: string;
  onChange(v: string): void;
  list: { userId: string; name: string; rating: number }[];
  t: (key: string) => string;
}) {
  return (
    <div>
      <Label>{label}</Label>
      <select
        className='w-full border rounded p-2'
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value=''>{t('Select')}</option>
        {list.map((o) => (
          <option key={o.userId} value={o.userId}>
            {o.name} ({o.rating})
          </option>
        ))}
      </select>
    </div>
  );
}

function MatchRowInput({
  data,
  onChange,
  onRemove,
  removable,
  t,
}: {
  index: number;
  data: any;
  onChange(d: any): void;
  onRemove(): void;
  removable: boolean;
  t: (key: string) => string;
}) {
  return (
    <div className='grid grid-cols-2 gap-4 mb-2 relative'>
      {['1', '2'].map((n) => (
        <div key={n}>
          <Label>{t(`P${n} Score`)}</Label>
          <Input
            type='number'
            value={data[`score${n}`]}
            onChange={(e) =>
              onChange({ ...data, [`score${n}`]: e.target.value })
            }
          />
          <Label className='mt-2'>{t('Side')}</Label>
          <select
            className='w-full border rounded p-2'
            value={data[`side${n}`]}
            onChange={(e) =>
              onChange({
                ...data,
                [`side${n}`]: e.target.value,
                [`side${n === '1' ? '2' : '1'}`]:
                  e.target.value === 'left' ? 'right' : 'left',
              })
            }
          >
            <option value=''>{t('–')}</option>
            <option value='left'>{t('Left')}</option>
            <option value='right'>{t('Right')}</option>
          </select>
        </div>
      ))}
      {removable && (
        <Button
          variant='ghost'
          className='absolute top-1/2 right-0 -translate-y-1/2'
          onClick={onRemove}
        >
          <Trash2 />
        </Button>
      )}
    </div>
  );
}

function RoomSettingsDialog({ room }: { room: Room }) {
  const { t } = useTranslation();
  const router = useRouter();
  const { toast } = useToast();
  const [name, setName] = useState(room.name);
  const [isPublic, setIsPublic] = useState(room.isPublic);
  const [isSaving, setIsSaving] = useState(false);
  const [isActing, setIsActing] = useState(false);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await updateDoc(doc(db, 'rooms', room.id), { name, isPublic });
      toast({ title: t('Settings saved') });
    } catch (error) {
      toast({ title: t('Error saving settings'), variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleArchive = async () => {
    setIsActing(true);
    try {
      await updateDoc(doc(db, 'rooms', room.id), {
        isArchived: true,
        archivedAt: new Date().toISOString(),
      });
      toast({ title: t('Room archived') });
      router.push('/rooms');
    } catch (error) {
      toast({ title: t('Error archiving room'), variant: 'destructive' });
    } finally {
      setIsActing(false);
    }
  };

  const handleUnarchive = async () => {
    setIsActing(true);
    try {
      await updateDoc(doc(db, 'rooms', room.id), {
        isArchived: false,
      });
      toast({ title: t('Room unarchived') });
    } catch (error) {
      toast({ title: t('Error unarchiving room'), variant: 'destructive' });
    } finally {
      setIsActing(false);
    }
  };

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{t('Room Settings')}</DialogTitle>
        <DialogDescription>
          {t("Manage your room's details and settings.")}
        </DialogDescription>
      </DialogHeader>
      <div className='space-y-4 py-4'>
        <div className='space-y-2'>
          <Label htmlFor='room-name'>{t('Room Name')}</Label>
          <Input
            id='room-name'
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className='flex items-center space-x-2'>
          <Checkbox
            id='is-public'
            checked={isPublic}
            onCheckedChange={(v) => setIsPublic(!!v)}
          />
          <Label htmlFor='is-public'>{t('Public Room')}</Label>
        </div>
        <p className='text-xs text-muted-foreground'>
          {t(
            'Public rooms are visible to everyone and can be joined by request.'
          )}
        </p>
        <Separator />
        <div className='space-y-2'>
          <h4 className='font-medium text-destructive'>{t('Danger Zone')}</h4>
          {room.isArchived ? (
            <Button
              variant='outline'
              className='w-full'
              onClick={handleUnarchive}
              disabled={isActing}
            >
              {t('Unarchive Room')}
            </Button>
          ) : (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant='destructive'
                  className='w-full'
                  disabled={isActing}
                >
                  {t('Archive Room')}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{t('Archive this room?')}</AlertDialogTitle>
                  <AlertDialogDescription>
                    {t(
                      "The room will be hidden from lists and no new matches can be added. The match history will be preserved for ELO accuracy. This action can't be undone through the UI yet."
                    )}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{t('Cancel')}</AlertDialogCancel>
                  <AlertDialogAction onClick={handleArchive}>
                    {t('Yes, Archive')}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </div>
      <DialogFooter>
        <Button onClick={handleSave} disabled={isSaving}>
          {isSaving ? t('Saving...') : t('Save Changes')}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
