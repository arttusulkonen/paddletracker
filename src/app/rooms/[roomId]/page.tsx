
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
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
  Settings2, // For sorting icon
  Filter, // For filter icon
} from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import React, { useEffect, useMemo, useState } from 'react'; // Added React for Fragment

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
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [player1Id, setPlayer1Id] = useState('');
  const [player2Id, setPlayer2Id] = useState('');
  const [matchesInput, setMatchesInput] = useState([
    { id: crypto.randomUUID(), score1: '', score2: '', side1: '', side2: '' },
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
      setMembers(mapped); // Initialize members here
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
  
  useEffect(() => { // Separate useEffect for members state update based on recent matches
    if (!room || !recent.length) return; // Ensure room and recent matches are available

    const updatedMembersList = room.members.map(mem => {
        const lastMatchInvolvingMember = recent.find(
            (r) => r.player1Id === mem.userId || r.player2Id === mem.userId
        );
        const roomRating = lastMatchInvolvingMember
            ? (lastMatchInvolvingMember.player1Id === mem.userId
                ? lastMatchInvolvingMember.player1.roomNewRating
                : lastMatchInvolvingMember.player2.roomNewRating)
            : mem.rating; // Fallback to existing rating if no recent match
        return { ...mem, rating: roomRating };
    });
    setMembers(updatedMembersList);
  }, [room, recent]); // Dependencies: room and recent matches

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
        name: target.name || target.displayName || target.email!, // Use displayName
        email: target.email!,
        rating: 1000, // Default ELO for new members in room
        roomNewRating: 1000, // Explicitly set roomNewRating
        wins: 0,
        losses: 0,
        date: getFinnishFormattedDate(),
        role: 'editor' as const,
      };
      await updateDoc(doc(db, 'rooms', roomId), {
        members: arrayUnion(newMember),
        memberIds: arrayUnion(uid) // Also update memberIds
      });
      toast({
        title: 'Invited',
        description: `${newMember.name} added to room`,
      });
      setInviteEmail('');
      setInviteDialogOpen(false); // Close dialog
    } finally {
      setIsInviting(false);
    }
  };

  const addRow = () =>
    setMatchesInput((r) => [
      ...r,
      { id: crypto.randomUUID(), score1: '', score2: '', side1: '', side2: '' },
    ]);
  const removeRow = (idToRemove: string) =>
    setMatchesInput((r) => r.filter((match) => match.id !== idToRemove));


  const saveMatches = async () => {
    if (!player1Id || !player2Id || player1Id === player2Id) {
      toast({ title: 'Select two different players', variant: 'destructive' });
      return;
    }
    if (
      matchesInput.some((m) => !m.score1 || !m.score2 || !m.side1 || !m.side2)
    ) {
      toast({ title: 'Fill all fields for scores and sides', variant: 'destructive' });
      return;
    }
    setIsRecording(true);
    try {
      for (const row of matchesInput) {
        // 1) parse scores & compute winner
        const s1 = parseInt(row.score1, 10);
        const s2 = parseInt(row.score2, 10);
        if (isNaN(s1) || isNaN(s2)) {
            toast({ title: 'Invalid scores entered', variant: 'destructive' });
            setIsRecording(false);
            return;
        }
        const winnerId = s1 > s2 ? player1Id : player2Id;

        // 2) compute a fresh timestamp for each match
        const time = getFinnishFormattedDate();

        // 3) fetch current global Elo
        const [p1Snap, p2Snap] = await Promise.all([
          getDoc(doc(db, 'users', player1Id)),
          getDoc(doc(db, 'users', player2Id)),
        ]);
        const p1Data = p1Snap.data() as UserProfile; // Use UserProfile type
        const p2Data = p2Snap.data() as UserProfile; // Use UserProfile type
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
        const r1 = (rp1.roomNewRating ?? rp1.rating) + dG1; // Use roomNewRating if available
        const r2 = (rp2.roomNewRating ?? rp2.rating) + dG2; // Use roomNewRating if available

        // 6) write the match
        await addDoc(collection(db, 'matches'), {
          roomId,
          timestamp: time,
          player1Id,
          player2Id,
          players: [player1Id, player2Id], // Keep this for queries
          player1: {
            name: rp1.name,
            scores: s1,
            oldRating: g1,
            newRating: newG1,
            addedPoints: dG1,
            roomOldRating: rp1.roomNewRating ?? rp1.rating,
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
            roomOldRating: rp2.roomNewRating ?? rp2.rating,
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
                  rating: r1, // Keep rating for backward compatibility if needed
                  roomNewRating: r1, // Store new room-specific ELO
                  wins: (m.wins || 0) + (winnerId === player1Id ? 1 : 0), // Increment wins/losses correctly
                  losses: (m.losses || 0) + (winnerId !== player1Id ? 1 : 0),
                }
                : m.userId === player2Id
                  ? {
                    ...m,
                    rating: r2,
                    roomNewRating: r2,
                    wins: (m.wins || 0) + (winnerId === player2Id ? 1 : 0),
                    losses: (m.losses || 0) + (winnerId !== player2Id ? 1 : 0),
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
      setMatchesInput([{ id: crypto.randomUUID(), score1: '', score2: '', side1: '', side2: '' }]);
      toast({ title: 'Matches recorded' });
    } catch(error) {
        console.error("Error saving matches:", error);
        toast({title: "Error", description: "Could not save matches.", variant: "destructive"});
    }
    finally {
      setIsRecording(false);
    }
  };

  const handleFinishSeason = async () => {
    setIsRecording(true); // Reuse isRecording to disable button
    try {
        await finalizeSeason(roomId);
        toast({ title: 'Season finished' });
        setViewMode('final');
    } catch (error) {
        console.error("Error finishing season:", error);
        toast({ title: "Error", description: "Could not finish season.", variant: "destructive"});
    } finally {
        setIsRecording(false);
    }
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
        ratingVisible: total >= 5, // Threshold for showing rating
        winPct: calcWinPct(m.wins || 0, m.losses || 0),
        // Use roomNewRating for sorting if available, else fallback to rating
        effectiveRating: m.roomNewRating ?? m.rating,
      };
    });
    const sorted = enriched.sort((a, b) => {
      if (a.ratingVisible !== b.ratingVisible) return a.ratingVisible ? -1 : 1;
      const valA = sortConfig.key === 'rating' ? a.effectiveRating : (a as any)[sortConfig.key];
      const valB = sortConfig.key === 'rating' ? b.effectiveRating : (b as any)[sortConfig.key];
      
      const dir = sortConfig.dir === 'asc' ? 1 : -1;
      if (typeof valA === 'string' && typeof valB === 'string') {
        return valA.localeCompare(valB) * dir;
      }
      return (valA > valB ? 1 : valA < valB ? -1 : 0) * dir;
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
          const userData = userSnap.exists() ? userSnap.data() as UserProfile : null; // Use UserProfile
          return {
            ...m,
            photoURL: userData?.photoURL || null,
            rank: userData?.rank || getRank(userData?.globalElo ?? 1000), // Calculate rank if not present
            globalElo: userData?.globalElo ?? 1000,
            maxRating: userData?.maxRating ?? userData?.globalElo ?? 1000,
          };
        })
      );
      setMembers(updated);
    };

    loadUserDetails();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [members.length, recent.length]); // Depend on lengths to avoid excessive calls
  
  if (isLoading || !room) {
    return (
      <div className='flex items-center justify-center min-h-[calc(100vh-10rem)]'>
        <div className='animate-spin h-12 w-12 sm:h-16 sm:w-16 rounded-full border-b-4 border-primary' />
      </div>
    );
  }

  return (
    <ProtectedRoute>
      <div className='container mx-auto py-6 sm:py-8 px-2 sm:px-4'>
        <Button
          variant='outline'
          className='mb-4 sm:mb-6 text-xs sm:text-sm'
          onClick={() => router.push('/rooms')}
        >
          <ArrowLeft className='mr-1 sm:mr-2 h-3 w-3 sm:h-4 sm:w-4' /> Back to Rooms
        </Button>

        <Card className='mb-6 sm:mb-8 shadow-xl'>
          <CardHeader className='bg-muted/50 p-4 sm:p-6 flex flex-col sm:flex-row items-center gap-3 sm:gap-6'>
            <Avatar className='h-16 w-16 sm:h-20 md:h-24 md:w-24 border-2 sm:border-4 border-background shadow-md'>
              <AvatarImage src={room.avatarURL || undefined} alt={room.name} />
              <AvatarFallback className="text-xl sm:text-2xl md:text-3xl">{room.name[0]}</AvatarFallback>
            </Avatar>
            <div className='text-center sm:text-left'>
              <CardTitle className='text-xl sm:text-2xl md:text-3xl font-bold'>{room.name}</CardTitle>
            </div>
          </CardHeader>

          <CardContent className='p-4 sm:p-6 grid md:grid-cols-3 gap-4 sm:gap-6'>
            <MembersBlock
              members={members}
              recent={recent} // Pass recent matches
              regularPlayers={regularPlayers} // Pass sorted players
              isInviting={isInviting}
              inviteEmail={inviteEmail}
              setInviteEmail={setInviteEmail}
              handleInvite={handleInvite}
              room={room}
              inviteDialogOpen={inviteDialogOpen}
              setInviteDialogOpen={setInviteDialogOpen}
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
            {!latestSeason && room.creator === user?.uid && (
              <div className='md:col-span-3 text-center sm:text-right mt-4'>
                <Button variant='destructive' onClick={handleFinishSeason} disabled={isRecording}>
                  Finish Season
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <Separator className='my-6 sm:my-8' />

        <Card className='shadow-lg mb-6 sm:mb-8'>
          <CardHeader className="p-4 sm:p-6">
            <div className='flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-4'>
              <CardTitle className="text-lg sm:text-xl">Standings</CardTitle>
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
            <CardDescription className="text-xs sm:text-sm">
              {viewMode === 'regular'
                ? 'Current rankings in this room'
                : 'Final season standings for this room'}
            </CardDescription>
          </CardHeader>

          <CardContent className="p-2 sm:p-4 md:p-6">
            {viewMode === 'regular' && (
              <>
                <div className='flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-4 mb-3 sm:mb-4'>
                  <p className='text-xs sm:text-sm'>
                    Fair ranking shows players with matches ≥ room average first.
                  </p>
                  <Button
                    size='xs'
                    // sm={{size:'sm'}} // This syntax is incorrect for Button props
                    // Correct way to handle responsive size is typically via className or conditional rendering
                    variant='outline'
                    onClick={() => setFiltered((f) => !f)}
                    className="whitespace-nowrap text-xs sm:text-sm sm:h-9 sm:px-3" // Example of manual responsive sizing
                  >
                    <Filter className="mr-1 h-3 w-3 sm:h-4 sm:w-4" /> {isFiltered ? 'Remove Fair Rank' : 'Apply Fair Rank'}
                  </Button>
                </div>
                <ScrollArea className="h-[300px] sm:h-[400px] w-full">
                  <Table className="min-w-[500px] sm:min-w-full">
                    <React.Fragment>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs sm:text-sm w-8 sm:w-12">#</TableHead>
                          <TableHead
                            onClick={() =>
                              setSortConfig((s) => ({
                                key: 'name',
                                dir: s.dir === 'asc' ? 'desc' : 'asc',
                              }))
                            }
                            className='cursor-pointer text-xs sm:text-sm'
                          >
                            Name <Settings2 className="inline h-3 w-3 sm:h-4 sm:w-4 opacity-50" />
                          </TableHead>
                          <TableHead
                            onClick={() =>
                              setSortConfig((s) => ({
                                key: 'rating',
                                dir: s.dir === 'asc' ? 'desc' : 'asc',
                              }))
                            }
                            className='cursor-pointer text-xs sm:text-sm'
                          >
                            Points <Settings2 className="inline h-3 w-3 sm:h-4 sm:w-4 opacity-50" />
                          </TableHead>
                          <TableHead
                            onClick={() =>
                              setSortConfig((s) => ({
                                key: 'totalMatches',
                                dir: s.dir === 'asc' ? 'desc' : 'asc',
                              }))
                            }
                            className='cursor-pointer text-xs sm:text-sm'
                          >
                            MP <Settings2 className="inline h-3 w-3 sm:h-4 sm:w-4 opacity-50" />
                          </TableHead>
                          <TableHead
                            onClick={() =>
                              setSortConfig((s) => ({
                                key: 'winPct',
                                dir: s.dir === 'asc' ? 'desc' : 'asc',
                              }))
                            }
                            className='cursor-pointer text-xs sm:text-sm'
                          >
                            Win % <Settings2 className="inline h-3 w-3 sm:h-4 sm:w-4 opacity-50" />
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {regularPlayers.map((p, i) => (
                          <TableRow key={p.userId} className="text-xs sm:text-sm">
                            <TableCell>{i + 1}</TableCell>
                            <TableCell>
                              <Link
                                href={`/profile/${p.userId}`}
                                className='hover:underline'
                              >
                                {p.name}
                              </Link>
                              {p.userId === room.creator && (
                                <Crown className='inline ml-1 h-3 w-3 sm:h-4 sm:w-4 text-yellow-500' />
                              )}
                            </TableCell>
                            <TableCell>
                              {p.ratingVisible ? p.effectiveRating : 'Hidden'}
                            </TableCell>
                            <TableCell>{p.totalMatches}</TableCell>
                            <TableCell>
                              {p.ratingVisible ? `${p.winPct}%` : 'Hidden'}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </React.Fragment>
                  </Table>
                </ScrollArea>
              </>
            )}
            {viewMode === 'final' &&
              (latestSeason ? (
                <ScrollArea className="h-[300px] sm:h-[400px] w-full">
                  <Table className="min-w-[600px] sm:min-w-full">
                    <React.Fragment>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs sm:text-sm">Place</TableHead>
                          <TableHead className="text-xs sm:text-sm">Name</TableHead>
                          <TableHead className="text-xs sm:text-sm">MP</TableHead>
                          <TableHead className="text-xs sm:text-sm">W</TableHead>
                          <TableHead className="text-xs sm:text-sm">L</TableHead>
                          <TableHead className="text-xs sm:text-sm">WS</TableHead>
                          <TableHead className="text-xs sm:text-sm">+Pts</TableHead>
                          <TableHead className="text-xs sm:text-sm">Score</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {finalRows.map((r: any) => (
                          <TableRow key={r.userId} className="text-xs sm:text-sm">
                            <TableCell>{r.place}</TableCell>
                            <TableCell>{r.name}</TableCell>
                            <TableCell>{r.matchesPlayed}</TableCell>
                            <TableCell>{r.wins}</TableCell>
                            <TableCell>{r.losses}</TableCell>
                            <TableCell>{r.longestWinStreak ?? '-'}</TableCell>
                            <TableCell>
                              {r.totalAddedPoints?.toFixed(0) ?? '-'}
                            </TableCell>
                            <TableCell>
                              {r.finalScore?.toFixed(0) ?? '-'}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </React.Fragment>
                  </Table>
                </ScrollArea>
              ) : (
                <p className='text-muted-foreground text-center py-4 text-sm sm:text-base'>Season not finished yet</p>
              ))}
          </CardContent>
        </Card>

        <Card className='shadow-lg'>
          <CardHeader className="p-4 sm:p-6">
            <CardTitle className='flex items-center gap-2 text-lg sm:text-xl'>
              <ShieldCheck className='text-primary h-5 w-5 sm:h-6 sm:w-6' /> Recent Matches
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0 sm:p-2 md:p-4">
            {recent.length ? (
              <ScrollArea className='h-[300px] sm:h-[400px] w-full'>
                <Table className="min-w-[700px] sm:min-w-full">
                  <React.Fragment>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs sm:text-sm">Players</TableHead>
                        <TableHead className="text-xs sm:text-sm">Score</TableHead>
                        <TableHead className="text-xs sm:text-sm">Room ΔPts</TableHead>
                        <TableHead className="text-xs sm:text-sm">Global ΔELO</TableHead>
                        <TableHead className="text-xs sm:text-sm">Winner</TableHead>
                        <TableHead className="text-xs sm:text-sm">Date</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {recent.map((m) => (
                        <TableRow key={m.id} className="text-xs sm:text-sm">
                          <TableCell className="whitespace-nowrap">
                            {m.player1.name} vs {m.player2.name}
                          </TableCell>
                          <TableCell>
                            {m.player1.scores} – {m.player2.scores}
                          </TableCell>
                          <TableCell>
                            {m.player1.roomAddedPoints > 0 ? '+' : ''}{m.player1.roomAddedPoints} / {' '}
                            {m.player2.roomAddedPoints > 0 ? '+' : ''}{m.player2.roomAddedPoints}
                          </TableCell>
                           <TableCell>
                            {m.player1.addedPoints > 0 ? '+' : ''}{m.player1.addedPoints} / {' '}
                            {m.player2.addedPoints > 0 ? '+' : ''}{m.player2.addedPoints}
                          </TableCell>
                          <TableCell className='font-semibold'>
                            {m.winner}
                          </TableCell>
                          <TableCell className="whitespace-nowrap">
                            {safeFormatDate(m.timestamp, 'dd.MM.yy HH:mm')}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </React.Fragment>
                </Table>
              </ScrollArea>
            ) : (
              <p className='text-center py-8 text-muted-foreground text-sm sm:text-base'>
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
  inviteDialogOpen,
  setInviteDialogOpen,
}: {
  members: Room["members"];
  recent: Match[];
  regularPlayers: any[];
  isInviting: boolean;
  inviteEmail: string;
  setInviteEmail(v: string): void;
  handleInvite(): void;
  room: Room;
  inviteDialogOpen: boolean;
  setInviteDialogOpen: (open: boolean) => void;
}) {
  const [profiles, setProfiles] = useState<Record<string, UserProfile>>({});

  useEffect(() => {
    if (!members.length) return;
    const fetchProfiles = async () => {
      const profs: Record<string, UserProfile> = {};
      await Promise.all(
        members.map(async (m) => {
          const snap = await getDoc(doc(db, "users", m.userId));
          if (snap.exists()) profs[m.userId] = snap.data() as UserProfile;
        })
      );
      setProfiles(profs);
    };
    fetchProfiles();
  }, [members]);

  return (
    <div className="md:col-span-1">
      <CardTitle className="text-base sm:text-lg flex items-center gap-2 mb-2 sm:mb-3">
        <Users className="text-primary h-5 w-5" /> Members ({members.length})
      </CardTitle>
      <ScrollArea className="h-[250px] sm:h-[300px] border rounded-md p-2 sm:p-3 bg-background">
        {regularPlayers.map((p) => {
          const userProfile = profiles[p.userId] || {};
          const globalElo = userProfile.globalElo ?? '–';
          const elo = p.effectiveRating ?? '–'; // Use effectiveRating which considers roomNewRating
          const rank = userProfile.rank ?? getRank(Number.isFinite(globalElo) ? globalElo : 1000);

          return (
            <div
              key={p.userId}
              className="flex items-center justify-between p-1.5 sm:p-2 hover:bg-muted/50 rounded-md transition-colors"
            >
              <div className="flex items-center gap-2 sm:gap-3 min-w-0"> {/* Added min-w-0 for flex child */}
                <Avatar className="h-8 w-8 sm:h-10 sm:w-10 flex-shrink-0"> {/* Added flex-shrink-0 */}
                  <AvatarImage src={userProfile.photoURL || undefined} alt={p.name}/>
                  <AvatarFallback className="text-xs sm:text-sm">{p.name.charAt(0)}</AvatarFallback>
                </Avatar>
                <div className="min-w-0"> {/* Added min-w-0 for nested flex child */}
                  <p className="font-medium leading-none text-xs sm:text-sm whitespace-nowrap truncate"> {/* Added truncate */}
                    <Link
                      href={`/profile/${p.userId}`}
                      className="hover:underline"
                    >
                      {p.name}
                    </Link>
                    {p.userId === room.creator && (
                      <Crown className="inline ml-1 h-3 w-3 sm:h-4 sm:w-4 text-yellow-500" />
                    )}
                  </p>
                  <p className="text-[10px] sm:text-xs text-muted-foreground whitespace-nowrap">
                    MP&nbsp;{p.totalMatches} · W%&nbsp;{p.winPct}% · Global&nbsp;{globalElo}
                  </p>
                  <p className="text-[10px] text-muted-foreground whitespace-nowrap">
                    Rank&nbsp;{rank}
                  </p>
                </div>
              </div>
              <span className="text-xs sm:text-sm font-semibold text-primary whitespace-nowrap ml-2 flex-shrink-0"> {/* Added flex-shrink-0 */}
                {elo}&nbsp;pts
              </span>
            </div>
          );
        })}
      </ScrollArea>
      {room.creator === useAuth().user?.uid && ( // Only admin can invite
        <Dialog open={inviteDialogOpen} onOpenChange={setInviteDialogOpen}>
          <DialogTrigger asChild>
            <Button
              className="mt-3 sm:mt-4 w-full text-xs sm:text-sm"
              variant="outline"
              size="sm"
              disabled={isInviting}
            >
              <MailPlus className="mr-1 sm:mr-2 h-3 w-3 sm:h-4 sm:w-4" /> Invite Player
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-xs">
            <DialogHeader>
              <DialogTitle className="text-base sm:text-lg">Invite to {room.name}</DialogTitle>
              <DialogDescription className="text-xs sm:text-sm">Enter user's email to invite them.</DialogDescription>
            </DialogHeader>
            <div className="space-y-2 py-2">
              <Label htmlFor="invEmail" className="text-xs sm:text-sm">Email</Label>
              <Input
                id="invEmail"
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                className="text-xs sm:text-sm"
              />
            </div>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button variant="ghost" onClick={() => setInviteDialogOpen(false)} size="sm">Cancel</Button>
              <Button onClick={handleInvite} disabled={isInviting || !inviteEmail.includes('@')} size="sm">
                {isInviting ? 'Sending...' : 'Send Invite'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
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
    id: string;
    score1: string;
    score2: string;
    side1: string;
    side2: string;
  }[];
  setMatchesInput(v: any): void;
  addRow(): void;
  removeRow(idToRemove: string): void;
  saveMatches(): void;
  isRecording: boolean;
}) {
  return (
    <Card className='md:col-span-2 shadow-md'>
      <CardHeader className="p-4 sm:p-6">
        <CardTitle className='flex items-center gap-2 text-base sm:text-lg'>
          <Sword className='text-accent h-5 w-5' /> Record Matches
        </CardTitle>
        <CardDescription className="text-xs sm:text-sm">Select players, sides, and scores for each game.</CardDescription>
      </CardHeader>
      <CardContent className='space-y-3 sm:space-y-4 p-4 sm:p-6'>
        <div className='grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 items-end'>
          <PlayerSelect
            label='Player 1'
            value={player1Id}
            onChange={setPlayer1Id}
            list={members.map((m) => ({
              userId: m.userId,
              name: m.name,
              rating: m.roomNewRating ?? m.rating, // Use roomNewRating
            }))}
            otherPlayerId={player2Id}
          />
          <PlayerSelect
            label='Player 2'
            value={player2Id}
            onChange={setPlayer2Id}
            list={members.map((m) => ({
              userId: m.userId,
              name: m.name,
              rating: m.roomNewRating ?? m.rating, // Use roomNewRating
            }))}
            otherPlayerId={player1Id}
          />
        </div>
        <ScrollArea className="max-h-[200px] sm:max-h-[250px] pr-2"> {/* Scroll for multiple match inputs */}
          {matchesInput.map((m, i) => (
            <MatchRowInput
              key={m.id}
              index={i}
              data={m}
              onChange={(row) =>
                setMatchesInput((currentRows: any[]) => currentRows.map(currentRow => (currentRow.id === m.id ? row : currentRow)))
              }
              onRemove={() => removeRow(m.id)}
              removable={matchesInput.length > 1} // Simplified removable condition
            />
          ))}
        </ScrollArea>
        <Button
          variant='outline'
          size="sm"
          className='flex items-center gap-2 text-xs sm:text-sm w-full sm:w-auto'
          onClick={addRow}
        >
          <Plus className="h-4 w-4" /> Add Game
        </Button>
        <Button
          className='w-full mt-3 sm:mt-4 text-xs sm:text-sm'
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
  otherPlayerId,
}: {
  label: string;
  value: string;
  onChange(v: string): void;
  list: { userId: string; name: string; rating: number }[];
  otherPlayerId?: string;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs sm:text-sm">{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="w-full text-xs sm:text-sm">
          <SelectValue placeholder="Select Player" />
        </SelectTrigger>
        <SelectContent>
          {list.filter(p => p.userId !== otherPlayerId).map((o) => (
            <SelectItem key={o.userId} value={o.userId} className="text-xs sm:text-sm">
              {o.name} ({o.rating})
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

interface MatchRowInputProps {
  index: number;
  data: { id: string; score1: string; score2: string; side1: string; side2: string };
  onChange: (data: MatchRowInputProps['data']) => void;
  onRemove: () => void;
  removable: boolean;
}

function MatchRowInput({
  index,
  data,
  onChange,
  onRemove,
  removable,
}: MatchRowInputProps) {
  const handleSideChange = (playerNum: '1' | '2', newSide: 'left' | 'right' | '') => {
    const otherPlayerNum = playerNum === '1' ? '2' : '1';
    const otherSide = newSide === 'left' ? 'right' : newSide === 'right' ? 'left' : '';
    onChange({
      ...data,
      [`side${playerNum}`]: newSide,
      [`side${otherPlayerNum}`]: otherSide,
    });
  };

  return (
    <div className='grid grid-cols-2 gap-3 sm:gap-4 mb-2 sm:mb-3 relative pt-3'>
      {index > 0 && <Separator className="absolute top-0 left-0 right-0 mb-2"/>}
      {['1', '2'].map((nStr) => {
        const n = nStr as '1' | '2';
        return (
        <div key={n} className="space-y-1">
          <Label className="text-xs sm:text-sm">{`P${n} Score`}</Label>
          <Input
            type='number'
            placeholder="0"
            value={data[`score${n}`] || ''}
            onChange={(e) =>
              onChange({ ...data, [`score${n}`]: e.target.value })
            }
            className="text-xs sm:text-sm h-8 sm:h-9"
          />
          <Label className="text-xs sm:text-sm mt-1 sm:mt-2 block">Side</Label>
           <Select value={data[`side${n}`] || ''} onValueChange={(val) => handleSideChange(n, val as 'left' | 'right' | '')}>
            <SelectTrigger className="w-full text-xs sm:text-sm h-8 sm:h-9">
                <SelectValue placeholder="Side" />
            </SelectTrigger>
            <SelectContent>
                <SelectItem value="left" className="text-xs sm:text-sm">Left</SelectItem>
                <SelectItem value="right" className="text-xs sm:text-sm">Right</SelectItem>
            </SelectContent>
           </Select>
        </div>
      )})}
      {removable && (
        <Button
          variant='ghost'
          size="icon"
          className='absolute top-1/2 right-[-8px] sm:right-0 -translate-y-1/2 h-6 w-6 sm:h-7 sm:w-7' // Adjusted right positioning
          onClick={onRemove}
        >
          <Trash2 className="h-3 w-3 sm:h-4 sm:w-4" />
          <span className="sr-only">Remove game {index + 1}</span>
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
