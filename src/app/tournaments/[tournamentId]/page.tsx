// src/app/tournaments/[tournamentId]/page.tsx
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { calculateEloRatings } from "@/lib/elo";
import { db } from "@/lib/firebase";
import type { Match, Tournament, TournamentPlayer, UserProfile } from "@/lib/types";
import { getFinnishFormattedDate } from "@/lib/utils";
import {
  addDoc,
  arrayUnion,
  collection,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
  writeBatch,
} from "firebase/firestore";
import {
  ArrowLeft,
  CalendarDays,
  Crown,
  ListOrdered,
  TrophyIcon as PageTrophyIcon,
  ShieldCheck,
  Sword,
  UserPlus,
  UsersIcon,
} from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

export default function TournamentPage() {
  const { tournamentId } = useParams();
  const router = useRouter();
  const { user, userProfile: currentUserProfile } = useAuth();
  const { toast } = useToast();

  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRegistering, setIsRegistering] = useState(false);
  const [tournamentMatches, setTournamentMatches] = useState<Match[]>([]);

  const [player1Id, setPlayer1Id] = useState("");
  const [player2Id, setPlayer2Id] = useState("");
  const [player1Score, setPlayer1Score] = useState("");
  const [player2Score, setPlayer2Score] = useState("");
  const [roundName, setRoundName] = useState("");
  const [isRecordingMatch, setIsRecordingMatch] = useState(false);
  const [playerProfiles, setPlayerProfiles] = useState<Record<string, UserProfile>>({});

  useEffect(() => {
    if (!tournamentId || !user) return;
    setIsLoading(true);
    const tourRef = doc(db, "tournaments", tournamentId);
    const unsubTour = onSnapshot(
      tourRef,
      async (snap) => {
        if (!snap.exists()) {
          toast({ title: "Error", description: "Tournament not found.", variant: "destructive" });
          router.push("/tournaments");
          return;
        }
        const data = { id: snap.id, ...(snap.data() as any) } as Tournament;
        if (data.createdBy && !data.creatorName) {
          const cp = await getDoc(doc(db, "users", data.createdBy));
          if (cp.exists()) {
            data.creatorName = (cp.data() as UserProfile).name || "Unknown User";
          }
        }
        setTournament(data);
        // fetch missing profiles
        const missing = data.players.filter(p => !playerProfiles[p.uid]);
        if (missing.length) {
          const fetched: Record<string, UserProfile> = {};
          for (const p of missing) {
            const ups = await getDoc(doc(db, "users", p.uid));
            if (ups.exists()) fetched[p.uid] = ups.data() as UserProfile;
          }
          setPlayerProfiles(prev => ({ ...prev, ...fetched }));
        }
        setIsLoading(false);
      },
      (err) => {
        console.error(err);
        toast({ title: "Error", description: "Could not load tournament.", variant: "destructive" });
        router.push("/tournaments");
      }
    );

    const matchesQ = query(
      collection(db, "matches"),
      where("tournamentId", "==", tournamentId),
      orderBy("playedAt", "desc")
    );
    const unsubMatches = onSnapshot(matchesQ, (snap) => {
      const arr: Match[] = [];
      snap.forEach(doc => arr.push({ id: doc.id, ...(doc.data() as any) }));
      setTournamentMatches(arr);
    });

    return () => {
      unsubTour();
      unsubMatches();
    };
  }, [tournamentId, user, toast, router, playerProfiles]);

  const handleRegister = async () => {
    if (!user || !currentUserProfile || !tournament) return;
    if (tournament.players.length >= tournament.size) {
      toast({ title: "Full", description: "Tournament is full.", variant: "destructive" });
      return;
    }
    if (tournament.players.some(p => p.uid === user.uid)) {
      toast({ title: "Already Registered", description: "You are registered already." });
      return;
    }
    if (tournament.status !== "pending_registration") {
      toast({ title: "Closed", description: "Registration closed.", variant: "destructive" });
      return;
    }
    setIsRegistering(true);
    try {
      const tourRef = doc(db, "tournaments", tournamentId);
      const newP: TournamentPlayer = {
        uid: user.uid,
        name: currentUserProfile.displayName || "Player",
        eloAtStart: currentUserProfile.globalElo,
        matchesPlayed: 0,
        wins: 0,
        losses: 0,
        points: 0,
      };
      await updateDoc(tourRef, { players: arrayUnion(newP) });
      setPlayerProfiles(prev => ({ ...prev, [user.uid]: currentUserProfile }));
      toast({ title: "Registered", description: `You joined ${tournament.name}.` });
    } catch (e) {
      console.error(e);
      toast({ title: "Error", description: "Registration failed.", variant: "destructive" });
    } finally {
      setIsRegistering(false);
    }
  };

  const handleRecordMatch = async () => {
    if (!tournament || !player1Id || !player2Id || !player1Score || !player2Score) {
      toast({ title: "Missing", description: "Fill all fields.", variant: "destructive" });
      return;
    }
    if (player1Id === player2Id) {
      toast({ title: "Invalid", description: "Cannot play self.", variant: "destructive" });
      return;
    }
    const s1 = parseInt(player1Score, 10);
    const s2 = parseInt(player2Score, 10);
    if (isNaN(s1) || isNaN(s2) || s1 < 0 || s2 < 0 || s1 === s2) {
      toast({ title: "Invalid", description: "Scores invalid.", variant: "destructive" });
      return;
    }
    setIsRecordingMatch(true);
    try {
      const p1Prof = playerProfiles[player1Id]!;
      const p2Prof = playerProfiles[player2Id]!;
      const globalRes = calculateEloRatings(p1Prof.globalElo, p2Prof.globalElo, s1 > s2 ? 1 : 0);
      const ts = getFinnishFormattedDate();

      const batch = writeBatch(db);
      const matchRef = doc(collection(db, "matches"));
      batch.set(matchRef, {
        tournamentId,
        player1Id,
        player2Id,
        player1Name: tournament.players.find(p => p.uid === player1Id)!.name,
        player2Name: tournament.players.find(p => p.uid === player2Id)!.name,
        player1Score: s1,
        player2Score: s2,
        winnerId: s1 > s2 ? player1Id : player2Id,
        eloChangePlayer1: globalRes.eloChangeP1,
        eloChangePlayer2: globalRes.eloChangeP2,
        playedAt: ts,
        roundName: roundName || undefined,
      });

      const p1Ref = doc(db, "users", player1Id);
      batch.update(p1Ref, {
        globalElo: globalRes.newPlayer1Rating,
        matchesPlayed: p1Prof.matchesPlayed + 1,
        wins: p1Prof.wins + (s1 > s2 ? 1 : 0),
        losses: p1Prof.losses + (s1 < s2 ? 1 : 0),
        eloHistory: arrayUnion({ date: ts, elo: globalRes.newPlayer1Rating }),
      });
      const p2Ref = doc(db, "users", player2Id);
      batch.update(p2Ref, {
        globalElo: globalRes.newPlayer2Rating,
        matchesPlayed: p2Prof.matchesPlayed + 1,
        wins: p2Prof.wins + (s2 > s1 ? 1 : 0),
        losses: p2Prof.losses + (s2 < s1 ? 1 : 0),
        eloHistory: arrayUnion({ date: ts, elo: globalRes.newPlayer2Rating }),
      });

      // update tournament player stats
      const updated = tournament.players.map(tp => {
        if (tp.uid === player1Id) {
          return { ...tp, matchesPlayed: tp.matchesPlayed + 1, wins: tp.wins + (s1 > s2 ? 1 : 0), losses: tp.losses + (s1 < s2 ? 1 : 0), points: tp.points + (s1 > s2 ? 3 : 0) };
        }
        if (tp.uid === player2Id) {
          return { ...tp, matchesPlayed: tp.matchesPlayed + 1, wins: tp.wins + (s2 > s1 ? 1 : 0), losses: tp.losses + (s2 < s1 ? 1 : 0), points: tp.points + (s2 > s1 ? 3 : 0) };
        }
        return tp;
      });
      batch.update(doc(db, "tournaments", tournamentId), { players: updated });

      await batch.commit();
      toast({ title: "Recorded", description: "Match saved." });
      setPlayer1Id("");
      setPlayer2Id("");
      setPlayer1Score("");
      setPlayer2Score("");
      setRoundName("");
    } catch (e) {
      console.error(e);
      toast({ title: "Error", description: "Recording failed.", variant: "destructive" });
    } finally {
      setIsRecordingMatch(false);
    }
  };

  const sortedPlayers = useMemo(() => {
    if (!tournament) return [];
    return [...tournament.players].sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      if (b.wins !== a.wins) return b.wins - a.wins;
      return b.eloAtStart - a.eloAtStart;
    });
  }, [tournament]);

  if (isLoading || !tournament || !user || !currentUserProfile) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-10rem)]">
        <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-primary" />
      </div>
    );
  }

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
                  <UserPlus className="mr-2 h-5 w-5" /> {isRegistering ? "Registering..." : "Register for Tournament"}
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
              <div className="flex items-center gap-2"><UsersIcon className="h-5 w-5 text-muted-foreground" /> <strong>Size:</strong> {tournament.size} Players</div>
              <div className="flex items-center gap-2"><ListOrdered className="h-5 w-5 text-muted-foreground" /> <strong>Registered:</strong> {tournament.players.length} / {tournament.size}</div>
              <div className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-muted-foreground" /> <strong>Status:</strong> <span className="capitalize">{tournament.status.replace('_', ' ')}</span></div>
              <div className="flex items-center gap-2"><CalendarDays className="h-5 w-5 text-muted-foreground" /> <strong>Created:</strong> {new Date(tournament.createdAt.seconds * 1000).toLocaleDateString()}</div>
            </div>
          </CardHeader>
        </Card>

        {/* Record Tournament Match Card - Only for creator */}
        {canRecordMatches && (
          <Card className="mb-8 shadow-lg">
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Sword className="text-accent" /> Record Tournament Match</CardTitle>
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
                        <SelectItem key={p.uid} value={p.uid}>{p.name} ({playerProfiles[p.uid]?.globalElo || p.eloAtStart})</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="tPlayer1Score">Score P1</Label>
                  <Input id="tPlayer1Score" type="number" placeholder="P1 Score" value={player1Score} onChange={(e) => setPlayer1Score(e.target.value)} min="0" />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
                <div>
                  <Label htmlFor="tPlayer2">Player 2</Label>
                  <Select value={player2Id} onValueChange={setPlayer2Id}>
                    <SelectTrigger id="tPlayer2"><SelectValue placeholder="Select Player 2" /></SelectTrigger>
                    <SelectContent>
                      {tournament.players.filter(p => p.uid !== player1Id).map(p => (
                        <SelectItem key={p.uid} value={p.uid}>{p.name} ({playerProfiles[p.uid]?.globalElo || p.eloAtStart})</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="tPlayer2Score">Score P2</Label>
                  <Input id="tPlayer2Score" type="number" placeholder="P2 Score" value={player2Score} onChange={(e) => setPlayer2Score(e.target.value)} min="0" />
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
                                  <AvatarFallback>{player.name.charAt(0)}</AvatarFallback>
                                </Avatar>
                                {player.name}
                                {player.uid === tournament.createdBy && <Crown className="h-4 w-4 text-yellow-500" title="Tournament Organizer" />}
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

