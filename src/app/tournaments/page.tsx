
'use client';

import { ProtectedRoute } from '@/components/ProtectedRoutes';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Input,
  Label,
  ScrollArea,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { db } from '@/lib/firebase';
import { getUserLite } from '@/lib/friends';
import type { TournamentRoom, UserProfile } from '@/lib/types'; // Use Tournament type
import { getFinnishFormattedDate } from '@/lib/utils';
import { seedKnockoutRounds } from '@/lib/utils/bracketUtils';
import { parseFlexDate, safeFormatDate } from "@/lib/utils/date";
import {
  addDoc,
  arrayUnion,
  collection,
  doc,
  onSnapshot,
  query,
  updateDoc,
  where
} from 'firebase/firestore';
import { PlusCircle, SearchIcon, TrophyIcon, UsersIcon } from 'lucide-react'; // Added TrophyIcon
import Image from "next/image";
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

const PLAYER_COUNTS = [4, 6, 8, 12] as const;
type PlayerCount = (typeof PLAYER_COUNTS)[number];


export default function TournamentRoomsPage() {
  const router = useRouter();
  const { user, userProfile } = useAuth();
  const { toast } = useToast();

  const [tournaments, setTournaments] = useState<TournamentRoom[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    if (!user) {
      setIsLoading(false);
      return;
    }
    const col = collection(db, 'tournament-rooms');
    const q = query(col, where('participantsUids', 'array-contains', user.uid)); // Query by participantsUids
    
    const unsub = onSnapshot(
      q, // Use the filtered query
      snap => {
        const arr = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) } as TournamentRoom));
        arr.sort( // Sort all fetched tournaments
          (a, b) =>
            parseFlexDate(b.createdAt).getTime() - parseFlexDate(a.createdAt).getTime()
        );
        setTournaments(arr); // Set the filtered and sorted tournaments
        setIsLoading(false);
      },
      err => {
        console.error(err);
        toast({
          title: 'Error',
          description: 'Could not load tournaments.',
          variant: 'destructive'
        });
        setIsLoading(false);
      }
    );
    return () => unsub();
  }, [user, toast]);

  /* ───────── данные для создания (друзья + co-players) ───────── */
  const [friends, setFriends] = useState<UserProfile[]>([]);
  const [coPlayers, setCoPlayers] = useState<UserProfile[]>([]);

  useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(doc(db, 'users', user.uid), async snap => {
      if (!snap.exists()) return setFriends([]);
      const ids: string[] = snap.data().friends ?? [];
      const loaded = await Promise.all(
        ids.map(async uid => ({ uid, ...(await getUserLite(uid)) }))
      );
      setFriends(loaded.filter(p => p.name || p.displayName) as UserProfile[]); // Ensure valid profiles
    });
    return () => unsub();
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, 'rooms'),
      where('memberIds', 'array-contains', user.uid)
    );
    const unsub = onSnapshot(q, async snap => {
      const set = new Set<string>();
      snap.docs.forEach(d =>
        (d.data().memberIds ?? []).forEach((uid: string) =>
          uid !== user.uid ? set.add(uid) : null
        )
      );
      const toLoad = Array.from(set).filter(
        uid => !friends.some(f => f.uid === uid)
      );
      const loaded = await Promise.all(
        toLoad.map(async uid => ({ uid, ...(await getUserLite(uid)) }))
      );
      setCoPlayers(loaded.filter(p => p.name || p.displayName) as UserProfile[]); // Ensure valid profiles
    });
    return () => unsub();
  }, [user, friends]);

  const candidates = useMemo(() => {
    const map = new Map<string, UserProfile>();
    [...friends, ...coPlayers].forEach((p) => {
      if (p && (p.name || p.displayName)) { // Ensure p is not null and has a name
        map.set(p.uid, p);
      }
    });
    return Array.from(map.values()).sort((a, b) =>
      (a.name ?? a.displayName ?? '').localeCompare(
        b.name ?? b.displayName ?? ''
      )
    );
  }, [friends, coPlayers]);

  /* ───────── state для popup ───────── */
  const [dialogOpen, setDialogOpen] = useState(false);
  const [name, setName] = useState('');
  const [playerCount, setPlayerCount] = useState<PlayerCount>(4);
  const [selected, setSelected] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);

  /* ───────── helpers ───────── */
  const shuffle = <T,>(arr: T[]) =>
    arr
      .map(v => ({ v, r: Math.random() }))
      .sort((a, b) => a.r - b.r)
      .map(x => x.v);

  const roundRobinMatches = (arr: { userId: string; name: string }[]) => {
    const res: any[] = [];
    for (let i = 0; i < arr.length; i++)
      for (let j = i + 1; j < arr.length; j++)
        res.push({
          matchId: crypto.randomUUID(),
          name: `${arr[i].name} vs ${arr[j].name}`,
          player1: arr[i],
          player2: arr[j],
          scorePlayer1: null,
          scorePlayer2: null,
          matchStatus: 'pending',
          winner: null
        });
    return res;
  };

  /* ───────── создание ───────── */
  const createTournament = async () => {
    if (!user || !userProfile) {
      toast({ title: 'Error', description: 'Log in', variant: 'destructive' });
      return;
    }
    if (!name.trim()) {
      toast({ title: 'Error', description: 'Name required', variant: 'destructive' });
      return;
    }
    if (selected.length + 1 !== playerCount) {
      toast({
        title: 'Error',
        description: `Select exactly ${playerCount} players (including yourself)`,
        variant: 'destructive'
      });
      return;
    }

    setCreating(true);
    try {
      const now = getFinnishFormattedDate();
      const participants = shuffle([
        { userId: user.uid, name: userProfile?.name ?? userProfile?.displayName ?? user.email ?? 'Creator' },
        ...selected.map(uid => {
          const p = candidates.find(c => c.uid === uid)!;
          return { userId: uid, name: p.name ?? p.displayName ?? p.email ?? 'Player' };
        })
      ]).map((p, i) => ({ ...p, seed: i + 1, wins: 0, losses: 0, pointsFor: 0, pointsAgainst: 0 })); // Add stats fields

      const bracket: any = {
        stage: 'inProgress',
        currentRound: 0,
        rounds: [
          {
            label: 'Round-Robin',
            type: 'roundRobin',
            roundIndex: 0,
            status: 'inProgress',
            matches: roundRobinMatches(participants),
            participants // Store participants within the round-robin round
          },
          // Knockout rounds will be seeded by seedKnockoutRounds
        ]
      };
      seedKnockoutRounds(bracket); // Seed all knockout rounds based on RR participants

      const participantUids = participants.map(p => p.userId); // For querying

      const ref = await addDoc(collection(db, 'tournament-rooms'), {
        name: name.trim(),
        createdAt: now,
        creator: user.uid,
        creatorName: userProfile?.name ?? userProfile?.displayName ?? user.email ?? 'Creator',
        participants, // Store full participant objects
        participantsUids: participantUids, // Store UIDs for querying
        bracket,
        champion: null,
        isFinished: false
      });

      await updateDoc(doc(db, 'users', user.uid), {
        tournaments: arrayUnion(ref.id)
      });
      await Promise.all(
        selected.map(uid =>
          updateDoc(doc(db, 'users', uid), { tournaments: arrayUnion(ref.id) })
        )
      );

      toast({ title: 'Tournament created' });
      setName('');
      setSelected([]);
      setPlayerCount(4);
      setDialogOpen(false);
      router.push(`/tournaments/${ref.id}`);
    } catch (e) {
      console.error(e);
      toast({ title: 'Error', description: 'Failed to create tournament.', variant: 'destructive' });
    } finally {
      setCreating(false);
    }
  };

  /* ───────── фильтрация ───────── */
  const filtered = useMemo(
    () =>
      tournaments.filter(t =>
        t.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (t.creatorName ?? '').toLowerCase().includes(searchTerm.toLowerCase()) // Add creatorName search
      ),
    [tournaments, searchTerm]
  );

  /* ───────── UI ───────── */
  return (
    <ProtectedRoute>
      <div className="container mx-auto py-6 sm:py-8 px-2 sm:px-4">
        <div className="flex flex-col sm:flex-row justify-between items-center mb-6 sm:mb-8 gap-4">
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold flex items-center gap-2">
            <TrophyIcon className="h-7 w-7 sm:h-8 sm:w-8 md:h-10 md:w-10 text-primary" /> Tournaments
          </h1>

          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" sm={{size:"default"}}>
                <PlusCircle className="mr-2 h-4 w-4 sm:h-5 sm:w-5" /> New Tournament
              </Button>
            </DialogTrigger>

            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle className="text-lg sm:text-xl">Create Tournament</DialogTitle>
                <DialogDescription className="text-xs sm:text-sm">
                  Give it a name, choose size and pick participants.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-3 sm:space-y-4 py-3 sm:py-4">
                <div className="space-y-1">
                  <Label htmlFor="tournamentName" className="text-xs sm:text-sm">Name</Label>
                  <Input
                    id="tournamentName"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    className="text-sm"
                    placeholder="Annual Ping Pong Cup"
                  />
                </div>

                <div className="space-y-1">
                  <Label htmlFor="playerCount" className="text-xs sm:text-sm">Players</Label>
                  <Select
                    value={String(playerCount)}
                    onValueChange={v => {
                      setPlayerCount(Number(v) as PlayerCount);
                      setSelected([]); // Reset selected on count change
                    }}
                  >
                    <SelectTrigger id="playerCount" className="w-full text-sm">
                      <SelectValue placeholder="Number of Players" />
                    </SelectTrigger>
                    <SelectContent>
                      {PLAYER_COUNTS.map(cnt => (
                        <SelectItem key={cnt} value={String(cnt)} className="text-sm">
                          {cnt} Players
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <p className="text-xs sm:text-sm font-medium mb-1 sm:mb-2">
                    Select participants ({selected.length + 1}/{playerCount})
                  </p>
                  <ScrollArea className="h-32 sm:h-40 border rounded-md p-2">
                    {candidates.length > 0 ? (
                      candidates.map(p => {
                        const disabled =
                          !selected.includes(p.uid) &&
                          selected.length + 1 >= playerCount;
                        return (
                          <label
                            key={p.uid}
                            className={`flex items-center gap-2 py-1.5 cursor-pointer hover:bg-muted/50 p-1 rounded ${disabled
                                ? 'opacity-50 cursor-not-allowed'
                                : ''
                              }`}
                          >
                            <Checkbox
                              id={`cand-${p.uid}`}
                              disabled={disabled}
                              checked={selected.includes(p.uid)}
                              onCheckedChange={v =>
                                v
                                  ? setSelected([...selected, p.uid])
                                  : setSelected(
                                    selected.filter(id => id !== p.uid)
                                  )
                              }
                            />
                            <span className="text-xs sm:text-sm">{p.name ?? p.displayName}</span>
                          </label>
                        );
                      })
                    ) : (
                      <p className="text-xs sm:text-sm text-muted-foreground text-center py-4">
                        No friends or co-players found.
                      </p>
                    )}
                  </ScrollArea>
                   <p className="text-[10px] sm:text-xs text-muted-foreground mt-1">You are automatically included.</p>
                </div>
              </div>

              <DialogFooter className="gap-2 sm:gap-0">
                <Button variant="outline" onClick={() => setDialogOpen(false)} size="sm">Cancel</Button>
                <Button onClick={createTournament} disabled={creating || name.trim().length < 3 || (selected.length + 1 !== playerCount) } size="sm">
                  {creating ? 'Creating…' : 'Create Tournament'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        <Card className="shadow-lg">
          <CardHeader className="p-4 sm:p-6">
             <CardTitle className="text-lg sm:text-xl">Your Tournaments</CardTitle>
            <div className="relative w-full max-w-xs sm:max-w-md mt-2 sm:mt-0">
              <SearchIcon className="absolute left-2 sm:left-3 top-1/2 -translate-y-1/2 h-4 w-4 sm:h-5 sm:w-5 text-muted-foreground" />
              <Input
                placeholder="Search tournaments…"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="pl-8 sm:pl-10 w-full text-sm sm:text-base"
              />
            </div>
          </CardHeader>

          <CardContent className="p-2 sm:p-4 md:p-6">
            {isLoading ? (
              <div className="flex items-center justify-center h-32 sm:h-40">
                <div className="animate-spin h-10 w-10 sm:h-12 sm:w-12 rounded-full border-b-2 border-primary" />
              </div>
            ) : filtered.length ? (
              <ScrollArea className="max-h-[500px] sm:max-h-none">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 p-1">
                  {filtered.map(t => (
                    <Card key={t.id} className="hover:shadow-md transition-shadow flex flex-col">
                      <CardHeader className="pb-2">
                        <CardTitle className="truncate text-base sm:text-lg">{t.name}</CardTitle>
                        <CardDescription className="text-xs">  
                          Created: {safeFormatDate(t.createdAt, "dd.MM.yyyy HH:mm")}
                        </CardDescription>
                         <CardDescription className="text-xs">
                          By: {t.creatorName || "Unknown"}
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="text-xs sm:text-sm flex-grow">
                        <p className="text-muted-foreground">
                          Participants: {t.participants?.length ?? 0}
                        </p>
                        <p className="text-muted-foreground">
                          Status: {t.isFinished ? 'Finished' : 'In Progress'}
                        </p>
                        <p className="text-muted-foreground">
                          Champion: {t.champion?.name || (t.isFinished ? 'Deciding...' : '—')}
                        </p>
                      </CardContent>
                      <CardFooter className="mt-auto">
                        <Button asChild className="w-full" size="sm">
                          <Link href={`/tournaments/${t.id}`}>View Bracket</Link>
                        </Button>
                      </CardFooter>
                    </Card>
                  ))}
                </div>
              </ScrollArea>
            ) : (
              <div className="text-center text-muted-foreground py-8 px-4">
                <Image src="https://placehold.co/300x200.png" alt="No tournaments illustration" width={300} height={200} className="mx-auto mb-4 rounded-md" data-ai-hint="empty state sad trophy" />
                <p className="text-sm sm:text-base">
                  {searchTerm
                    ? 'No tournaments match your search.'
                    : 'You are not part of any tournaments yet. Create one to get started!'}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </ProtectedRoute>
  );
}
