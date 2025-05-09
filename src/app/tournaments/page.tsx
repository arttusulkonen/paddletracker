// src/app/tournaments/page.tsx
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
  const [selectedSize, setSelectedSize] = useState<TournamentSize>();
  const [isCreatingTournament, setIsCreatingTournament] = useState(false);
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    if (!user) return;
    setIsLoading(true);
    const ref = collection(db, "tournaments");
    const unsub = onSnapshot(
      query(ref),
      async (snap) => {
        const data: Tournament[] = [];
        for (const d of snap.docs) {
          const t = { id: d.id, ...(d.data() as Omit<Tournament, "id">) } as Tournament;
          if (t.createdBy && !t.creatorName) {
            const profile = await getDoc(doc(db, "users", t.createdBy));
            if (profile.exists()) {
              t.creatorName =
                (profile.data() as UserProfile).name || "Unknown User";
            }
          }
          data.push(t);
        }
        data.sort((a, b) => {
          // compare Finnish date strings
          return b.createdAt.localeCompare(a.createdAt);
        });
        setTournaments(data);
        setIsLoading(false);
      },
      (err) => {
        console.error(err);
        toast({
          title: "Error",
          description: "Could not fetch tournaments.",
          variant: "destructive",
        });
        setIsLoading(false);
      }
    );
    return () => unsub();
  }, [user, toast]);

  const handleCreate = async () => {
    if (!user) {
      toast({ title: "Error", description: "Log in to create a tournament.", variant: "destructive" });
      return;
    }
    if (!tournamentName.trim()) {
      toast({ title: "Error", description: "Tournament name is required.", variant: "destructive" });
      return;
    }
    if (!selectedSize) {
      toast({ title: "Error", description: "Please select a size.", variant: "destructive" });
      return;
    }
    setIsCreatingTournament(true);
    try {
      const ts = getFinnishFormattedDate();
      const docRef = await addDoc(collection(db, "tournaments"), {
        name: tournamentName.trim(),
        createdBy: user.uid,
        creatorName: userProfile?.name || "Unknown User",
        size: selectedSize,
        status: "pending_registration",
        createdAt: ts,
        players: [
          {
            uid: user.uid,
            name: userProfile?.name || "Player",
            eloAtStart: userProfile?.globalElo ?? 1000,
            matchesPlayed: 0,
            wins: 0,
            losses: 0,
            points: 0,
          },
        ],
      });
      toast({ title: "Success", description: `Tournament "${tournamentName}" created.` });
      setTournamentName("");
      setSelectedSize(undefined);
    } catch (err) {
      console.error(err);
      toast({ title: "Error", description: "Failed to create tournament.", variant: "destructive" });
    } finally {
      setIsCreatingTournament(false);
    }
  };

  const filtered = tournaments.filter(
    (t) =>
      t.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.creatorName?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <ProtectedRoute>
      <div className="container mx-auto py-8 px-4">
        <div className="flex flex-col sm:flex-row justify-between items-center mb-8 gap-4">
          <h1 className="text-4xl font-bold flex items-center gap-2">
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
                  Set up your tournament and invite players.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  value={tournamentName}
                  onChange={(e) => setTournamentName(e.target.value)}
                  placeholder="Tournament name"
                />
                <Label>Size</Label>
                <Select
                  value={selectedSize?.toString()}
                  onValueChange={(v) => setSelectedSize(Number(v) as TournamentSize)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select size" />
                  </SelectTrigger>
                  <SelectContent>
                    {tournamentSizes.map((sz) => (
                      <SelectItem key={sz} value={sz.toString()}>
                        {sz} Players
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <DialogFooter>
                <Button onClick={handleCreate} disabled={isCreatingTournament}>
                  {isCreatingTournament ? "Creating..." : "Create Tournament"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        <Card className="mb-8 shadow-lg">
          <CardHeader>
            <CardTitle>Active Tournaments</CardTitle>
            <CardDescription>Browse ongoing tournaments.</CardDescription>
            <div className="relative mt-4">
              <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
              <Input
                placeholder="Search by name or creator..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 w-full max-w-md"
              />
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center h-40">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
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
                          Registered: {t.players.length}
                        </p>
                        <p className="text-sm text-muted-foreground capitalize">
                          Status: {t.status.replace("_", " ")}
                        </p>
                      </CardContent>
                      <CardFooter>
                        <Button asChild className="w-full">
                          <Link href={`/tournaments/${t.id}`}>View</Link>
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
                  : "No tournaments found."}
              </p>
            )}
          </CardContent>
        </Card>

        <Separator className="my-8" />

        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle>Coming Soon</CardTitle>
            <CardDescription>
              Automated brackets and real-time updates.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <Image
              src="https://picsum.photos/seed/tournament/600/300"
              alt="Coming soon"
              width={600}
              height={300}
              className="rounded-lg mx-auto"
            />
          </CardContent>
        </Card>
      </div>
    </ProtectedRoute>
  );
}