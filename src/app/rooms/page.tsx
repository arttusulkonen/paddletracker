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
import type { Room } from "@/lib/types";
import { UserProfile } from "@/lib/types";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
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
    const unsubscribe = onSnapshot(
      query(roomsRef, where("members", "array-contains", user.uid)),
      async (snapshot) => {
        const roomsData: Room[] = [];
        for (const docSnap of snapshot.docs) {
          const data = docSnap.data();
          const room: Room = { id: docSnap.id, ...(data as Omit<Room, "id">) };
          if (room.createdBy && !room.creatorName) {
            const profileSnap = await getDoc(
              doc(db, "users", room.createdBy)
            );
            if (profileSnap.exists()) {
              room.creatorName =
                (profileSnap.data() as UserProfile).displayName ||
                "Unknown User";
            }
          }
          roomsData.push(room);
        }
        setRooms(
          roomsData.sort(
            (a, b) =>
              (b.createdAt as any).seconds - (a.createdAt as any).seconds
          )
        );
        setIsLoadingRooms(false);
      },
      (error) => {
        console.error(error);
        toast({
          title: "Error",
          description: "Could not fetch rooms.",
          variant: "destructive",
        });
        setIsLoadingRooms(false);
      }
    );
    return () => unsubscribe();
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
      await addDoc(collection(db, "rooms"), {
        name: roomName.trim(),
        createdBy: user.uid,
        creatorName: userProfile?.displayName || "Unknown User",
        members: [user.uid],
        localElos: { [user.uid]: 1000 },
        createdAt: serverTimestamp(),
      });
      toast({
        title: "Success",
        description: `Room "${roomName}" created successfully.`,
      });
      setRoomName("");
    } catch (error) {
      console.error(error);
      toast({
        title: "Error",
        description: "Failed to create room. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsCreatingRoom(false);
    }
  };

  const filteredRooms = rooms.filter(
    (room) =>
      room.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      room.creatorName
        ?.toLowerCase()
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
            ) : filteredRooms.length > 0 ? (
              <ScrollArea className="h-[400px]">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 p-1">
                  {filteredRooms.map((room) => (
                    <Card key={room.id} className="hover:shadow-md transition-shadow">
                      <CardHeader>
                        <CardTitle className="truncate">{room.name}</CardTitle>
                        <CardDescription>
                          Created by: {room.creatorName}
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <p className="text-sm text-muted-foreground">
                          Members: {room.members.length}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          Your ELO in this room:{" "}
                          {room.localElos[user.uid] ?? "N/A (Join to see)"}
                        </p>
                      </CardContent>
                      <CardFooter>
                        <Button asChild className="w-full">
                          <Link href={`/rooms/${room.id}`}>Enter Room</Link>
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