"use client";

import { ProtectedRoute } from "@/components/ProtectedRoutes";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { calculateEloRatings } from "@/lib/elo";
import { db } from "@/lib/firebase";
import type { Match, Tournament, TournamentPlayer, UserProfile } from "@/lib/types";
import { ArrowLeft, Crown, ShieldCheck, UserCircle, UserPlus, UsersIcon, CalendarDays, ListOrdered, Sword, TrophyIcon as PageTrophyIcon } from "lucide-react"; // Renamed TrophyIcon to avoid conflict
import { collection, doc, getDoc, onSnapshot, query, updateDoc, arrayUnion, where, orderBy, writeBatch, serverTimestamp, addDoc } from "firebase/firestore";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState, useMemo } from "react";
import Image from "next/image";


export default function TournamentPage() {
  const params = useParams();
  const tournamentId = params.tournamentId as string;
  const router = useRouter();
  const { user, userProfile: currentUserProfile } = useAuth(); // Renamed userProfile to currentUserProfile
  const { toast } = useToast();

  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRegistering, setIsRegistering] = useState(false);
  const [tournamentMatches, setTournamentMatches] = useState<Match[]>([]);

  // State for recording matches
  const [player1Id, setPlayer1Id] = useState<string>("");
  const [player2Id, setPlayer2Id] = useState<string>("");
  const [player1Score, setPlayer1Score] = useState<string>(""); // Store as string for input
  const [player2Score, setPlayer2Score] = useState<string>(""); // Store as string for input
  const [roundName, setRoundName] = useState<string>("");
  const [isRecordingMatch, setIsRecordingMatch] = useState(false);
  const [playerProfiles, setPlayerProfiles] = useState<Record<string, UserProfile>>({});


  useEffect(() => {
    if (!tournamentId || !user) return;

    setIsLoading(true);
    const tournamentRef = doc(db, "tournaments", tournamentId);

    const unsubscribeTournament = onSnapshot(tournamentRef, async (docSnap) => {
      if (docSnap.exists()) {
        const tournamentData = { id: docSnap.id, ...docSnap.data() } as Tournament;
        if (tournamentData.createdBy && !tournamentData.creatorName) {
             const creatorProfileSnap = await getDoc(doc(db, "users", tournamentData.createdBy));
            if (creatorProfileSnap.exists()) {
                tournamentData.creatorName = (creatorProfileSnap.data() as UserProfile).displayName || "Unknown User";
            }
        }
        setTournament(tournamentData);

        // Fetch profiles for all tournament players if not already fetched
        const profilesToFetch = tournamentData.players.filter(p => !playerProfiles[p.uid]);
        if (profilesToFetch.length > 0) {
          const fetchedProfiles: Record<string, UserProfile> = {};
          for (const tp of profilesToFetch) {
            const userDocRef = doc(db, "users", tp.uid);
            const userDocSnap = await getDoc(userDocRef);
            if (userDocSnap.exists()) {
              fetchedProfiles[tp.uid] = userDocSnap.data() as UserProfile;
            }
          }
          setPlayerProfiles(prev => ({ ...prev, ...fetchedProfiles }));
        }

      } else {
        toast({ title: "Error", description: "Tournament not found.", variant: "destructive" });
        router.push("/tournaments");
      }
      setIsLoading(false);
    }, (error) => {
        console.error("Error fetching tournament details:", error);
        toast({ title: "Error", description: "Could not fetch tournament details.", variant: "destructive"});
        setIsLoading(false);
        router.push("/tournaments");
    });

    const matchesQuery = query(
      collection(db, "matches"),
      where("tournamentId", "==", tournamentId),
      orderBy("playedAt", "desc")
    );
    const unsubscribeMatches = onSnapshot(matchesQuery, (snapshot) => {
      const matches: Match[] = [];
      snapshot.forEach((doc) => {
        matches.push({ id: doc.id, ...doc.data() } as Match);
      });
      setTournamentMatches(matches);
    });


    return () => {
      unsubscribeTournament();
      unsubscribeMatches();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tournamentId, user, router, toast]); // playerProfiles removed from deps to avoid loop, fetching is handled inside.

  const handleRegisterForTournament = async () => {
    if (!user || !currentUserProfile || !tournament) return;
    if (tournament.players.length >= tournament.size) {
      toast({ title: "Full", description: "This tournament is already full.", variant: "destructive" });
      return;
    }
    if (tournament.players.some(p => p.uid === user.uid)) {
       toast({ title: "Already Registered", description: "You are already registered for this tournament." });
      return;
    }
    if (tournament.status !== 'pending_registration') {
        toast({ title: "Registration Closed", description: "Registration for this tournament is closed.", variant: "destructive" });
        return;
    }

    setIsRegistering(true);
    try {
      const tournamentRef = doc(db, "tournaments", tournamentId);
      const newPlayer: TournamentPlayer = {
        uid: user.uid,
        displayName: currentUserProfile.displayName || "Player",
        eloAtStart: currentUserProfile.globalElo, 
        matchesPlayed: 0,
        wins: 0,
        losses: 0,
        points: 0, // Initialize points on registration
      };
      await updateDoc(tournamentRef, {
        players: arrayUnion(newPlayer)
      });
      // Fetch and set the profile for the newly registered user if not already there
      if (!playerProfiles[user.uid] && currentUserProfile) {
        setPlayerProfiles(prev => ({...prev, [user.uid]: currentUserProfile}));
      }
      toast({ title: "Registered!", description: `Successfully registered for ${tournament.name}.` });
    } catch (error) {
      console.error("Error registering for tournament:", error);
      toast({ title: "Registration Failed", description: "Could not register for the tournament.", variant: "destructive" });
    } finally {
      setIsRegistering(false);
    }
  };
  
  const handleRecordTournamentMatch = async () => {
    if (!user || !tournament || !player1Id || !player2Id || player1Score === "" || player2Score === "") {
      toast({ title: "Missing Info", description: "Please select players, enter scores, and optionally a round name.", variant: "destructive" });
      return;
    }
    if (player1Id === player2Id) {
      toast({ title: "Invalid Players", description: "Players cannot play against themselves.", variant: "destructive" });
      return;
    }

    const p1ScoreNum = parseInt(player1Score, 10);
    const p2ScoreNum = parseInt(player2Score, 10);

    if (isNaN(p1ScoreNum) || isNaN(p2ScoreNum) || p1ScoreNum < 0 || p2ScoreNum < 0 || p1ScoreNum === p2ScoreNum) {
      toast({ title: "Invalid Scores", description: "Scores must be valid, non-negative numbers, and not equal.", variant: "destructive" });
      return;
    }

    setIsRecordingMatch(true);
    try {
      const p1Profile = playerProfiles[player1Id];
      const p2Profile = playerProfiles[player2Id];
      const p1TournamentPlayer = tournament.players.find(p => p.uid === player1Id);
      const p2TournamentPlayer = tournament.players.find(p => p.uid === player2Id);

      if (!p1Profile || !p2Profile || !p1TournamentPlayer || !p2TournamentPlayer) {
        toast({ title: "Error", description: "Player data not found. Please ensure profiles are loaded.", variant: "destructive" });
        setIsRecordingMatch(false);
        return;
      }
      
      const globalEloResult = calculateEloRatings(p1Profile.globalElo, p2Profile.globalElo, p1ScoreNum > p2ScoreNum ? 1 : 0);

      const matchData: Omit<Match, 'id'> = {
        player1Id,
        player2Id,
        player1Name: p1TournamentPlayer.displayName,
        player2Name: p2TournamentPlayer.displayName,
        player1Score: p1ScoreNum,
        player2Score: p2ScoreNum,
        winnerId: p1ScoreNum > p2ScoreNum ? player1Id : player2Id,
        playedAt: serverTimestamp() as any,
        eloChangePlayer1: globalEloResult.eloChangeP1,
        eloChangePlayer2: globalEloResult.eloChangeP2,
        tournamentId: tournament.id,
        roundName: roundName.trim() || undefined,
      };

      const batch = writeBatch(db);
      const matchRef = doc(collection(db, "matches"));
      batch.set(matchRef, matchData);

      // Update Player 1 UserProfile
      const p1UserRef = doc(db, "users", player1Id);
      batch.update(p1UserRef, {
        globalElo: globalEloResult.newPlayer1Rating,
        matchesPlayed: p1Profile.matchesPlayed + 1,
        wins: p1Profile.wins + (p1ScoreNum > p2ScoreNum ? 1 : 0),
        losses: p1Profile.losses + (p1ScoreNum < p2ScoreNum ? 1 : 0),
        eloHistory: arrayUnion({ date: serverTimestamp(), elo: globalEloResult.newPlayer1Rating })
      });
       // Update Player 2 UserProfile
      const p2UserRef = doc(db, "users", player2Id);
      batch.update(p2UserRef, {
        globalElo: globalEloResult.newPlayer2Rating,
        matchesPlayed: p2Profile.matchesPlayed + 1,
        wins: p2Profile.wins + (p2ScoreNum > p1ScoreNum ? 1 : 0),
        losses: p2Profile.losses + (p2ScoreNum < p1ScoreNum ? 1 : 0),
        eloHistory: arrayUnion({ date: serverTimestamp(), elo: globalEloResult.newPlayer2Rating })
      });

      // Update Tournament document with updated player stats
      const updatedTournamentPlayers = tournament.players.map(tp => {
        if (tp.uid === player1Id) {
          return {
            ...tp,
            matchesPlayed: tp.matchesPlayed + 1,
            wins: tp.wins + (p1ScoreNum > p2ScoreNum ? 1 : 0),
            losses: tp.losses + (p1ScoreNum < p2ScoreNum ? 1 : 0),
            points: (tp.points || 0) + (p1ScoreNum > p2ScoreNum ? 3 : 0) // Example point system: 3 for a win
          };
        }
        if (tp.uid === player2Id) {
          return {
            ...tp,
            matchesPlayed: tp.matchesPlayed + 1,
            wins: tp.wins + (p2ScoreNum > p1ScoreNum ? 1 : 0),
            losses: tp.losses + (p2ScoreNum < p1ScoreNum ? 1 : 0),
            points: (tp.points || 0) + (p2ScoreNum > p1ScoreNum ? 3 : 0) // Example point system: 3 for a win
          };
        }
        return tp;
      });
      const tournamentDocRef = doc(db, "tournaments", tournamentId); // Corrected variable name
      batch.update(tournamentDocRef, { players: updatedTournamentPlayers });

      await batch.commit();
      toast({ title: "Match Recorded", description: "Tournament stats and ELOs updated."});
      setPlayer1Id(""); setPlayer2Id(""); setPlayer1Score(""); setPlayer2Score(""); setRoundName("");
    } catch (error) {
      console.error("Error recording tournament match:", error);
      toast({ title: "Error", description: "Failed to record match.", variant: "destructive" });
    } finally {
      setIsRecordingMatch(false);
    }
  };

  const isUserRegistered = useMemo(() => {
    if (!user || !tournament) return false;
    return tournament.players.some(p => p.uid === user.uid);
  }, [user, tournament]);

  const canRegister = useMemo(() => {
    if (!tournament) return false;
    return tournament.status === 'pending_registration' && tournament.players.length < tournament.size && !isUserRegistered;
  }, [tournament, isUserRegistered]);

  const canRecordMatches = useMemo(() => {
    if (!user || !tournament) return false;
    // Only tournament creator can record matches for now
    return user.uid === tournament.createdBy && tournament.status !== 'completed';
  }, [user, tournament]);


  if (isLoading || !tournament || !user || !currentUserProfile) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-10rem)]">
        <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-primary"></div>
      </div>
    );
  }
  
  const sortedPlayers = [...tournament.players].sort((a, b) => {
    if ((b.points || 0) !== (a.points || 0)) return (b.points || 0) - (a.points || 0);
    if (b.wins !== a.wins) return b.wins - a.wins;
    return b.eloAtStart - a.eloAtStart;
  });

  return (
    <ProtectedRoute>
      <div className="container mx-auto py-8 px-4">
        <Button variant="outline" onClick={() => router.push('/tournaments')} className="mb-6">
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to Tournaments
        </Button>

        <Card className="mb-8 shadow-xl">
          <CardHeader className="bg-muted/50 p-6">
            <div className="flex flex-col md:flex-row justify-between items-start gap-4">
                <div>
                    <CardTitle className="text-3xl font-bold flex items-center gap-2">
                        <PageTrophyIcon className="h-8 w-8 text-primary" /> {tournament.name}
                    </CardTitle>
                    <CardDescription>Organized by: {tournament.creatorName || "Unknown User"}</CardDescription>
                </div>
                {canRegister && (
                     <Button onClick={handleRegisterForTournament} disabled={isRegistering} size="lg">
                        <UserPlus className="mr-2 h-5 w-5"/> {isRegistering ? "Registering..." : "Register for Tournament"}
                    </Button>
                )}
                {isUserRegistered && tournament.status === 'pending_registration' && (
                    <p className="text-accent font-semibold p-2 bg-accent/10 rounded-md">You are registered!</p>
                )}
                 {tournament.status !== 'pending_registration' && !isUserRegistered && (
                    <p className="text-muted-foreground font-semibold p-2 bg-muted rounded-md">Registration Closed</p>
                )}
                 {tournament.status === 'completed' && (
                    <p className="text-primary font-semibold p-2 bg-primary/10 rounded-md">Tournament Completed</p>
                 )}
            </div>
             <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                <div className="flex items-center gap-2"><UsersIcon className="h-5 w-5 text-muted-foreground"/> <strong>Size:</strong> {tournament.size} Players</div>
                <div className="flex items-center gap-2"><ListOrdered className="h-5 w-5 text-muted-foreground"/> <strong>Registered:</strong> {tournament.players.length} / {tournament.size}</div>
                <div className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-muted-foreground"/> <strong>Status:</strong> <span className="capitalize">{tournament.status.replace('_', ' ')}</span></div>
                <div className="flex items-center gap-2"><CalendarDays className="h-5 w-5 text-muted-foreground"/> <strong>Created:</strong> {new Date(tournament.createdAt.seconds * 1000).toLocaleDateString()}</div>
            </div>
          </CardHeader>
        </Card>

        {/* Record Tournament Match Card - Only for creator */}
        {canRecordMatches && (
          <Card className="mb-8 shadow-lg">
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Sword className="text-accent"/> Record Tournament Match</CardTitle>
              <CardDescription>Select players from the tournament, enter their scores, and optionally a round name.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
                <div>
                  <Label htmlFor="tPlayer1">Player 1</Label>
                  <Select value={player1Id} onValueChange={setPlayer1Id}>
                    <SelectTrigger id="tPlayer1"><SelectValue placeholder="Select Player 1" /></SelectTrigger>
                    <SelectContent>
                      {tournament.players.filter(p => p.uid !== player2Id).map(p => (
                        <SelectItem key={p.uid} value={p.uid}>{p.displayName} ({playerProfiles[p.uid]?.globalElo || p.eloAtStart})</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="tPlayer1Score">Score P1</Label>
                  <Input id="tPlayer1Score" type="number" placeholder="P1 Score" value={player1Score} onChange={(e) => setPlayer1Score(e.target.value)} min="0"/>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
                <div>
                  <Label htmlFor="tPlayer2">Player 2</Label>
                  <Select value={player2Id} onValueChange={setPlayer2Id}>
                    <SelectTrigger id="tPlayer2"><SelectValue placeholder="Select Player 2" /></SelectTrigger>
                    <SelectContent>
                       {tournament.players.filter(p => p.uid !== player1Id).map(p => (
                        <SelectItem key={p.uid} value={p.uid}>{p.displayName} ({playerProfiles[p.uid]?.globalElo || p.eloAtStart})</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="tPlayer2Score">Score P2</Label>
                  <Input id="tPlayer2Score" type="number" placeholder="P2 Score" value={player2Score} onChange={(e) => setPlayer2Score(e.target.value)} min="0"/>
                </div>
              </div>
              <div>
                <Label htmlFor="roundName">Round Name (Optional)</Label>
                <Input id="roundName" type="text" placeholder="e.g., Quarter-final 1" value={roundName} onChange={(e) => setRoundName(e.target.value)} />
              </div>
              <Button className="w-full" onClick={handleRecordTournamentMatch} disabled={isRecordingMatch}>
                {isRecordingMatch ? "Recording..." : "Record Match & Update Stats"}
              </Button>
            </CardContent>
          </Card>
        )}
        
          <Tabs defaultValue="players" className="w-full">
            <TabsList className="grid w-full grid-cols-3 mb-4">
              <TabsTrigger value="players">Players</TabsTrigger>
              <TabsTrigger value="matches">Matches</TabsTrigger>
              <TabsTrigger value="bracket">Bracket</TabsTrigger>
            </TabsList>
            <TabsContent value="players">
              <Card className="shadow-md">
                <CardHeader><CardTitle>Registered Players & Standings</CardTitle></CardHeader>
                <CardContent>
                  {sortedPlayers.length > 0 ? (
                    <ScrollArea className="h-[350px]">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Rank</TableHead>
                            <TableHead>Player</TableHead>
                            <TableHead>ELO (Start)</TableHead>
                            <TableHead>Current ELO</TableHead>
                            <TableHead>W/L (Tourney)</TableHead>
                            <TableHead>Points (Tourney)</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {sortedPlayers.map((player, index) => (
                            <TableRow key={player.uid} className={player.uid === user.uid ? "bg-primary/10" : ""}>
                              <TableCell>{index + 1}</TableCell>
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  <Avatar className="h-8 w-8">
                                     <AvatarImage src={playerProfiles[player.uid]?.photoURL || undefined} />
                                    <AvatarFallback>{player.displayName.charAt(0)}</AvatarFallback>
                                  </Avatar>
                                  {player.displayName}
                                  {player.uid === tournament.createdBy && <Crown className="h-4 w-4 text-yellow-500" title="Tournament Organizer"/>}
                                </div>
                              </TableCell>
                              <TableCell>{player.eloAtStart}</TableCell>
                              <TableCell>{playerProfiles[player.uid]?.globalElo || player.eloAtStart}</TableCell>
                              <TableCell>{player.wins} / {player.losses}</TableCell>
                              <TableCell>{player.points || 0}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </ScrollArea>
                  ) : (
                    <p className="text-center text-muted-foreground py-8">No players registered yet.</p>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
            <TabsContent value="matches">
                <Card className="shadow-md">
                    <CardHeader><CardTitle>Tournament Matches</CardTitle></CardHeader>
                    <CardContent>
                    {tournamentMatches.length > 0 ? (
                        <ScrollArea className="h-[350px]">
                        <Table>
                            <TableHeader>
                            <TableRow>
                                <TableHead>Round</TableHead>
                                <TableHead>Player 1</TableHead>
                                <TableHead>Player 2</TableHead>
                                <TableHead>Score</TableHead>
                                <TableHead>Winner</TableHead>
                                <TableHead>Date</TableHead>
                            </TableRow>
                            </TableHeader>
                            <TableBody>
                            {tournamentMatches.map(match => (
                                <TableRow key={match.id}>
                                <TableCell>{match.roundName || "N/A"}</TableCell>
                                <TableCell>{match.player1Name || "P1"}</TableCell>
                                <TableCell>{match.player2Name || "P2"}</TableCell>
                                <TableCell>{match.player1Score} - {match.player2Score}</TableCell>
                                <TableCell className="font-semibold">
                                    {match.winnerId === match.player1Id ? (match.player1Name || "P1") : (match.player2Name || "P2")}
                                </TableCell>
                                <TableCell>{match.playedAt ? new Date(match.playedAt.seconds * 1000).toLocaleDateString() : 'N/A'}</TableCell>
                                </TableRow>
                            ))}
                            </TableBody>
                        </Table>
                        </ScrollArea>
                    ) : (
                        <div className="text-center py-8">
                            <Image src="https://picsum.photos/seed/no-tournament-matches/300/200" alt="No matches yet" width={300} height={200} className="mx-auto rounded-md mb-4" data-ai-hint="empty stadium" />
                            <p className="text-muted-foreground">No matches played in this tournament yet.</p>
                        </div>
                    )}
                    </CardContent>
                </Card>
            </TabsContent>
            <TabsContent value="bracket">
              <Card className="shadow-md">
                <CardHeader><CardTitle>Tournament Bracket</CardTitle></CardHeader>
                <CardContent className="text-center">
                  <Image 
                    src="https://picsum.photos/seed/bracket-placeholder/800/500" 
                    alt="Tournament bracket placeholder" 
                    width={800} 
                    height={500} 
                    className="rounded-lg shadow-md mx-auto my-4"
                    data-ai-hint="tournament bracket competition"
                  />
                  <p className="text-muted-foreground">
                    Full tournament bracket visualization is coming soon! 
                    This will include group stage standings and playoff progression.
                  </p>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
      </div>
    </ProtectedRoute>
  );
}

