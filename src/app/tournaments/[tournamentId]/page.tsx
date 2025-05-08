"use client";

import { ProtectedRoute } from "@/components/ProtectedRoutes";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { db } from "@/lib/firebase";
import type { Match, Tournament, TournamentPlayer, UserProfile } from "@/lib/types";
import { ArrowLeft, Crown, ShieldCheck, UserCircle, UserPlus, UsersIcon, CalendarDays, ListOrdered } from "lucide-react";
import { collection, doc, getDoc, onSnapshot, query, updateDoc, arrayUnion, where, orderBy, getDocs } from "firebase/firestore";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState, useMemo } from "react";
import Image from "next/image";


export default function TournamentPage() {
  const params = useParams();
  const tournamentId = params.tournamentId as string;
  const router = useRouter();
  const { user, userProfile } = useAuth();
  const { toast } = useToast();

  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRegistering, setIsRegistering] = useState(false);
  const [tournamentMatches, setTournamentMatches] = useState<Match[]>([]);

  useEffect(() => {
    if (!tournamentId || !user) return;

    setIsLoading(true);
    const tournamentRef = doc(db, "tournaments", tournamentId);

    const unsubscribeTournament = onSnapshot(tournamentRef, async (docSnap) => {
      if (docSnap.exists()) {
        const tournamentData = { id: docSnap.id, ...docSnap.data() } as Tournament;
        // Fetch creator name if not already present (especially after direct creation)
        if (tournamentData.createdBy && !tournamentData.creatorName) {
             const creatorProfileSnap = await getDoc(doc(db, "users", tournamentData.createdBy));
            if (creatorProfileSnap.exists()) {
                tournamentData.creatorName = (creatorProfileSnap.data() as UserProfile).displayName || "Unknown User";
            }
        }
        setTournament(tournamentData);
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

    // Fetch matches for this tournament
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
  }, [tournamentId, user, router, toast]);

  const handleRegisterForTournament = async () => {
    if (!user || !userProfile || !tournament) return;
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
        displayName: userProfile.displayName || "Player",
        eloAtStart: userProfile.globalElo, // Use global ELO at time of registration
        matchesPlayed: 0,
        wins: 0,
        losses: 0,
      };
      await updateDoc(tournamentRef, {
        players: arrayUnion(newPlayer)
      });
      toast({ title: "Registered!", description: `Successfully registered for ${tournament.name}.` });
    } catch (error) {
      console.error("Error registering for tournament:", error);
      toast({ title: "Registration Failed", description: "Could not register for the tournament.", variant: "destructive" });
    } finally {
      setIsRegistering(false);
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


  if (isLoading || !tournament || !user || !userProfile) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-10rem)]">
        <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-primary"></div>
      </div>
    );
  }
  
  const sortedPlayers = [...tournament.players].sort((a, b) => {
    // Primary sort: points (desc), Secondary: wins (desc), Tertiary: ELO at start (desc)
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
                        <TrophyIcon className="h-8 w-8 text-primary" /> {tournament.name}
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
                 {tournament.status !== 'pending_registration' && (
                    <p className="text-muted-foreground font-semibold p-2 bg-muted rounded-md">Registration Closed</p>
                )}
            </div>
             <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                <div className="flex items-center gap-2"><UsersIcon className="h-5 w-5 text-muted-foreground"/> <strong>Size:</strong> {tournament.size} Players</div>
                <div className="flex items-center gap-2"><ListOrdered className="h-5 w-5 text-muted-foreground"/> <strong>Registered:</strong> {tournament.players.length} / {tournament.size}</div>
                <div className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-muted-foreground"/> <strong>Status:</strong> <span className="capitalize">{tournament.status.replace('_', ' ')}</span></div>
                <div className="flex items-center gap-2"><CalendarDays className="h-5 w-5 text-muted-foreground"/> <strong>Created:</strong> {new Date(tournament.createdAt.seconds * 1000).toLocaleDateString()}</div>
            </div>
          </CardHeader>
        
          <Tabs defaultValue="players" className="w-full p-6">
            <TabsList className="grid w-full grid-cols-3 mb-4">
              <TabsTrigger value="players">Players</TabsTrigger>
              <TabsTrigger value="matches">Matches</TabsTrigger>
              <TabsTrigger value="bracket">Bracket</TabsTrigger>
            </TabsList>
            <TabsContent value="players">
              <Card>
                <CardHeader><CardTitle>Registered Players</CardTitle></CardHeader>
                <CardContent>
                  {sortedPlayers.length > 0 ? (
                    <ScrollArea className="h-[350px]">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Rank</TableHead>
                            <TableHead>Player</TableHead>
                            <TableHead>ELO (Start)</TableHead>
                            <TableHead>W/L</TableHead>
                            <TableHead>Points</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {sortedPlayers.map((player, index) => (
                            <TableRow key={player.uid} className={player.uid === user.uid ? "bg-accent/10" : ""}>
                              <TableCell>{index + 1}</TableCell>
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  <Avatar className="h-8 w-8">
                                    {/* Assuming UserProfile for player is fetched elsewhere or not needed for Avatar here */}
                                    {/* <AvatarImage src={player.photoURL} /> */}
                                    <AvatarFallback>{player.displayName.charAt(0)}</AvatarFallback>
                                  </Avatar>
                                  {player.displayName}
                                  {player.uid === tournament.createdBy && <Crown className="h-4 w-4 text-yellow-500" title="Tournament Organizer"/>}
                                </div>
                              </TableCell>
                              <TableCell>{player.eloAtStart}</TableCell>
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
                <Card>
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
                                </TableRow>
                            ))}
                            </TableBody>
                        </Table>
                        </ScrollArea>
                    ) : (
                        <p className="text-center text-muted-foreground py-8">No matches played in this tournament yet.</p>
                    )}
                    </CardContent>
                </Card>
            </TabsContent>
            <TabsContent value="bracket">
              <Card>
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
        </Card>
      </div>
    </ProtectedRoute>
  );
}
