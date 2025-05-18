'use client';
import { ProtectedRoute } from '@/components/ProtectedRoutes';
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
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

import { useToast } from '@/hooks/use-toast';
import { db } from '@/lib/firebase';
import { finalizeSeason } from '@/lib/season';
import type { Match, Room, UserProfile } from '@/lib/types';
import { getFinnishFormattedDate } from '@/lib/utils';
import { parseFlexDate, safeFormatDate } from '@/lib/utils/date';
import {
  addDoc,
  arrayUnion,
  collection,
  deleteDoc,
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
  MailPlus,
  Plus,
  ShieldCheck,
  Sword,
  Trash2,
  Users,
} from 'lucide-react';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

const calcWinPct = (wins: number, losses: number) => {
  const total = wins + losses;
  return total ? ((wins / total) * 100).toFixed(1) : '0.0';
};

export default function RoomPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const router = useRouter();
  const roomId = useParams().roomId as string;

  const [room, setRoom] = useState<Room | null>(null);
  const [members, setMembers] = useState<Room['members']>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [inviteEmail, setInviteEmail] = useState('');
  const [isInviting, setIsInviting] = useState(false);
  const [player1Id, setPlayer1Id] = useState('');
  const [player2Id, setPlayer2Id] = useState('');
  const [matchesInput, setMatchesInput] = useState([
    { score1: '', score2: '', side1: '', side2: '' },
  ]);
  const [isRecording, setIsRecording] = useState(false);
  const [recent, setRecent] = useState<Match[]>([]);
  const [latestSeason, setLatestSeason] = useState<any | null>(null);
  const [viewMode, setViewMode] = useState<'regular' | 'final'>('regular');
  const [isFiltered, setFiltered] = useState(false);
  const [sortConfig, setSortConfig] = useState<{
    key: string;
    dir: 'asc' | 'desc';
  }>({ key: 'rating', dir: 'desc' });

  useEffect(() => {
    if (!user) return;
    const roomRef = doc(db, 'rooms', roomId);
    const unsubRoom = onSnapshot(roomRef, (snap) => {
      if (!snap.exists()) {
        toast({
          title: 'Error',
          description: 'Room not found',
          variant: 'destructive',
        });
        router.push('/rooms');
        return;
      }
      const data = snap.data() as Room;
      const mapped = (data.members ?? []).map((m) => ({
        ...m,
        rating: m.roomNewRating ?? m.rating,
      }));
      setRoom({ ...data, members: mapped });
      setMembers(mapped);
      const last =
        data.seasonHistory
          ?.slice()
          .reverse()
          .find(
            (s: any) => Array.isArray(s.summary) || Array.isArray(s.members)
          ) ?? null;
      setLatestSeason(last);
      setIsLoading(false);
    });
    const matchesRef = query(
      collection(db, 'matches'),
      where('roomId', '==', roomId),
      orderBy('timestamp', 'desc')
    );
    const unsubMatches = onSnapshot(matchesRef, (snap) => {
      const arr = snap.docs.map(
        (d) => ({ id: d.id, ...(d.data() as any) } as Match)
      );
      arr.sort(
        (a, b) =>
          parseFlexDate(b.timestamp).getTime() -
          parseFlexDate(a.timestamp).getTime()
      );
      setRecent(arr);
    });
    return () => {
      unsubRoom();
      unsubMatches();
    };
  }, [user, roomId, router, toast]);

  useEffect(() => {
    if (latestSeason) setViewMode('final');
  }, [latestSeason]);


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
        toast({ title: 'User not found', variant: 'destructive' });
        return;
      }
      const doc0 = snap.docs[0];
      const target = doc0.data() as UserProfile;
      const uid = doc0.id;
      if (members.some((m) => m.userId === uid)) {
        toast({ title: 'User already in room' });
        return;
      }
      const newMember = {
        userId: uid,
        name: target.name || target.email!,
        email: target.email!,
        rating: 1000,
        wins: 0,
        losses: 0,
        date: getFinnishFormattedDate(),
        role: 'editor' as const,
      };
      await updateDoc(doc(db, 'rooms', roomId), {
        members: arrayUnion(newMember),
      });
      toast({
        title: 'Invited',
        description: `${newMember.name} added to room`,
      });
      setInviteEmail('');
    } finally {
      setIsInviting(false);
    }
  };

  const addRow = () =>
    setMatchesInput((r) => [
      ...r,
      { score1: '', score2: '', side1: '', side2: '' },
    ]);
  const removeRow = (i: number) =>
    setMatchesInput((r) => r.filter((_, idx) => idx !== i));

  const saveMatches = async () => {
    if (!player1Id || !player2Id || player1Id === player2Id) {
      toast({ title: 'Select two different players', variant: 'destructive' });
      return;
    }
    if (
      matchesInput.some((m) => !m.score1 || !m.score2 || !m.side1 || !m.side2)
    ) {
      toast({ title: 'Fill all fields', variant: 'destructive' });
      return;
    }
    setIsRecording(true);
    try {
      for (const row of matchesInput) {
        // 1) parse scores & compute winner
        const s1 = parseInt(row.score1, 10);
        const s2 = parseInt(row.score2, 10);
        const winnerId = s1 > s2 ? player1Id : player2Id;

        // 2) compute a fresh timestamp for each match
        const time = getFinnishFormattedDate();

        // 3) fetch current global Elo
        const [p1Snap, p2Snap] = await Promise.all([
          getDoc(doc(db, 'users', player1Id)),
          getDoc(doc(db, 'users', player2Id)),
        ]);
        const p1Data = p1Snap.data() as any;
        const p2Data = p2Snap.data() as any;
        const g1 = p1Data.globalElo ?? 1000;
        const g2 = p2Data.globalElo ?? 1000;

        // 4) Elo math
        const K = 32;
        const exp1 = 1 / (1 + 10 ** ((g2 - g1) / 400));
        const exp2 = 1 / (1 + 10 ** ((g1 - g2) / 400));
        const newG1 = Math.round(
          g1 + K * ((winnerId === player1Id ? 1 : 0) - exp1)
        );
        const newG2 = Math.round(
          g2 + K * ((winnerId === player2Id ? 1 : 0) - exp2)
        );
        const dG1 = newG1 - g1;
        const dG2 = newG2 - g2;
        const newMax1 = Math.max(p1Data.maxRating || g1, newG1);
        const newMax2 = Math.max(p2Data.maxRating || g2, newG2);

        // 5) fetch room & compute room‐rating updates
        const roomSnap = await getDoc(doc(db, 'rooms', roomId));
        const rData = roomSnap.data() as Room;
        const rp1 = rData.members.find((m) => m.userId === player1Id)!;
        const rp2 = rData.members.find((m) => m.userId === player2Id)!;
        const r1 = rp1.rating + dG1;
        const r2 = rp2.rating + dG2;

        // 6) write the match
        await addDoc(collection(db, 'matches'), {
          roomId,
          timestamp: time,
          player1Id,
          player2Id,
          players: [player1Id, player2Id],
          player1: {
            name: rp1.name,
            scores: s1,
            oldRating: g1,
            newRating: newG1,
            addedPoints: dG1,
            roomOldRating: rp1.rating,
            roomNewRating: r1,
            roomAddedPoints: dG1,
            side: row.side1,
          },
          player2: {
            name: rp2.name,
            scores: s2,
            oldRating: g2,
            newRating: newG2,
            addedPoints: dG2,
            roomOldRating: rp2.rating,
            roomNewRating: r2,
            roomAddedPoints: dG2,
            side: row.side2,
          },
          winner: winnerId === player1Id ? rp1.name : rp2.name,
        });

        // 7) update users & room stats
        await Promise.all([
          updateDoc(doc(db, 'users', player1Id), {
            globalElo: newG1,
            wins: (p1Data.wins || 0) + (winnerId === player1Id ? 1 : 0),
            losses: (p1Data.losses || 0) + (winnerId === player2Id ? 1 : 0),
            matchesPlayed: (p1Data.matchesPlayed || 0) + 1,
            eloHistory: arrayUnion({ date: time, elo: newG1 }),
            maxRating: newMax1,
            rank: getRank(newMax1),
          }),
          updateDoc(doc(db, 'users', player2Id), {
            globalElo: newG2,
            wins: (p2Data.wins || 0) + (winnerId === player2Id ? 1 : 0),
            losses: (p2Data.losses || 0) + (winnerId === player1Id ? 1 : 0),
            matchesPlayed: (p2Data.matchesPlayed || 0) + 1,
            eloHistory: arrayUnion({ date: time, elo: newG2 }),
            maxRating: newMax2,
            rank: getRank(newMax2),
          }),
          updateDoc(doc(db, 'rooms', roomId), {
            members: rData.members.map((m) =>
              m.userId === player1Id
                ? {
                  ...m,
                  rating: r1,
                  wins: m.wins + (dG1 > 0 ? 1 : 0),
                  losses: m.losses + (dG1 < 0 ? 1 : 0),
                }
                : m.userId === player2Id
                  ? {
                    ...m,
                    rating: r2,
                    wins: m.wins + (dG2 > 0 ? 1 : 0),
                    losses: m.losses + (dG2 < 0 ? 1 : 0),
                  }
                  : m
            ),
          }),
        ]);

        // 8) pause 1 second so next timestamp differs
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }

      // reset form
      setPlayer1Id('');
      setPlayer2Id('');
      setMatchesInput([{ score1: '', score2: '', side1: '', side2: '' }]);
      toast({ title: 'Matches recorded' });
    } finally {
      setIsRecording(false);
    }
  };

  const handleFinishSeason = async () => {
    await finalizeSeason(roomId);
    toast({ title: 'Season finished' });
    setViewMode('final');
  };

  const finalRows = useMemo(() => {
    if (!latestSeason) return [];
    const arr = Array.isArray(latestSeason.summary)
      ? [...latestSeason.summary]
      : Array.isArray(latestSeason.members)
        ? [...latestSeason.members]
        : [];
    return arr.sort((a: any, b: any) => (a.place ?? 0) - (b.place ?? 0));
  }, [latestSeason]);

  const regularPlayers = useMemo(() => {
    const enriched = members.map((m) => {
      const total = (m.wins || 0) + (m.losses || 0);
      return {
        ...m,
        totalMatches: total,
        ratingVisible: total >= 5,
        winPct: calcWinPct(m.wins || 0, m.losses || 0),
      };
    });
    const sorted = enriched.sort((a, b) => {
      if (a.ratingVisible !== b.ratingVisible) return a.ratingVisible ? -1 : 1;
      const dir = sortConfig.dir === 'asc' ? 1 : -1;
      return (a as any)[sortConfig.key] > (b as any)[sortConfig.key]
        ? dir
        : -dir;
    });
    if (!isFiltered) return sorted;
    const avg =
      sorted.reduce((acc, p) => acc + p.totalMatches, 0) / (sorted.length || 1);
    return [
      ...sorted.filter((p) => p.totalMatches >= avg),
      ...sorted.filter((p) => p.totalMatches < avg),
    ];
  }, [members, sortConfig, isFiltered]);

  useEffect(() => {
    if (!members.length) return;

    const loadUserDetails = async () => {
      const updated = await Promise.all(
        members.map(async (m) => {
          const userSnap = await getDoc(doc(db, 'users', m.userId));
          const userData = userSnap.exists() ? userSnap.data() : {};
          return {
            ...m,
            photoURL: userData.photoURL || null,
            rank: userData.rank || null,
            globalElo: userData.globalElo || null,
            maxRating: userData.maxRating || null,
          };
        })
      );
      setMembers(updated);
    };

    loadUserDetails();
  }, [members.length, recent]);
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
          <ArrowLeft className='mr-2 h-4 w-4' /> Back to Rooms
        </Button>

        <Card className='mb-8 shadow-xl'>
          <CardHeader className='bg-muted/50 p-6 flex flex-col md:flex-row items-center gap-6'>
            <Avatar className='h-24 w-24 border-4 border-background shadow-md'>
              <AvatarImage src={room.avatarURL || undefined} />
              <AvatarFallback>{room.name[0]}</AvatarFallback>
            </Avatar>
            <div className='text-center md:text-left'>
              <CardTitle className='text-3xl font-bold'>{room.name}</CardTitle>
            </div>
          </CardHeader>

          <CardContent className='p-6 grid md:grid-cols-3 gap-6'>
            <MembersBlock
              members={members}
              recent={recent}
              regularPlayers={regularPlayers}
              isInviting={isInviting}
              inviteEmail={inviteEmail}
              setInviteEmail={setInviteEmail}
              handleInvite={handleInvite}
              room={room}
            />
            {!latestSeason && (
              <RecordBlock
                members={members}
                player1Id={player1Id}
                player2Id={player2Id}
                setPlayer1Id={setPlayer1Id}
                setPlayer2Id={setPlayer2Id}
                matchesInput={matchesInput}
                setMatchesInput={setMatchesInput}
                addRow={addRow}
                removeRow={removeRow}
                saveMatches={saveMatches}
                isRecording={isRecording}
              />
            )}
            {!latestSeason && (
              <div className='md:col-span-3 text-right'>
                <Button variant='destructive' onClick={handleFinishSeason}>
                  Finish Season
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <Separator className='my-8' />

        <Card className='shadow-lg mb-8'>
          <CardHeader>
            <div className='flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4'>
              <CardTitle>Standings</CardTitle>
              {latestSeason && (
                <div className='flex gap-2'>
                  <Button
                    size='sm'
                    variant={viewMode === 'regular' ? 'default' : 'outline'}
                    onClick={() => setViewMode('regular')}
                  >
                    Regular
                  </Button>
                  <Button
                    size='sm'
                    variant={viewMode === 'final' ? 'default' : 'outline'}
                    onClick={() => setViewMode('final')}
                  >
                    Final
                  </Button>
                </div>
              )}
            </div>
            <CardDescription>
              {viewMode === 'regular'
                ? 'Current rankings'
                : 'Final season standings'}
            </CardDescription>
          </CardHeader>

          <CardContent>
            {viewMode === 'regular' && (
              <>
                <div className='flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4'>
                  <p className='text-sm'>
                    Fair ranking shows players with matches ≥ average first
                  </p>
                  <Button
                    size='sm'
                    variant='outline'
                    onClick={() => setFiltered((f) => !f)}
                  >
                    {isFiltered ? 'Remove fair ranking' : 'Apply fair ranking'}
                  </Button>
                </div>
                <ScrollArea>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>#</TableHead>
                        <TableHead
                          onClick={() =>
                            setSortConfig((s) => ({
                              key: 'name',
                              dir: s.dir === 'asc' ? 'desc' : 'asc',
                            }))
                          }
                          className='cursor-pointer'
                        >
                          Name
                        </TableHead>
                        <TableHead
                          onClick={() =>
                            setSortConfig((s) => ({
                              key: 'rating',
                              dir: s.dir === 'asc' ? 'desc' : 'asc',
                            }))
                          }
                          className='cursor-pointer'
                        >
                          Points
                        </TableHead>
                        <TableHead
                          onClick={() =>
                            setSortConfig((s) => ({
                              key: 'totalMatches',
                              dir: s.dir === 'asc' ? 'desc' : 'asc',
                            }))
                          }
                          className='cursor-pointer'
                        >
                          Matches
                        </TableHead>
                        <TableHead
                          onClick={() =>
                            setSortConfig((s) => ({
                              key: 'winPct',
                              dir: s.dir === 'asc' ? 'desc' : 'asc',
                            }))
                          }
                          className='cursor-pointer'
                        >
                          Win %
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {regularPlayers.map((p, i) => (
                        <TableRow key={p.userId}>
                          <TableCell>{i + 1}</TableCell>
                          <TableCell>
                            <a
                              href={`/profile/${p.userId}`}
                              className='hover:underline'
                            >
                              {p.name}
                            </a>
                            {p.userId === room.creator && (
                              <Crown className='inline ml-1 h-4 w-4 text-yellow-500' />
                            )}
                          </TableCell>
                          <TableCell>
                            {p.ratingVisible ? p.rating : 'Hidden'}
                          </TableCell>
                          <TableCell>{p.totalMatches}</TableCell>
                          <TableCell>
                            {p.ratingVisible ? `${p.winPct}%` : 'Hidden'}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </>
            )}
            {viewMode === 'final' &&
              (latestSeason ? (
                <ScrollArea>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Place</TableHead>
                        <TableHead>Name</TableHead>
                        <TableHead>Matches</TableHead>
                        <TableHead>Wins</TableHead>
                        <TableHead>Losses</TableHead>
                        <TableHead>Longest WS</TableHead>
                        <TableHead>Total +pts</TableHead>
                        <TableHead>Score</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {finalRows.map((r: any) => (
                        <TableRow key={r.userId}>
                          <TableCell>{r.place}</TableCell>
                          <TableCell>{r.name}</TableCell>
                          <TableCell>{r.matchesPlayed}</TableCell>
                          <TableCell>{r.wins}</TableCell>
                          <TableCell>{r.losses}</TableCell>
                          <TableCell>{r.longestWinStreak ?? '-'}</TableCell>
                          <TableCell>
                            {r.totalAddedPoints?.toFixed(2) ?? '-'}
                          </TableCell>
                          <TableCell>
                            {r.finalScore?.toFixed(2) ?? '-'}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </ScrollArea>
              ) : (
                <p className='text-muted-foreground'>Season not finished yet</p>
              ))}
          </CardContent>
        </Card>

        <Card className='shadow-lg'>
          <CardHeader>
            <CardTitle className='flex items-center gap-2'>
              <ShieldCheck className='text-primary' /> Recent Matches
            </CardTitle>
          </CardHeader>
          <CardContent>
            {recent.length ? (
              <ScrollArea className='h-[300px]'>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Players</TableHead>
                      <TableHead>Score</TableHead>
                      <TableHead>Δ pts</TableHead>
                      <TableHead>Δ ELO</TableHead>
                      <TableHead>Winner</TableHead>
                      <TableHead>Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recent.map((m) => (
                      <TableRow key={m.id}>
                        <TableCell>
                          {m.player1.name} - {m.player2.name}
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
                          {safeFormatDate(m.timestamp, 'dd.MM.yyyy HH:mm:ss')}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>
            ) : (
              <p className='text-center py-8 text-muted-foreground'>
                No recent matches
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
  recent,
  regularPlayers,
  isInviting,
  inviteEmail,
  setInviteEmail,
  handleInvite,
  room,
}: {
  members: Room["members"];
  recent: Match[];
  regularPlayers: any[];
  isInviting: boolean;
  inviteEmail: string;
  setInviteEmail(v: string): void;
  handleInvite(): void;
  room: Room;
}) {
  // 1. Сохраняем отдельный profiles-стейт
  const [profiles, setProfiles] = useState<Record<string, any>>({});

  // 2. Загружаем профили для всех игроков при обновлении members/recent
  useEffect(() => {
    if (!members.length) return;
    const fetchProfiles = async () => {
      const profs: Record<string, any> = {};
      await Promise.all(
        members.map(async (m) => {
          const snap = await getDoc(doc(db, "users", m.userId));
          if (snap.exists()) profs[m.userId] = snap.data();
        })
      );
      setProfiles(profs);
    };
    fetchProfiles();
  }, [members, recent]); // ключевое отличие — recent

  // Последний рейтинг игрока в комнате по матчам
  const lastRoomRating = useMemo(() => {
    const map: Record<string, number> = {};
    members.forEach((mem) => {
      const lastMatch = recent.find(
        (r) => r.player1Id === mem.userId || r.player2Id === mem.userId
      );
      map[mem.userId] = lastMatch
        ? lastMatch.player1Id === mem.userId
          ? lastMatch.player1.roomNewRating
          : lastMatch.player2.roomNewRating
        : mem.rating;
    });
    return map;
  }, [members, recent]);

  return (
    <div>
      <Users className="text-primary" />{" "}
      <span className="font-semibold">Members ({members.length})</span>
      <ScrollArea className="h-[300px] border rounded-md p-3 bg-background">
        {regularPlayers.map((p) => {
          const userProfile = profiles[p.userId] || {};
          // Показываем globalElo из профиля, fallback — рейтинг в комнате
          const globalElo = userProfile.globalElo ?? "–";
          const elo =
            globalElo !== "–"
              ? globalElo
              : lastRoomRating[p.userId] ?? p.rating ?? "–";
          const rank =
            userProfile.rank ?? getRank(Number.isFinite(elo) ? elo : 1000);

          return (
            <div
              key={p.userId}
              className="flex items-center justify-between p-2 hover:bg-muted/50 rounded-md transition-colors"
            >
              <div className="flex items-center gap-3">
                <Avatar className="h-12 w-12">
                  <AvatarImage src={userProfile.photoURL || undefined} />
                  <AvatarFallback>{p.name.charAt(0)}</AvatarFallback>
                </Avatar>
                <div>
                  <p className="font-medium leading-none">
                    <a
                      href={`/profile/${p.userId}`}
                      className="hover:underline"
                    >
                      {p.name}
                    </a>
                    {p.userId === room.creator && (
                      <Crown className="inline ml-1 h-4 w-4 text-yellow-500" />
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    MP&nbsp;{p.totalMatches} · W%&nbsp;{p.winPct}% · ELO&nbsp;
                    {globalElo}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    Rank&nbsp;{rank}
                  </p>
                </div>
              </div>
              <span className="text-sm font-semibold text-primary">
                {p.rating}&nbsp;pts
              </span>
            </div>
          );
        })}
      </ScrollArea>
      <Dialog>
        <DialogTrigger asChild>
          <Button
            className="mt-4 w-full"
            variant="outline"
            disabled={isInviting}
          >
            <MailPlus className="mr-2 h-4 w-4" /> Invite&nbsp;Player
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invite to {room.name}</DialogTitle>
            <DialogDescription>Enter email</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="invEmail">Email</Label>
            <Input
              id="invEmail"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
            />
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="ghost">Cancel</Button>
            </DialogClose>
            <Button onClick={handleInvite} disabled={isInviting}>
              Send
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function RecordBlock({
  members,
  player1Id,
  player2Id,
  setPlayer1Id,
  setPlayer2Id,
  matchesInput,
  setMatchesInput,
  addRow,
  removeRow,
  saveMatches,
  isRecording,
}: {
  members: Room['members'];
  player1Id: string;
  player2Id: string;
  setPlayer1Id(v: string): void;
  setPlayer2Id(v: string): void;
  matchesInput: {
    score1: string;
    score2: string;
    side1: string;
    side2: string;
  }[];
  setMatchesInput(v: any): void;
  addRow(): void;
  removeRow(i: number): void;
  saveMatches(): void;
  isRecording: boolean;
}) {
  return (
    <Card className='md:col-span-2 shadow-md'>
      <CardHeader>
        <CardTitle className='flex items-center gap-2'>
          <Sword className='text-accent' /> Record Matches
        </CardTitle>
        <CardDescription>Select players and scores</CardDescription>
      </CardHeader>
      <CardContent className='space-y-4'>
        <div className='grid grid-cols-2 gap-4 items-end'>
          <PlayerSelect
            label='Player 1'
            value={player1Id}
            onChange={setPlayer1Id}
            list={members.map((m) => ({
              userId: m.userId,
              name: m.name,
              rating: m.rating,
            }))}
          />
          <PlayerSelect
            label='Player 2'
            value={player2Id}
            onChange={setPlayer2Id}
            list={members.map((m) => ({
              userId: m.userId,
              name: m.name,
              rating: m.rating,
            }))}
          />
        </div>
        {matchesInput.map((m, i) => (
          <MatchRowInput
            key={i}
            index={i}
            data={m}
            onChange={(row) =>
              setMatchesInput((r) => r.map((v, idx) => (idx === i ? row : v)))
            }
            onRemove={() => removeRow(i)}
            removable={i > 0}
          />
        ))}
        <Button
          variant='outline'
          className='flex items-center gap-2'
          onClick={addRow}
        >
          <Plus /> Add Match
        </Button>
        <Button
          className='w-full mt-4'
          disabled={isRecording}
          onClick={saveMatches}
        >
          {isRecording ? 'Recording…' : 'Record & Update ELO'}
        </Button>
      </CardContent>
    </Card>
  );
}

function PlayerSelect({
  label,
  value,
  onChange,
  list,
}: {
  label: string;
  value: string;
  onChange(v: string): void;
  list: { userId: string; name: string; rating: number }[];
}) {
  return (
    <div>
      <Label>{label}</Label>
      <select
        className='w-full border rounded p-2'
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value=''>Select</option>
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
  index,
  data,
  onChange,
  onRemove,
  removable,
}: {
  index: number;
  data: any;
  onChange(d: any): void;
  onRemove(): void;
  removable: boolean;
}) {
  return (
    <div className='grid grid-cols-2 gap-4 mb-2 relative'>
      {['1', '2'].map((n) => (
        <div key={n}>
          <Label>{`P${n} Score`}</Label>
          <Input
            type='number'
            value={data[`score${n}`]}
            onChange={(e) =>
              onChange({ ...data, [`score${n}`]: e.target.value })
            }
          />
          <Label className='mt-2'>Side</Label>
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
            <option value=''>–</option>
            <option value='left'>Left</option>
            <option value='right'>Right</option>
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

function getRank(elo: number): string {
  if (elo < 1001) {
    return 'Ping-Pong Padawan';
  } else if (elo < 1100) {
    return 'Table-Tennis Trainee';
  } else if (elo < 1200) {
    return 'Racket Rookie';
  } else if (elo < 1400) {
    return 'Paddle Prodigy';
  } else if (elo < 1800) {
    return 'Spin Sensei';
  } else if (elo < 2000) {
    return 'Smash Samurai';
  } else {
    return 'Ping-Pong Paladin';
  }
}
