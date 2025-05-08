"use client";

import { ProtectedRoute } from "@/components/ProtectedRoutes";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { calculateEloRatings } from "@/lib/elo";
import { db } from "@/lib/firebase";
import type { Match, Room, UserProfile } from "@/lib/types";
import { ArrowLeft, MailPlus, ShieldCheck, Sword, UserCircle, UserPlus, Crown } from "lucide-react";
import { collection, doc, getDoc, getDocs, onSnapshot, query, serverTimestamp, setDoc, updateDoc, where, writeBatch, addDoc, arrayUnion } from "firebase/firestore";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Image from "next/image";

export default function RoomPage() {
  const params = useParams();
  const roomId = params.roomId as string;
  const router = useRouter();
  const { user, userProfile } = useAuth();
  const { toast } = useToast();

  const [room, setRoom] = useState<Room | null>(null);
  const [membersProfiles, setMembersProfiles] = useState<Record<string, UserProfile>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [inviteEmail, setInviteEmail] = useState("");
  const [isInviting, setIsInviting] = useState(false);

  const [player1Id, setPlayer1Id] = useState<string>("");
  const [player2Id, setPlayer2Id] = useState<string>("");
  const [player1Score, setPlayer1Score] = useState<number | string>("");
  const [player2Score, setPlayer2Score] = useState<number | string>("");
  const [isRecordingMatch, setIsRecordingMatch] = useState(false);
  const [recentMatches, setRecentMatches] = useState<Match[]>([]);


  useEffect(() => {
    if (!roomId || !user) return;

    setIsLoading(true);
    const roomRef = doc(db, "rooms", roomId);

    const unsubscribeRoom = onSnapshot(roomRef, async (docSnap) => {
      if (docSnap.exists()) {
        const roomData = { id: docSnap.id, ...docSnap.data() } as Room;
        
        if (!roomData.members.includes(user.uid)) {
          toast({ title: "Access Denied", description: "You are not a member of this room.", variant: "destructive" });
          router.push("/rooms");
          return;
        }
        
        setRoom(roomData);

        const memberUIDs = roomData.members;
        const profiles: Record<string, UserProfile> = {};
        for (const uid of memberUIDs) {
          if (!membersProfiles[uid]) { // Fetch only if not already fetched
            const userDocRef = doc(db, "users", uid);
            const userDocSnap = await getDoc(userDocRef);
            if (userDocSnap.exists()) {
              profiles[uid] = userDocSnap.data() as UserProfile;
            }
          } else {
            profiles[uid] = membersProfiles[uid];
          }
        }
        setMembersProfiles(prev => ({ ...prev, ...profiles }));

      } else {
        toast({ title: "Error", description: "Room not found.", variant: "destructive" });
        router.push("/rooms");
      }
      setIsLoading(false);
    }, (error) => {
        console.error("Error fetching room details:", error);
        toast({ title: "Error", description: "Could not fetch room details.", variant: "destructive"});
        setIsLoading(false);
        router.push("/rooms");
    });
    
    // Fetch recent matches for this room
    const matchesRef = collection(db, "matches");
    const qMatches = query(matchesRef, where("roomId", "==", roomId), where("playedAt", "!=", null), orderBy("playedAt", "desc"), limit(10));
    const unsubscribeMatches = onSnapshot(qMatches, (snapshot) => {
        const matchesData: Match[] = [];
        snapshot.forEach(doc => matchesData.push({ id: doc.id, ...doc.data() } as Match));
        setRecentMatches(matchesData);
    });


    return () => {
        unsubscribeRoom();
        unsubscribeMatches();
    };
  }, [roomId, user, router, toast]); // Removed membersProfiles from deps

  const handleInvitePlayer = async () => {
    if (!inviteEmail.trim() || !room || !user) return;
    setIsInviting(true);
    try {
      const usersRef = collection(db, "users");
      const q = query(usersRef, where("email", "==", inviteEmail.trim()));
      const querySnapshot = await getDocs(q);

      if (querySnapshot.empty) {
        toast({ title: "Not Found", description: "No user found with this email.", variant: "destructive" });
        setIsInviting(false);
        return;
      }

      const invitedUser = querySnapshot.docs[0].data() as UserProfile;
      const invitedUserId = querySnapshot.docs[0].id;

      if (room.members.includes(invitedUserId)) {
        toast({ title: "Already Member", description: "This user is already in the room." });
        setIsInviting(false);
        return;
      }

      const roomRef = doc(db, "rooms", roomId);
      // Add user to members list and initialize their ELO in the room
      const updatedLocalElos = { ...room.localElos, [invitedUserId]: 1000 };
      await updateDoc(roomRef, {
        members: arrayUnion(invitedUserId),
        localElos: updatedLocalElos,
      });
      
      // Also update local membersProfiles state for immediate UI update
      setMembersProfiles(prev => ({...prev, [invitedUserId]: invitedUser}));

      toast({ title: "Success", description: `${invitedUser.displayName || invitedUser.email} has been invited to the room.` });
      setInviteEmail("");
    } catch (error) {
      console.error("Error inviting player:", error);
      toast({ title: "Error", description: "Failed to invite player.", variant: "destructive" });
    } finally {
      setIsInviting(false);
    }
  };
  
  const handleRecordMatch = async () => {
    if (!user || !userProfile || !room) return;
    if (!player1Id || !player2Id || player1Score === "" || player2Score === "") {
        toast({ title: "Missing Info", description: "Please select both players and enter scores.", variant: "destructive" });
        return;
    }
    if (player1Id === player2Id) {
        toast({ title: "Invalid Match", description: "Players cannot play against themselves.", variant: "destructive" });
        return;
    }
    
    const p1Score = Number(player1Score);
    const p2Score = Number(player2Score);

    if (isNaN(p1Score) || isNaN(p2Score) || p1Score < 0 || p2Score < 0 || p1Score === p2Score) {
        toast({ title: "Invalid Scores", description: "Scores must be valid numbers, non-negative, and not equal (no draws).", variant: "destructive" });
        return;
    }

    setIsRecordingMatch(true);
    try {
        const player1Profile = membersProfiles[player1Id];
        const player2Profile = membersProfiles[player2Id];

        if (!player1Profile || !player2Profile) {
            toast({title: "Error", description: "Player profiles not found.", variant: "destructive"});
            setIsRecordingMatch(false);
            return;
        }
        
        const player1RoomElo = room.localElos[player1Id];
        const player2RoomElo = room.localElos[player2Id];
        
        // Calculate Room ELO changes
        const roomEloResult = calculateEloRatings(player1RoomElo, player2RoomElo, p1Score > p2Score ? 1 : 0);
        
        // Calculate Global ELO changes
        const globalEloResult = calculateEloRatings(player1Profile.globalElo, player2Profile.globalElo, p1Score > p2Score ? 1 : 0);

        const matchData: Omit<Match, 'id'> = {
            player1Id,
            player2Id,
            player1Name: player1Profile.displayName || "Player 1",
            player2Name: player2Profile.displayName || "Player 2",
            player1Score: p1Score,
            player2Score: p2Score,
            winnerId: p1Score > p2Score ? player1Id : player2Id,
            playedAt: serverTimestamp() as any,
            eloChangePlayer1: globalEloResult.eloChangeP1, // Store global ELO change for the match record
            eloChangePlayer2: globalEloResult.eloChangeP2,
            roomId: roomId,
        };
        
        const batch = writeBatch(db);

        // 1. Add match document
        const matchRef = doc(collection(db, "matches"));
        batch.set(matchRef, matchData);

        // 2. Update room local ELOs
        const roomRef = doc(db, "rooms", roomId);
        batch.update(roomRef, {
            [`localElos.${player1Id}`]: roomEloResult.newPlayer1Rating,
            [`localElos.${player2Id}`]: roomEloResult.newPlayer2Rating,
        });

        // 3. Update global ELOs and stats for player 1
        const player1DocRef = doc(db, "users", player1Id);
        batch.update(player1DocRef, {
            globalElo: globalEloResult.newPlayer1Rating,
            matchesPlayed: player1Profile.matchesPlayed + 1,
            wins: player1Profile.wins + (p1Score > p2Score ? 1 : 0),
            losses: player1Profile.losses + (p1Score < p2Score ? 1 : 0),
            eloHistory: arrayUnion({ date: serverTimestamp(), elo: globalEloResult.newPlayer1Rating })
        });
        
        // 4. Update global ELOs and stats for player 2
        const player2DocRef = doc(db, "users", player2Id);
        batch.update(player2DocRef, {
            globalElo: globalEloResult.newPlayer2Rating,
            matchesPlayed: player2Profile.matchesPlayed + 1,
            wins: player2Profile.wins + (p2Score > p1Score ? 1 : 0),
            losses: player2Profile.losses + (p2Score < p1Score ? 1 : 0),
            eloHistory: arrayUnion({ date: serverTimestamp(), elo: globalEloResult.newPlayer2Rating })
        });

        await batch.commit();

        toast({ title: "Match Recorded", description: "ELO ratings and stats updated." });
        setPlayer1Id(""); setPlayer2Id(""); setPlayer1Score(""); setPlayer2Score("");

    } catch (error) {
        console.error("Error recording match:", error);
        toast({ title: "Error", description: "Failed to record match.", variant: "destructive" });
    } finally {
        setIsRecordingMatch(false);
    }
};


  if (isLoading || !room || !user || !userProfile) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-10rem)]">
        <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-primary"></div>
      </div>
    );
  }

  const roomMembersArray = room.members.map(uid => ({ uid, ...membersProfiles[uid], roomElo: room.localElos[uid] })).sort((a, b) => (b.roomElo || 0) - (a.roomElo || 0));

  return (
    <ProtectedRoute>
      <div className="container mx-auto py-8 px-4">
        <Button variant="outline" onClick={() => router.push('/rooms')} className="mb-6">
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to Rooms
        </Button>

        <Card className="mb-8 shadow-xl">
          <CardHeader className="bg-muted/50">
            <CardTitle className="text-3xl font-bold">{room.name}</CardTitle>
            <CardDescription>Room created by: {membersProfiles[room.createdBy]?.displayName || "Unknown User"}</CardDescription>
          </CardHeader>
          <CardContent className="p-6">
            <div className="grid md:grid-cols-3 gap-6">
              {/* Members List */}
              <div className="md:col-span-1">
                <h3 className="text-xl font-semibold mb-3 flex items-center gap-2"><UsersIcon className="text-primary"/> Members ({roomMembersArray.length})</h3>
                <ScrollArea className="h-[300px] border rounded-md p-3 bg-background">
                  {roomMembersArray.map((member) => (
                    <div key={member.uid} className="flex items-center justify-between p-2 hover:bg-muted/50 rounded-md">
                      <div className="flex items-center gap-3">
                        <Avatar className="h-8 w-8">
                          <AvatarImage src={member.photoURL || undefined} />
                          <AvatarFallback>{member.displayName ? member.displayName.charAt(0) : <UserCircle />}</AvatarFallback>
                        </Avatar>
                        <span className="font-medium">{member.displayName || "Unknown"}</span>
                        {member.uid === room.createdBy && <Crown className="h-4 w-4 text-yellow-500" title="Room Creator"/>}
                      </div>
                      <span className="text-sm font-semibold text-primary">{member.roomElo || 1000} ELO</span>
                    </div>
                  ))}
                </ScrollArea>
                {user.uid === room.createdBy && (
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button variant="outline" className="mt-4 w-full">
                        <MailPlus className="mr-2 h-4 w-4" /> Invite Player
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Invite Player to {room.name}</DialogTitle>
                        <DialogDescription>Enter the email of the player you want to invite.</DialogDescription>
                      </DialogHeader>
                      <div className="space-y-2 py-2">
                        <Label htmlFor="inviteEmail">Player's Email</Label>
                        <Input 
                          id="inviteEmail" 
                          type="email" 
                          value={inviteEmail} 
                          onChange={(e) => setInviteEmail(e.target.value)}
                          placeholder="player@example.com"
                        />
                      </div>
                      <DialogFooter>
                        <DialogClose asChild><Button variant="ghost">Cancel</Button></DialogClose>
                        <Button onClick={handleInvitePlayer} disabled={isInviting}>
                          {isInviting ? "Inviting..." : "Send Invite"}
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                )}
              </div>

              {/* Record Match */}
              <Card className="md:col-span-2 shadow-md">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2"><Sword className="text-accent"/> Record Match</CardTitle>
                    <CardDescription>Select players and enter their scores for the match.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4 items-end">
                        <div>
                            <Label htmlFor="player1">Player 1</Label>
                            <Select value={player1Id} onValueChange={setPlayer1Id}>
                                <SelectTrigger id="player1"><SelectValue placeholder="Select Player 1" /></SelectTrigger>
                                <SelectContent>
                                    {roomMembersArray.filter(m => m.uid !== player2Id).map(m => <SelectItem key={m.uid} value={m.uid}>{m.displayName} ({m.roomElo})</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                         <div>
                            <Label htmlFor="player1Score">Score</Label>
                            <Input id="player1Score" type="number" placeholder="P1 Score" value={player1Score} onChange={(e) => setPlayer1Score(e.target.value)} min="0"/>
                        </div>
                    </div>
                     <div className="grid grid-cols-2 gap-4 items-end">
                        <div>
                            <Label htmlFor="player2">Player 2</Label>
                             <Select value={player2Id} onValueChange={setPlayer2Id}>
                                <SelectTrigger id="player2"><SelectValue placeholder="Select Player 2" /></SelectTrigger>
                                <SelectContent>
                                    {roomMembersArray.filter(m => m.uid !== player1Id).map(m => <SelectItem key={m.uid} value={m.uid}>{m.displayName} ({m.roomElo})</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                         <div>
                            <Label htmlFor="player2Score">Score</Label>
                            <Input id="player2Score" type="number" placeholder="P2 Score" value={player2Score} onChange={(e) => setPlayer2Score(e.target.value)} min="0"/>
                        </div>
                    </div>
                    <Button className="w-full" onClick={handleRecordMatch} disabled={isRecordingMatch}>
                        {isRecordingMatch ? "Recording..." : "Record Match & Update ELOs"}
                    </Button>
                </CardContent>
              </Card>
            </div>
          </CardContent>
        </Card>

        <Separator className="my-8" />

        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><ShieldCheck className="text-primary"/> Recent Matches in this Room</CardTitle>
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
                    {recentMatches.map(match => (
                      <TableRow key={match.id}>
                        <TableCell>{membersProfiles[match.player1Id]?.displayName || match.player1Name || "P1"}</TableCell>
                        <TableCell>{membersProfiles[match.player2Id]?.displayName || match.player2Name || "P2"}</TableCell>
                        <TableCell>{match.player1Score} - {match.player2Score}</TableCell>
                        <TableCell className="font-semibold">{membersProfiles[match.winnerId]?.displayName || (match.winnerId === match.player1Id ? (match.player1Name || "P1") : (match.player2Name || "P2"))}</TableCell>
                        <TableCell>{match.playedAt ? new Date(match.playedAt.seconds * 1000).toLocaleDateString() : 'N/A'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>
            ) : (
                <div className="text-center py-8">
                    <Image src="https://picsum.photos/seed/no-matches/300/200" alt="No matches yet" width={300} height={200} className="mx-auto rounded-md mb-4" data-ai-hint="empty sports field" />
                    <p className="text-muted-foreground">No matches recorded in this room yet. Be the first to play!</p>
                </div>
            )}
          </CardContent>
        </Card>
      </div>
    </ProtectedRoute>
  );
}
