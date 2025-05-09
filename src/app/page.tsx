// src/app/rooms/page.tsx
"use client";

import { ProtectedRoute } from "@/components/ProtectedRoutes";
import { Button } from "@/components/ui/button";
import {
  Card, CardContent, CardDescription, CardFooter,
  CardHeader, CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogDescription,
  DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { db } from "@/lib/firebase";
import { getUserLite } from "@/lib/friends";
import type { Room, UserProfile } from "@/lib/types";
import { getFinnishFormattedDate } from "@/lib/utils";
import {
  addDoc, arrayUnion, collection, doc,
  getDoc, onSnapshot, query, updateDoc, where,
} from "firebase/firestore";
import { PlusCircle, SearchIcon, UsersIcon } from "lucide-react";
import NextImage from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";

export default function RoomsPage() {
  /* ------------------------------------------------------------------ */
  /* state & auth ------------------------------------------------------ */
  const { user, userProfile } = useAuth();
  const { toast } = useToast();
  const [roomName, setRoomName] = useState("");
  const [isCreatingRoom, setBusy] = useState(false);

  /* rooms list */
  const [rooms, setRooms] = useState<Room[]>([]);
  const [isLoadingRooms, setLR] = useState(true);
  const [searchTerm, setSearch] = useState("");

  /* friends for invite ----------------------------------------------- */
  const [friends, setFriends] = useState<UserProfile[]>([]);
  const [selectedFriends, setSelected] = useState<string[]>([]);

  /* ------------------------------------------------------------------ */
  /* load my rooms ----------------------------------------------------- */
  useEffect(() => {
    if (!user) return;
    setLR(true);
    const q = query(
      collection(db, "rooms"),
      where("memberIds", "array-contains", user.uid)
    );
    const unsub = onSnapshot(
      q,
      async (snap) => {
        const arr: Room[] = [];
        for (const d of snap.docs) {
          const data = d.data() as Room;
          /* resolve creator name once */
          if (data.creator && !data.creatorName) {
            const p = await getDoc(doc(db, "users", data.creator));
            if (p.exists()) data.creatorName = (p.data() as UserProfile).name;
          }
          arr.push({ id: d.id, ...data });
        }
        setRooms(arr.sort((a, b) => (b.createdAt as any).localeCompare(a.createdAt as any)));
        setLR(false);
      },
      () => {
        toast({ title: "Error", description: "Could not fetch rooms", variant: "destructive" });
        setLR(false);
      }
    );
    return () => unsub();
  }, [user, toast]);

  /* ------------------------------------------------------------------ */
  /* load friends for invite ------------------------------------------ */
  useEffect(() => {
    (async () => {
      if (!userProfile?.friends?.length) { setFriends([]); return; }
      const arr = await Promise.all(userProfile.friends.map((id) => getUserLite(id)));
      setFriends(arr.filter(Boolean) as UserProfile[]);
    })();
  }, [userProfile?.friends]);

  /* ------------------------------------------------------------------ */
  /* create room handler ---------------------------------------------- */
  const handleCreateRoom = async () => {
    if (!user!) return toast({ title: "Error", description: "Login first", variant: "destructive" });
    if (!roomName.trim())
      return toast({ title: "Error", description: "Room name cannot be empty", variant: "destructive" });

    setBusy(true);
    try {
      /* -------- формируем участников -------------------------------- */
      const initialMembers = [
        {
          userId: user.uid,
          name: userProfile!.name,
          email: userProfile!.email,
          rating: 1000,
          wins: 0,
          losses: 0,
          role: "admin" as const,
          roomCreated: getFinnishFormattedDate(),
        },
        ...friends
          .filter((f) => selectedFriends.includes(f.uid))
          .map((f) => ({
            userId: f.uid,
            name: f.name,
            email: f.email,
            rating: 1000,
            wins: 0,
            losses: 0,
            role: "editor" as const,
            roomCreated: getFinnishFormattedDate(),
          })),
      ];

      /* -------- создаём room --------------------------------------- */
      const ref = await addDoc(collection(db, "rooms"), {
        name: roomName.trim(),
        creator: user.uid,
        creatorName: userProfile!.name,
        createdAt: getFinnishFormattedDate(),
        matches: [],
        seasonHistory: [],
        members: initialMembers,
        memberIds: initialMembers.map((m) => m.userId),
      });

      /* -------- каждому участнику добавляем room ------------------- */
      await Promise.all(
        initialMembers.map((m) =>
          updateDoc(doc(db, "users", m.userId), {
            rooms: arrayUnion(ref.id),
          })
        )
      );

      toast({ title: "Success", description: `Room “${roomName}” created` });
      setRoomName("");
      setSelected([]);
    } catch (e) {
      console.error(e);
      toast({ title: "Error", description: "Failed to create room", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  /* ------------------------------------------------------------------ */
  const filtered = rooms.filter(
    (r) =>
      r.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (r.creatorName || "").toLowerCase().includes(searchTerm.toLowerCase())
  );

  /* ------------------------------------------------------------------ */
  return (
    <ProtectedRoute>
      <div className="container mx-auto py-8 px-4">
        {/* ---------------------------------------------------------------- */}
        {/* Top bar -------------------------------------------------------- */}
        <div className="flex flex-col sm:flex-row justify-between items-center mb-8 gap-4">
          <h1 className="text-4xl font-bold tracking-tight flex items-center gap-2">
            <UsersIcon className="h-10 w-10 text-primary" /> Match Rooms
          </h1>

          {/* -------- create room dialog -------------------------------- */}
          <Dialog>
            <DialogTrigger asChild>
              <Button size="lg">
                <PlusCircle className="mr-2 h-5 w-5" /> Create New Room
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[420px]">
              <DialogHeader>
                <DialogTitle>Create a New Match Room</DialogTitle>
                <DialogDescription>Give it a name and (optionally) invite friends right away.</DialogDescription>
              </DialogHeader>

              <div className="grid gap-4 py-4">
                <Label htmlFor="roomName">Room Name</Label>
                <Input id="roomName" value={roomName} onChange={(e) => setRoomName(e.target.value)} placeholder="e.g. Friday League" />

                <Separator className="my-2" />

                <p className="text-sm font-medium">Invite friends:</p>
                <ScrollArea className="h-44 pr-2 border rounded-md">
                  {friends.length ? (
                    friends.map((f) => (
                      <label key={f.uid} className="flex items-center gap-2 px-2 py-1">
                        <Checkbox
                          checked={selectedFriends.includes(f.uid)}
                          onCheckedChange={(v) =>
                            setSelected((prev) => v ? [...prev, f.uid] : prev.filter((id) => id !== f.uid))
                          }
                        />
                        <span>{f.name}</span>
                      </label>
                    ))
                  ) : (
                    <p className="p-2 text-muted-foreground">No friends to invite.</p>
                  )}
                </ScrollArea>
              </div>

              <DialogFooter>
                <Button onClick={handleCreateRoom} disabled={isCreatingRoom}>
                  {isCreatingRoom ? "Creating…" : "Create Room"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {/* ---------------------------------------------------------------- */}
        {/* My rooms list --------------------------------------------------- */}
        <Card className="mb-8 shadow-lg">
          <CardHeader>
            <CardTitle>Your Rooms</CardTitle>
            <CardDescription>Rooms you belong to.</CardDescription>

            <div className="relative mt-4">
              <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
              <Input
                placeholder="Search rooms…"
                value={searchTerm}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10 w-full max-w-md"
              />
            </div>
          </CardHeader>

          <CardContent>
            {isLoadingRooms ? (
              <div className="flex items-center justify-center h-40">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
              </div>
            ) : filtered.length ? (
              <ScrollArea className="h-[400px]">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 p-1">
                  {filtered.map((r) => (
                    <Card key={r.id} className="hover:shadow-md transition-shadow">
                      <CardHeader>
                        <CardTitle className="truncate">{r.name}</CardTitle>
                        <CardDescription>Created by: {r.creatorName}</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <p className="text-sm text-muted-foreground">Members: {r.members.length}</p>
                        <p className="text-sm text-muted-foreground">
                          Your rating: {r.members.find((m) => m.userId === user!.uid)?.rating ?? "–"}
                        </p>
                        <p className="text-sm text-muted-foreground">Matches: {r.matches.length}</p>
                      </CardContent>
                      <CardFooter>
                        <Button asChild className="w-full">
                          <Link href={`/rooms/${r.id}`}>Enter Room</Link>
                        </Button>
                      </CardFooter>
                    </Card>
                  ))}
                </div>
              </ScrollArea>
            ) : (
              <p className="text-center text-muted-foreground py-8">
                {searchTerm ? "No rooms found." : "Not a member of any rooms yet."}
              </p>
            )}
          </CardContent>
        </Card>

        {/* ---------------------------------------------------------------- */}
        {/* Placeholder for public rooms ----------------------------------- */}
        <Separator className="my-8" />
        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle>Public Rooms / Find Rooms</CardTitle>
            <CardDescription>Feature coming soon…</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-center text-muted-foreground py-8">Under construction…</p>
            <div className="flex justify-center">
              <NextImage
                src="https://picsum.photos/seed/construction/400/200"
                alt="Under Construction"
                width={400}
                height={200}
                className="rounded-md"
              />
            </div>
          </CardContent>
        </Card>
      </div>
    </ProtectedRoute>
  );
}