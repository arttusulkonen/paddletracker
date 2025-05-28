
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
} from '@/components/ui';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { db } from '@/lib/firebase';
import { getUserLite } from '@/lib/friends';
import type { Room, UserProfile } from '@/lib/types';
import { getFinnishFormattedDate } from '@/lib/utils';
import { parseFlexDate, safeFormatDate } from '@/lib/utils/date';
import {
  addDoc,
  arrayUnion,
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  updateDoc,
  where,
} from 'firebase/firestore';
import { PlusCircle, SearchIcon, UsersIcon } from 'lucide-react';
import Image from "next/image"; // Import next/image
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';

const normalizeDateStr = (str: string) =>
  str.includes(' ') ? str : `${str} 00.00.00`;

export default function RoomsPage() {
  const { user, userProfile } = useAuth();
  const { toast } = useToast();

  const [roomName, setRoomName] = useState('');
  const [isCreatingRoom, setIsCreatingRoom] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false); // Control dialog state

  const [rooms, setRooms] = useState<Room[]>([]);
  const [isLoadingRooms, setIsLoadingRooms] = useState(true);

  const [friends, setFriends] = useState<UserProfile[]>([]);
  const [coPlayers, setCoPlayers] = useState<UserProfile[]>([]);
  const [selectedFriends, setSelectedFriends] = useState<string[]>([]);

  const [searchTerm, setSearchTerm] = useState('');
  const [myMatches, setMyMatches] = useState<Record<string, number>>({});
  const [roomRating, setRoomRating] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!user) return;
    setIsLoadingRooms(true);
    const roomsQuery = query(
      collection(db, 'rooms'),
      where('memberIds', 'array-contains', user.uid)
    );
    const unsub = onSnapshot(
      roomsQuery,
      async (snap) => {
        let list = await Promise.all(
          snap.docs.map(async (d) => {
            const data = d.data() as any;
            return {
              id: d.id,
              ...data,
              createdRaw: data.createdAt || data.roomCreated || '',
            };
          })
        );
        list.sort((a, b) => {
          const da = parseFlexDate(normalizeDateStr(a.createdRaw));
          const db = parseFlexDate(normalizeDateStr(b.createdRaw));
          return db.getTime() - da.getTime();
        });
        const missing = Array.from(
          new Set(list.filter((r) => !r.creatorName).map((r) => r.creator!))
        );
        const creatorNameMap: Record<string, string> = {};
        await Promise.all(
          missing.map(async (uid) => {
            const s = await getDoc(doc(db, 'users', uid));
            if (s.exists()) creatorNameMap[uid] = (s.data() as any).name || 'Unknown';
          })
        );
        list = list.map((r) =>
          !r.creatorName && r.creator && creatorNameMap[r.creator]
            ? { ...r, creatorName: creatorNameMap[r.creator] }
            : r
        );
        const ratingMap: Record<string, number> = {};
        list.forEach((r) => {
          const me = r.members.find((m) => m.userId === user.uid);
          ratingMap[r.id] = me?.rating ?? 0;
        });
        setRooms(list);
        setRoomRating(ratingMap);
        setIsLoadingRooms(false);
      },
      () => {
        setIsLoadingRooms(false);
      }
    );
    return () => unsub();
  }, [user]);

  const loadMyCounts = useCallback(async () => {
    if (!user || !rooms.length) return;
    const res: Record<string, number> = {};
    await Promise.all(
      rooms.map(async (r) => {
        const [s1, s2] = await Promise.all([
          getDocs(
            query(
              collection(db, 'matches'),
              where('roomId', '==', r.id),
              where('player1Id', '==', user.uid)
            )
          ),
          getDocs(
            query(
              collection(db, 'matches'),
              where('roomId', '==', r.id),
              where('player2Id', '==', user.uid)
            )
          ),
        ]);
        res[r.id] = s1.size + s2.size;
      })
    );
    setMyMatches(res);
  }, [rooms, user]);
  useEffect(() => {
    loadMyCounts();
  }, [loadMyCounts]);

  useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(doc(db, 'users', user.uid), async (snap) => {
      if (!snap.exists()) return setFriends([]);
      const ids: string[] = snap.data().friends ?? [];
      const loaded = await Promise.all(
        ids.map(async (uid) => ({ uid, ...(await getUserLite(uid)) }))
      );
      setFriends(loaded);
    });
    return () => unsub();
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const loadCoPlayers = async () => {
      const unionIds = new Set<string>();
      rooms.forEach((r) =>
        (r.memberIds ?? []).forEach((id: string) => id !== user.uid && unionIds.add(id))
      );
      const toLoad = Array.from(unionIds).filter(
        (uid) => !friends.some((f) => f.uid === uid)
      );
      const loaded = await Promise.all(
        toLoad.map(async (uid) => ({ uid, ...(await getUserLite(uid)) }))
      );
      setCoPlayers(loaded);
    };
    loadCoPlayers();
  }, [rooms, friends, user]);

  const inviteCandidates = useMemo(() => {
    const map = new Map<string, UserProfile>();
    [...friends, ...coPlayers].forEach((p) => map.set(p.uid, p));
    return Array.from(map.values()).sort((a, b) =>
      (a.name ?? a.displayName ?? '').localeCompare(
        b.name ?? b.displayName ?? ''
      )
    );
  }, [friends, coPlayers]);

  const handleCreateRoom = async () => {
    if (!user || !userProfile) { // Added userProfile check
      toast({ title: 'Error', description: 'Log in to create a room', variant: 'destructive' });
      return;
    }
    if (!roomName.trim()) {
      toast({ title: 'Error', description: 'Room name cannot be empty', variant: 'destructive' });
      return;
    }
    setIsCreatingRoom(true);
    try {
      const now = getFinnishFormattedDate();
      const initialMembers = [
        {
          userId: user.uid,
          name: userProfile?.name ?? userProfile?.displayName ?? user.email ?? 'Creator', // Enhanced fallback
          email: userProfile?.email ?? user.email!,
          rating: 1000,
          wins: 0,
          losses: 0,
          date: now,
          role: 'admin' as const,
        },
        ...selectedFriends.map((uid) => {
          const f = inviteCandidates.find((x) => x.uid === uid)!;
          return {
            userId: uid,
            name: f.name ?? f.displayName ?? f.email ?? 'Player', // Enhanced fallback
            email: f.email ?? '',
            rating: 1000,
            wins: 0,
            losses: 0,
            date: now,
            role: 'editor' as const,
          };
        }),
      ];
      const ref = await addDoc(collection(db, 'rooms'), {
        name: roomName.trim(),
        creator: user.uid,
        creatorName: userProfile?.name ?? userProfile?.displayName ?? user.email ?? 'Creator',
        createdAt: now,
        members: initialMembers,
        memberIds: [user.uid, ...selectedFriends],
      });
      await updateDoc(doc(db, 'users', user.uid), {
        rooms: arrayUnion(ref.id),
      });
      await Promise.all(
        selectedFriends.map((uid) =>
          updateDoc(doc(db, 'users', uid), { rooms: arrayUnion(ref.id) })
        )
      );
      toast({ title: 'Success', description: `Room "${roomName}" created` });
      setRoomName('');
      setSelectedFriends([]);
      setDialogOpen(false); // Close dialog on success
    } catch {
      toast({ title: 'Error', description: 'Failed to create room', variant: 'destructive' });
    } finally {
      setIsCreatingRoom(false);
    }
  };

  const filteredRooms = useMemo(
    () =>
      rooms.filter(
        (r) =>
          r.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          (r.creatorName ?? '').toLowerCase().includes(searchTerm.toLowerCase())
      ),
    [rooms, searchTerm]
  );

  return (
    <ProtectedRoute>
      <div className="container mx-auto py-6 sm:py-8 px-2 sm:px-4">
        <div className="flex flex-col sm:flex-row justify-between items-center mb-6 sm:mb-8 gap-4">
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold flex items-center gap-2">
            <UsersIcon className="h-7 w-7 sm:h-8 sm:w-8 md:h-10 md:w-10 text-primary" />
            Match Rooms
          </h1>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" sm={{size: "lg"}}>
                <PlusCircle className="mr-2 h-4 w-4 sm:h-5 sm:w-5" />
                Create New Room
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Create a Match Room</DialogTitle>
                <DialogDescription>
                  Give your room a name and invite friends or past teammates.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-1">
                  <Label htmlFor="roomName" className="text-sm">
                    Name
                  </Label>
                  <Input
                    id="roomName"
                    value={roomName}
                    onChange={(e) => setRoomName(e.target.value)}
                    placeholder="Office Ping Pong Champs"
                  />
                </div>
                <p className="text-sm font-medium">Invite players:</p>
                <ScrollArea className="h-32 sm:h-40 border rounded-md p-2">
                  {inviteCandidates.length ? (
                    inviteCandidates.map((p) => (
                      <label key={p.uid} className="flex items-center gap-2 py-1.5 cursor-pointer hover:bg-muted/50 p-1 rounded">
                        <Checkbox
                          id={`invite-${p.uid}`}
                          checked={selectedFriends.includes(p.uid)}
                          onCheckedChange={(v) =>
                            v
                              ? setSelectedFriends([...selectedFriends, p.uid])
                              : setSelectedFriends(
                                selectedFriends.filter((id) => id !== p.uid)
                              )
                          }
                        />
                        <span className="text-sm">{p.name ?? p.displayName}</span>
                      </label>
                    ))
                  ) : (
                    <p className="text-xs sm:text-sm text-muted-foreground text-center py-4">
                      No friends or co-players yet
                    </p>
                  )}
                </ScrollArea>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
                <Button onClick={handleCreateRoom} disabled={isCreatingRoom}>
                  {isCreatingRoom ? 'Creating…' : 'Create'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
        <Card className="mb-8 shadow-lg">
          <CardHeader className="p-4 sm:p-6">
            <CardTitle className="text-lg sm:text-xl">Your Rooms</CardTitle>
            <CardDescription className="text-xs sm:text-sm">Click a card to enter and record matches</CardDescription>
            <div className="relative mt-2 sm:mt-4">
              <SearchIcon className="absolute left-2 sm:left-3 top-1/2 -translate-y-1/2 h-4 w-4 sm:h-5 sm:w-5 text-muted-foreground" />
              <Input
                placeholder="Search by name or creator…"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8 sm:pl-10 w-full max-w-xs sm:max-w-md text-sm sm:text-base"
              />
            </div>
          </CardHeader>
          <CardContent className="p-2 sm:p-4 md:p-6">
            {isLoadingRooms ? (
              <div className="flex items-center justify-center h-32 sm:h-40">
                <div className="animate-spin h-10 w-10 sm:h-12 sm:w-12 rounded-full border-b-2 border-primary" />
              </div>
            ) : filteredRooms.length ? (
              <ScrollArea className="max-h-[500px] sm:max-h-none"> {/* Limit height on mobile for scroll */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 p-1">
                  {filteredRooms.map((r) => (
                    <Card key={r.id} className="hover:shadow-md transition-shadow flex flex-col">
                      <CardHeader className="pb-2">
                        <CardTitle className="truncate text-base sm:text-lg">{r.name}</CardTitle>
                        <CardDescription className="text-xs">Created by: {r.creatorName}</CardDescription>
                        <CardDescription className="text-xs">
                          Created:{' '}
                          {r.createdRaw
                            ? safeFormatDate(normalizeDateStr(r.createdRaw), 'dd.MM.yyyy')
                            : r.roomCreated}
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="text-xs sm:text-sm flex-grow">
                        <p className="text-muted-foreground">
                          Members: {r.members.length}
                        </p>
                        <p className="text-muted-foreground">
                          Matches played: {myMatches[r.id] ?? '–'}
                        </p>
                        <p className="text-muted-foreground">
                          Your rating: {roomRating[r.id] ?? '–'}
                        </p>
                      </CardContent>
                      <CardFooter className="mt-auto">
                        <Button asChild className="w-full" size="sm">
                          <Link href={`/rooms/${r.id}`}>Enter Room</Link>
                        </Button>
                      </CardFooter>
                    </Card>
                  ))}
                </div>
              </ScrollArea>
            ) : (
              <div className="text-center text-muted-foreground py-8 px-4">
                 <Image src="https://placehold.co/300x200.png" alt="No rooms illustration" width={300} height={200} className="mx-auto mb-4 rounded-md" data-ai-hint="empty state sad" />
                <p className="text-sm sm:text-base">
                  {searchTerm
                    ? 'No rooms match your search.'
                    : 'You are not a member of any rooms yet. Why not create one?'}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </ProtectedRoute>
  );
}
