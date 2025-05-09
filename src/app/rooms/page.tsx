// src/app/rooms/page.tsx
"use client";

import { ProtectedRoute } from "@/components/ProtectedRoutes";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { db } from "@/lib/firebase";
import type { Room, UserProfile } from "@/lib/types";
import { getFinnishFormattedDate } from "@/lib/utils";
import {
  addDoc,
  arrayUnion,
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  updateDoc,
  where,
} from "firebase/firestore";
import { PlusCircle, SearchIcon, UsersIcon } from "lucide-react";
import NextImage from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";

export default function RoomsPage() {
  const { user, userProfile } = useAuth();
  const { toast } = useToast();
  const [roomName, setRoomName] = useState("");
  const [isCreatingRoom, setIsCreatingRoom] = useState(false);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [isLoadingRooms, setIsLoadingRooms] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    if (!user) return;
    setIsLoadingRooms(true);
    const roomsRef = collection(db, "rooms");
    const q = query(roomsRef, where("memberIds", "array-contains", user.uid));
    const unsub = onSnapshot(
      q,
      async (snap) => {
        const data: Room[] = [];
        for (const docSnap of snap.docs) {
          const d = docSnap.data() as any;
          if (d.creator && !d.creatorName) {
            const p = await getDoc(doc(db, "users", d.creator));
            if (p.exists()) {
              d.creatorName = (p.data() as UserProfile).name;
            }
          }
          data.push({ id: docSnap.id, ...d });
        }
        setRooms(
          data.sort(
            (a, b) =>
              (b.createdAt as any).localeCompare?.(a.createdAt as any) ||
              0
          )
        );
        setIsLoadingRooms(false);
      },
      (err) => {
        console.error(err);
        toast({
          title: "Error",
          description: "Could not fetch rooms.",
          variant: "destructive",
        });
        setIsLoadingRooms(false);
      }
    );
    return () => unsub();
  }, [user, toast]);

  const handleCreateRoom = async () => {
    if (!user) {
      toast({
        title: "Error",
        description: "You must be logged in to create a room.",
        variant: "destructive",
      });
      return;
    }
    if (!roomName.trim()) {
      toast({
        title: "Error",
        description: "Room name cannot be empty.",
        variant: "destructive",
      });
      return;
    }

    setIsCreatingRoom(true);
    try {
      const ref = await addDoc(collection(db, "rooms"), {
        name: roomName.trim(),
        creator: user.uid,
        creatorName:
          userProfile?.name || userProfile?.name || "",
        createdAt: getFinnishFormattedDate(),
        matches: [],
        seasonHistory: [],
        members: [
          {
            userId: user.uid,
            name:
              userProfile?.name || userProfile?.name || "",
            email: userProfile?.email!,
            rating: 1000,
            maxRating: 1000,
            wins: 0,
            losses: 0,
            roomCreated: getFinnishFormattedDate(),
            role: "admin",
          },
        ],
        memberIds: [user.uid],
      });

      await updateDoc(doc(db, "users", user.uid), {
        rooms: arrayUnion(ref.id),
      });

      toast({
        title: "Success",
        description: `Room "${roomName}" created successfully.`,
      });
      setRoomName("");
    } catch (err) {
      console.error(err);
      toast({
        title: "Error",
        description: "Failed to create room. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsCreatingRoom(false);
    }
  };

  const filtered = rooms.filter(
    (r) =>
      r.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (r.creatorName || "")
        .toLowerCase()
        .includes(searchTerm.toLowerCase())
  );

  return (
    <ProtectedRoute>
      <div className="container mx-auto py-8 px-4">
        <div className="flex flex-col sm:flex-row justify-between items-center mb-8 gap-4">
          <h1 className="text-4xl font-bold tracking-tight flex items-center gap-2">
            <UsersIcon className="h-10 w-10 text-primary" /> Match Rooms
          </h1>
          <Dialog>
            <DialogTrigger asChild>
              <Button size="lg">
                <PlusCircle className="mr-2 h-5 w-5" /> Create New Room
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
              <DialogHeader>
                <DialogTitle>Create a New Match Room</DialogTitle>
                <DialogDescription>
                  Enter a name for your new room. You'll be able to invite
                  players later.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="roomName" className="text-right">
                    Room Name
                  </Label>
                  <Input
                    id="roomName"
                    value={roomName}
                    onChange={(e) => setRoomName(e.target.value)}
                    className="col-span-3"
                    placeholder="e.g., Office Ping Pong Champs"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button
                  onClick={handleCreateRoom}
                  disabled={isCreatingRoom}
                >
                  {isCreatingRoom ? "Creating..." : "Create Room"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        <Card className="mb-8 shadow-lg">
          <CardHeader>
            <CardTitle>Your Rooms</CardTitle>
            <CardDescription>
              Rooms you are a member of. Click a room to view details and play
              matches.
            </CardDescription>
            <div className="relative mt-4">
              <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
              <Input
                placeholder="Search rooms by name or creator..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 w-full max-w-md"
              />
            </div>
          </CardHeader>
          <CardContent>
            {isLoadingRooms ? (
              <div className="flex items-center justify-center h-40">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
              </div>
            ) : filtered.length > 0 ? (
              <ScrollArea className="h-[400px]">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 p-1">
                  {filtered.map((r) => (
                    <Card
                      key={r.id}
                      className="hover:shadow-md transition-shadow"
                    >
                      <CardHeader>
                        <CardTitle className="truncate">
                          {r.name}
                        </CardTitle>
                        <CardDescription>
                          Created by: {r.creatorName}
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <p className="text-sm text-muted-foreground">
                          Members: {r.members.length}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          Your rating in this room:{" "}
                          {
                            r.members.find(
                              (m) => m.userId === user!.uid
                            )?.rating ?? "–"
                          }
                        </p>
                        <p className="text-sm text-muted-foreground">
                          Matches played: {r.matches.length}
                        </p>
                      </CardContent>
                      <CardFooter>
                        <Button asChild className="w-full">
                          <Link href={`/rooms/${r.id}`}>
                            Enter Room
                          </Link>
                        </Button>
                      </CardFooter>
                    </Card>
                  ))}
                </div>
              </ScrollArea>
            ) : (
              <p className="text-center text-muted-foreground py-8">
                {searchTerm
                  ? "No rooms match your search."
                  : "You are not a member of any rooms yet. Create one or get invited!"}
              </p>
            )}
          </CardContent>
        </Card>

        <Separator className="my-8" />

        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle>Public Rooms / Find Rooms</CardTitle>
            <CardDescription>
              Feature coming soon: Browse and join public rooms.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-center text-muted-foreground py-8">
              This section is under construction. Check back later!
            </p>
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