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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { db } from "@/lib/firebase";
import type { Tournament, TournamentSize, UserProfile } from "@/lib/types";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
} from "firebase/firestore";
import { PlusCircle, SearchIcon, TrophyIcon } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";

const tournamentSizes: TournamentSize[] = [4, 6, 8, 12];

export default function TournamentsPage() {
  const { user, userProfile } = useAuth();
  const { toast } = useToast();
  const [tournamentName, setTournamentName] = useState("");
  const [selectedSize, setSelectedSize] = useState<TournamentSize | undefined>();
  const [isCreatingTournament, setIsCreatingTournament] = useState(false);
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [isLoadingTournaments, setIsLoadingTournaments] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    if (!user) return;
    setIsLoadingTournaments(true);
    const tournamentsRef = collection(db, "tournaments");
    const unsubscribe = onSnapshot(
      query(tournamentsRef),
      async (snapshot) => {
        const data: Tournament[] = [];
        for (const docSnap of snapshot.docs) {
          const t: Tournament = { id: docSnap.id, ...(docSnap.data() as Omit<Tournament, "id">) };
          if (t.createdBy && !t.creatorName) {
            const profileSnap = await getDoc(
              doc(db, "users", t.createdBy)
            );
            if (profileSnap.exists()) {
              t.creatorName =
                (profileSnap.data() as UserProfile).displayName || "Unknown User";
            }
          }
          data.push(t);
        }
        setTournaments(
          data.sort(
            (a, b) =>
              (b.createdAt as any).seconds - (a.createdAt as any).seconds
          )
        );
        setIsLoadingTournaments(false);
      },
      (error) => {
        console.error(error);
        toast({
          title: "Error",
          description: "Could not fetch tournaments.",
          variant: "destructive",
        });
        setIsLoadingTournaments(false);
      }
    );
    return () => unsubscribe();
  }, [user, toast]);

  const handleCreateTournament = async () => {
    if (!user) {
      toast({
        title: "Error",
        description: "You must be logged in to create a tournament.",
        variant: "destructive",
      });
      return;
    }
    if (!tournamentName.trim()) {
      toast({
        title: "Error",
        description: "Tournament name cannot be empty.",
        variant: "destructive",
      });
      return;
    }
    if (!selectedSize) {
      toast({
        title: "Error",
        description: "Please select a tournament size.",
        variant: "destructive",
      });
      return;
    }
    setIsCreatingTournament(true);
    try {
      await addDoc(collection(db, "tournaments"), {
        name: tournamentName.trim(),
        createdBy: user.uid,
        creatorName: userProfile?.displayName || "Unknown User",
        players: [
          {
            uid: user.uid,
            displayName: userProfile?.displayName || "Player",
            eloAtStart: userProfile?.globalElo ?? 1000,
            matchesPlayed: 0,
            wins: 0,
            losses: 0,
            points: 0,
          },
        ],
        size: selectedSize,
        status: "pending_registration",
        createdAt: serverTimestamp(),
      });
      toast({
        title: "Success",
        description: `Tournament "${tournamentName}" created successfully.`,
      });
      setTournamentName("");
      setSelectedSize(undefined);
    } catch (error) {
      console.error(error);
      toast({
        title: "Error",
        description: "Failed to create tournament. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsCreatingTournament(false);
    }
  };

  const filtered = tournaments.filter(
    (t) =>
      t.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.creatorName
        ?.toLowerCase()
        .includes(searchTerm.toLowerCase())
  );

  return (
    <ProtectedRoute>
      <div className="container mx-auto py-8 px-4">
        <div className="flex flex-col sm:flex-row justify-between items-center mb-8 gap-4">
          <h1 className="text-4xl font-bold tracking-tight flex items-center gap-2">
            <TrophyIcon className="h-10 w-10 text-primary" /> Tournaments
          </h1>
          <Dialog>
            <DialogTrigger asChild>
              <Button size="lg">
                <PlusCircle className="mr-2 h-5 w-5" /> Create New Tournament
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
              <DialogHeader>
                <DialogTitle>Create a New Tournament</DialogTitle>
                <DialogDescription>
                  Set up your tournament. Players can join once it’s created.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="tournamentName" className="text-right">
                    Name
                  </Label>
                  <Input
                    id="tournamentName"
                    value={tournamentName}
                    onChange={(e) => setTournamentName(e.target.value)}
                    className="col-span-3"
                    placeholder="e.g., Quarterly Ping Pong Clash"
                  />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="tournamentSize" className="text-right">
                    Size
                  </Label>
                  <Select
                    onValueChange={(v) =>
                      setSelectedSize(Number(v) as TournamentSize)
                    }
                    value={selectedSize?.toString()}
                  >
                    <SelectTrigger className="col-span-3">
                      <SelectValue placeholder="Select tournament size" />
                    </SelectTrigger>
                    <SelectContent>
                      {tournamentSizes.map((size) => (
                        <SelectItem key={size} value={size.toString()}>
                          {size} Players
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button
                  onClick={handleCreateTournament}
                  disabled={isCreatingTournament}
                >
                  {isCreatingTournament ? "Creating..." : "Create Tournament"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        <Card className="mb-8 shadow-lg">
          <CardHeader>
            <CardTitle>Active Tournaments</CardTitle>
            <CardDescription>
              Browse ongoing and upcoming tournaments.
            </CardDescription>
            <div className="relative mt-4">
              <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
              <Input
                placeholder="Search tournaments by name or creator..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 w-full max-w-md"
              />
            </div>
          </CardHeader>
          <CardContent>
            {isLoadingTournaments ? (
              <div className="flex items-center justify-center h-40">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
              </div>
            ) : filtered.length > 0 ? (
              <ScrollArea className="h-[400px]">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 p-1">
                  {filtered.map((t) => (
                    <Card key={t.id} className="hover:shadow-md transition-shadow">
                      <CardHeader>
                        <CardTitle className="truncate">{t.name}</CardTitle>
                        <CardDescription>
                          Created by: {t.creatorName}
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <p className="text-sm text-muted-foreground">
                          Size: {t.size} Players
                        </p>
                        <p className="text-sm text-muted-foreground">
                          Players Registered: {t.players.length}
                        </p>
                        <p className="text-sm text-muted-foreground capitalize">
                          Status: {t.status.replace("_", " ")}
                        </p>
                      </CardContent>
                      <CardFooter>
                        <Button asChild className="w-full">
                          <Link href={`/tournaments/${t.id}`}>
                            View Tournament
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
                  ? "No tournaments match your search."
                  : "No tournaments found. Why not create one?"}
              </p>
            )}
          </CardContent>
        </Card>

        <Separator className="my-8" />

        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle>Tournament Features - Coming Soon!</CardTitle>
            <CardDescription>
              Automated brackets, scheduling, and in-tournament ELO updates are
              under development.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <Image
              src="https://picsum.photos/seed/tournament-features/600/300"
              alt="Tournament bracket placeholder"
              width={600}
              height={300}
              className="rounded-lg shadow-md mx-auto my-4"
            />
            <p className="text-muted-foreground">
              We’re working hard to bring you a seamless tournament experience
              with automated bracket generation, match scheduling, and real-time
              ELO adjustments.
            </p>
          </CardContent>
        </Card>
      </div>
    </ProtectedRoute>
  );
}