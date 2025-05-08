"use client";

import { ProtectedRoute } from "@/components/ProtectedRoutes";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
  DialogClose,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { calculateEloRatings } from "@/lib/elo";
import { db } from "@/lib/firebase";
import type { Match, Room, UserProfile } from "@/lib/types";
import {
  addDoc,
  arrayUnion,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import {
  ArrowLeft,
  Crown,
  MailPlus,
  ShieldCheck,
  Sword,
  UserCircle,
  UsersIcon,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export default function RoomPage() {
  const { user, userProfile } = useAuth();
  const { toast } = useToast();
  const params = useParams();
  const roomId = params.roomId as string;
  const router = useRouter();

  const [room, setRoom] = useState<Room | null>(null);
  const [membersProfiles, setMembersProfiles] = useState<
    Record<string, UserProfile>
  >({});
  const [isLoading, setIsLoading] = useState(true);
  const [inviteEmail, setInviteEmail] = useState("");
  const [isInviting, setIsInviting] = useState(false);

  const [player1Id, setPlayer1Id] = useState("");
  const [player2Id, setPlayer2Id] = useState("");
  const [player1Score, setPlayer1Score] = useState<number | string>("");
  const [player2Score, setPlayer2Score] = useState<number | string>("");
  const [isRecordingMatch, setIsRecordingMatch] = useState(false);
  const [recentMatches, setRecentMatches] = useState<Match[]>([]);

  useEffect(() => {
    if (!roomId || !user) return;

    setIsLoading(true);
    const roomRef = doc(db, "rooms", roomId);

    const unsubscribeRoom = onSnapshot(
      roomRef,
      async (docSnap) => {
        if (!docSnap.exists()) {
          toast({
            title: "Error",
            description: "Room not found.",
            variant: "destructive",
          });
          router.push("/rooms");
          return;
        }

        const roomData = { id: docSnap.id, ...docSnap.data() } as Room;
        if (!roomData.members.includes(user.uid)) {
          toast({
            title: "Access Denied",
            description: "You are not a member of this room.",
            variant: "destructive",
          });
          router.push("/rooms");
          return;
        }
        setRoom(roomData);

        const profiles: Record<string, UserProfile> = {};
        for (const uid of roomData.members) {
          if (!membersProfiles[uid]) {
            const userSnap = await getDoc(doc(db, "users", uid));
            if (userSnap.exists()) {
              profiles[uid] = userSnap.data() as UserProfile;
            }
          } else {
            profiles[uid] = membersProfiles[uid];
          }
        }
        setMembersProfiles((prev) => ({ ...prev, ...profiles }));
        setIsLoading(false);
      },
      (error) => {
        console.error(error);
        toast({
          title: "Error",
          description: "Could not fetch room details.",
          variant: "destructive",
        });
        setIsLoading(false);
        router.push("/rooms");
      }
    );

    // recent matches query
    const matchesRef = collection(db, "matches");
    const qMatches = query(
      matchesRef,
      where("roomId", "==", roomId),
      where("playedAt", "!=", null),
      orderBy("playedAt", "desc"),
      limit(10)
    );
    const unsubscribeMatches = onSnapshot(qMatches, (snapshot) => {
      const data: Match[] = [];
      snapshot.forEach((d) => data.push({ id: d.id, ...d.data() } as Match));
      setRecentMatches(data);
    });

    return () => {
      unsubscribeRoom();
      unsubscribeMatches();
    };
  }, [roomId, user, router, toast]);

  const handleInvitePlayer = async () => {
    if (!inviteEmail.trim() || !room || !user) return;
    setIsInviting(true);
    try {
      const usersRef = collection(db, "users");
      const q = query(
        usersRef,
        where("email", "==", inviteEmail.trim())
      );
      const snapshot = await getDocs(q);
      if (snapshot.empty) {
        toast({
          title: "Not Found",
          description: "No user found with this email.",
          variant: "destructive",
        });
        setIsInviting(false);
        return;
      }
      const docSnap = snapshot.docs[0];
      const invitedUser = docSnap.data() as UserProfile;
      const uid = docSnap.id;
      if (room.members.includes(uid)) {
        toast({
          title: "Already Member",
          description: "This user is already in the room.",
        });
        setIsInviting(false);
        return;
      }
      const roomRef = doc(db, "rooms", roomId);
      const updatedElos = { ...room.localElos, [uid]: 1000 };
      await updateDoc(roomRef, {
        members: arrayUnion(uid),
        localElos: updatedElos,
      });
      setMembersProfiles((p) => ({ ...p, [uid]: invitedUser }));
      toast({
        title: "Success",
        description: `${invitedUser.displayName || invitedUser.email} invited.`,
      });
      setInviteEmail("");
    } catch (error) {
      console.error(error);
      toast({
        title: "Error",
        description: "Failed to invite player.",
        variant: "destructive",
      });
    } finally {
      setIsInviting(false);
    }
  };

  const handleRecordMatch = async () => {
    if (!user || !userProfile || !room) return;
    const p1 = Number(player1Score),
      p2 = Number(player2Score);
    if (
      !player1Id ||
      !player2Id ||
      player1Id === player2Id ||
      isNaN(p1) ||
      isNaN(p2) ||
      p1 < 0 ||
      p2 < 0 ||
      p1 === p2
    ) {
      toast({
        title: "Invalid",
        description:
          "Select two different players and valid, non-draw scores.",
        variant: "destructive",
      });
      return;
    }
    setIsRecordingMatch(true);
    try {
      const m1 = membersProfiles[player1Id]!,
        m2 = membersProfiles[player2Id]!;
      const roomEloRes = calculateEloRatings(
        room.localElos[player1Id],
        room.localElos[player2Id],
        p1 > p2 ? 1 : 0
      );
      const globalEloRes = calculateEloRatings(
        m1.globalElo,
        m2.globalElo,
        p1 > p2 ? 1 : 0
      );
      const batch = writeBatch(db);
      const matchRef = doc(collection(db, "matches"));
      batch.set(matchRef, {
        player1Id,
        player2Id,
        player1Name: m1.displayName,
        player2Name: m2.displayName,
        player1Score: p1,
        player2Score: p2,
        winnerId: p1 > p2 ? player1Id : player2Id,
        playedAt: serverTimestamp(),
        eloChangePlayer1: globalEloRes.eloChangeP1,
        eloChangePlayer2: globalEloRes.eloChangeP2,
        roomId,
      });
      const roomRef = doc(db, "rooms", roomId);
      batch.update(roomRef, {
        [`localElos.${player1Id}`]: roomEloRes.newPlayer1Rating,
        [`localElos.${player2Id}`]: roomEloRes.newPlayer2Rating,
      });
      const u1 = doc(db, "users", player1Id),
        u2 = doc(db, "users", player2Id);
      batch.update(u1, {
        globalElo: globalEloRes.newPlayer1Rating,
        matchesPlayed: m1.matchesPlayed + 1,
        wins: m1.wins + (p1 > p2 ? 1 : 0),
        losses: m1.losses + (p1 < p2 ? 1 : 0),
        eloHistory: arrayUnion({
          date: serverTimestamp(),
          elo: globalEloRes.newPlayer1Rating,
        }),
      });
      batch.update(u2, {
        globalElo: globalEloRes.newPlayer2Rating,
        matchesPlayed: m2.matchesPlayed + 1,
        wins: m2.wins + (p2 > p1 ? 1 : 0),
        losses: m2.losses + (p2 < p1 ? 1 : 0),
        eloHistory: arrayUnion({
          date: serverTimestamp(),
          elo: globalEloRes.newPlayer2Rating,
        }),
      });
      await batch.commit();
      toast({ title: "Match Recorded" });
      setPlayer1Id("");
      setPlayer2Id("");
      setPlayer1Score("");
      setPlayer2Score("");
    } catch (error) {
      console.error(error);
      toast({
        title: "Error",
        description: "Failed to record match.",
        variant: "destructive",
      });
    } finally {
      setIsRecordingMatch(false);
    }
  };

  if (!room || isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-primary"></div>
      </div>
    );
  }

  const roomMembersArray = room.members
    .map((uid) => ({
      uid,
      ...membersProfiles[uid]!,
      roomElo: room.localElos[uid],
    }))
    .sort((a, b) => (b.roomElo || 0) - (a.roomElo || 0));

  return (
    <ProtectedRoute>
      <div className="container mx-auto py-8 px-4">
        <Button
          variant="outline"
          onClick={() => router.push("/rooms")}
          className="mb-6"
        >
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to Rooms
        </Button>

        <Card className="mb-8 shadow-xl">
          <CardHeader className="bg-muted/50">
            <CardTitle className="text-3xl font-bold">{room.name}</CardTitle>
            <CardDescription>
              Created by:{" "}
              {membersProfiles[room.createdBy]?.displayName || "Unknown User"}
            </CardDescription>
          </CardHeader>
          <CardContent className="p-6 grid md:grid-cols-3 gap-6">
            <div>
              <h3 className="text-xl font-semibold mb-3 flex items-center gap-2">
                <UsersIcon className="text-primary" /> Members (
                {roomMembersArray.length})
              </h3>
              <ScrollArea className="h-[300px] border rounded-md p-3 bg-background">
                {roomMembersArray.map((m) => (
                  <div
                    key={m.uid}
                    className="flex items-center justify-between p-2 hover:bg-muted/50 rounded-md"
                  >
                    <div className="flex items-center gap-3">
                      <Avatar className="h-8 w-8">
                        <AvatarImage src={m.photoURL || undefined} />
                        <AvatarFallback>
                          {m.displayName?.[0] || <UserCircle />}
                        </AvatarFallback>
                      </Avatar>
                      <span className="font-medium">
                        {m.displayName || "Unknown"}
                      </span>
                      {m.uid === room.createdBy && (
                        <Crown className="h-4 w-4 text-yellow-500" />
                      )}
                    </div>
                    <span className="text-sm font-semibold text-primary">
                      {m.roomElo || 1000} ELO
                    </span>
                  </div>
                ))}
              </ScrollArea>
              {user.uid === room.createdBy && (
                <Dialog>
                  <DialogTrigger asChild>
                    <Button className="mt-4 w-full" variant="outline">
                      <MailPlus className="mr-2 h-4 w-4" /> Invite Player
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Invite to {room.name}</DialogTitle>
                      <DialogDescription>
                        Enter their email address.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-2 py-2">
                      <Label htmlFor="inviteEmail">Email</Label>
                      <Input
                        id="inviteEmail"
                        type="email"
                        value={inviteEmail}
                        onChange={(e) => setInviteEmail(e.target.value)}
                        placeholder="player@example.com"
                      />
                    </div>
                    <DialogFooter>
                      <DialogClose asChild>
                        <Button variant="ghost">Cancel</Button>
                      </DialogClose>
                      <Button onClick={handleInvitePlayer} disabled={isInviting}>
                        {isInviting ? "Inviting..." : "Send Invite"}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              )}
            </div>

            <Card className="md:col-span-2 shadow-md">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Sword className="text-accent" /> Record Match
                </CardTitle>
                <CardDescription>
                  Select two different players and enter their scores.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4 items-end">
                  <div>
                    <Label htmlFor="player1">Player 1</Label>
                    <Select
                      id="player1"
                      value={player1Id}
                      onValueChange={setPlayer1Id}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select Player 1" />
                      </SelectTrigger>
                      <SelectContent>
                        {roomMembersArray
                          .filter((m) => m.uid !== player2Id)
                          .map((m) => (
                            <SelectItem key={m.uid} value={m.uid}>
                              {m.displayName} ({m.roomElo})
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="player1Score">Score</Label>
                    <Input
                      id="player1Score"
                      type="number"
                      placeholder="P1 Score"
                      value={player1Score}
                      onChange={(e) => setPlayer1Score(e.target.value)}
                      min={0}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 items-end">
                  <div>
                    <Label htmlFor="player2">Player 2</Label>
                    <Select
                      id="player2"
                      value={player2Id}
                      onValueChange={setPlayer2Id}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select Player 2" />
                      </SelectTrigger>
                      <SelectContent>
                        {roomMembersArray
                          .filter((m) => m.uid !== player1Id)
                          .map((m) => (
                            <SelectItem key={m.uid} value={m.uid}>
                              {m.displayName} ({m.roomElo})
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="player2Score">Score</Label>
                    <Input
                      id="player2Score"
                      type="number"
                      placeholder="P2 Score"
                      value={player2Score}
                      onChange={(e) => setPlayer2Score(e.target.value)}
                      min={0}
                    />
                  </div>
                </div>

                <Button
                  className="w-full"
                  onClick={handleRecordMatch}
                  disabled={isRecordingMatch}
                >
                  {isRecordingMatch
                    ? "Recording..."
                    : "Record Match & Update ELO"}
                </Button>
              </CardContent>
            </Card>
          </CardContent>
        </Card>

        <Separator className="my-8" />

        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="text-primary" /> Recent Matches
            </CardTitle>
          </CardHeader>
          <CardContent>
            {recentMatches.length > 0 ? (
              <ScrollArea className="h-[300px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Player 1</TableHead>
                      <TableHead>Player 2</TableHead>
                      <TableHead>Score</TableHead>
                      <TableHead>Winner</TableHead>
                      <TableHead>Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recentMatches.map((m) => (
                      <TableRow key={m.id}>
                        <TableCell>
                          {membersProfiles[m.player1Id]?.displayName ||
                            m.player1Name}
                        </TableCell>
                        <TableCell>
                          {membersProfiles[m.player2Id]?.displayName ||
                            m.player2Name}
                        </TableCell>
                        <TableCell>
                          {m.player1Score} - {m.player2Score}
                        </TableCell>
                        <TableCell className="font-semibold">
                          {membersProfiles[m.winnerId]?.displayName ||
                            (m.winnerId === m.player1Id
                              ? m.player1Name
                              : m.player2Name)}
                        </TableCell>
                        <TableCell>
                          {m.playedAt
                            ? new Date(m.playedAt.seconds * 1000).toLocaleDateString()
                            : "N/A"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>
            ) : (
              <div className="text-center py-8">
                <Image
                  src="https://picsum.photos/seed/no-matches/300/200"
                  alt="No matches yet"
                  width={300}
                  height={200}
                  className="mx-auto rounded-md mb-4"
                />
                <p className="text-muted-foreground">
                  No matches recorded yet. Be the first to play!
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </ProtectedRoute>
  );
}