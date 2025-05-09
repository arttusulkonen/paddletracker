// src/app/rooms/[roomId]/page.tsx
/* eslint-disable @typescript-eslint/no-non-null-assertion */
"use client";

import * as ProtectedRoutes from "@/components/ProtectedRoutes";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
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
import { db } from "@/lib/firebase";
import { finalizeSeason } from "@/lib/season";
import type { Match, Room, UserProfile } from "@/lib/types";
import { getFinnishFormattedDate } from "@/lib/utils";
import {
  addDoc,
  arrayUnion,
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
  where,
} from "firebase/firestore";
import {
  ArrowLeft,
  Crown,
  MailPlus,
  Plus,
  ShieldCheck,
  Sword,
  Trash2,
  Users,
} from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

/* ------------------------------------------------------------------ */
/* component                                                           */
/* ------------------------------------------------------------------ */

export default function RoomPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const router = useRouter();
  const roomId = useParams().roomId as string;

  /* ------------------------------ state ---------------------------- */
  const [room, setRoom] = useState<Room | null>(null);
  const [members, setMembers] = useState<Room["members"]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [inviteEmail, setInviteEmail] = useState("");
  const [isInviting, setIsInviting] = useState(false);
  const [player1Id, setPlayer1Id] = useState("");
  const [player2Id, setPlayer2Id] = useState("");
  const [matches, setMatches] = useState([{ score1: "", score2: "", side1: "", side2: "" }]);
  const [isRecording, setIsRecording] = useState(false);
  const [recentMatches, setRecentMatches] = useState<Match[]>([]);

  /* ----------------------- derived: season info ------------------- */
  /**
   * Берём самую свежую запись из seasonHistory (если есть)
   * и поддерживаем как новую схему (`summary`), так и старую (`members`).
   */
  const latestSeason: any | null =
    room?.seasonHistory?.length
      ? [...room.seasonHistory].reverse().find(
        (s) => Array.isArray(s.summary) || Array.isArray(s.members)
      )
      : null;

  const seasonEnded = Boolean(latestSeason);

  /* --------------------------- helpers ---------------------------- */
  const calculateElo = (
    playerRating: number,
    opponentRating: number,
    score: 0 | 1
  ) => {
    const k = 32;
    const expected = 1 / (1 + 10 ** ((opponentRating - playerRating) / 400));
    return Math.round(playerRating + k * (score - expected));
  };

  /* --------------------- live subscriptions ----------------------- */
  useEffect(() => {
    if (!user) return;

    const roomRef = doc(db, "rooms", roomId);
    const unsubRoom = onSnapshot(roomRef, (snap) => {
      if (!snap.exists()) {
        toast({ title: "Error", description: "Room not found", variant: "destructive" });
        router.push("/rooms");
        return;
      }
      const data = snap.data() as Room;
      setRoom(data);
      setMembers(data.members || []);
      setIsLoading(false);
    });

    const matchesQ = query(
      collection(db, "matches"),
      where("roomId", "==", roomId),
      orderBy("timestamp", "desc")
    );
    const unsubMatches = onSnapshot(matchesQ, (snap) => {
      setRecentMatches(
        snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) } as Match))
      );
    });

    return () => { unsubRoom(); unsubMatches(); };
  }, [user, roomId, router, toast]);

  /* -------------------------- invite ------------------------------ */
  const handleInvite = async () => {
    if (!inviteEmail.trim() || !room) return;
    setIsInviting(true);
    try {
      const uQ = query(collection(db, "users"), where("email", "==", inviteEmail.trim()));
      const usnap = await getDocs(uQ);
      if (usnap.empty) {
        toast({ title: "Not Found", description: "No user with that email.", variant: "destructive" });
        return;
      }
      const docSnap = usnap.docs[0];
      const invited = docSnap.data() as UserProfile;
      const uid = docSnap.id;

      if (members.some((m) => m.userId === uid)) {
        toast({ title: "Already Member", description: `${invited.name} is already in this room.` });
        return;
      }

      const newMember = {
        userId: uid,
        name: invited.name || invited.email!,
        email: invited.email!,
        rating: 1000,
        wins: 0,
        losses: 0,
        date: getFinnishFormattedDate(),
        role: "editor" as const,
      };

      await updateDoc(doc(db, "rooms", roomId), { members: arrayUnion(newMember) });
      setMembers((prev) => [...prev, newMember]);
      toast({ title: "Invited", description: `${newMember.name} has been invited.` });
      setInviteEmail("");
    } catch (e) {
      console.error(e);
      toast({ title: "Error", description: "Failed to invite player.", variant: "destructive" });
    } finally {
      setIsInviting(false);
    }
  };

  /* ------------------ update stats helpers ----------------------- */
  const updatePlayerStats = async (
    playerId: string,
    newRating: number,
    wins: number,
    losses: number
  ) => {
    await updateDoc(doc(db, "users", playerId), {
      globalElo: newRating,
      matchesPlayed: wins + losses,
      wins, losses,
      eloHistory: arrayUnion({ date: getFinnishFormattedDate(), elo: newRating }),
    });
  };

  const updateRoomMemberStats = async (
    userId: string,
    newRoomRating: number,
    newWins: number,
    newLosses: number
  ) => {
    const roomRef = doc(db, "rooms", roomId);
    const snap = await getDoc(roomRef);
    if (!snap.exists()) return;
    const data = snap.data() as Room;
    const updated = (data.members || []).map((m) =>
      m.userId === userId
        ? { ...m, rating: newRoomRating, wins: newWins, losses: newLosses, date: getFinnishFormattedDate() }
        : m
    );
    await updateDoc(roomRef, { members: updated });
  };

  /* ---------------------- record matches ------------------------- */
  const addMatchRow = () => setMatches((m) => [...m, { score1: "", score2: "", side1: "", side2: "" }]);
  const removeMatchRow = (i: number) => setMatches((m) => m.filter((_, idx) => idx !== i));

  const handleRecordMatches = async () => {
    if (!player1Id || !player2Id || player1Id === player2Id ||
      matches.some((m) => !m.score1 || !m.score2 || !m.side1 || !m.side2)) {
      toast({ title: "Invalid", description: "Select two different players and fill all fields.", variant: "destructive" });
      return;
    }

    setIsRecording(true);
    try {
      for (const match of matches) {
        const score1 = parseInt(match.score1, 10);
        const score2 = parseInt(match.score2, 10);
        const winnerId = score1 > score2 ? player1Id : player2Id;
        const timestamp = getFinnishFormattedDate();

        /* --- load players (global) --- */
        const [snap1, snap2] = await Promise.all([
          getDoc(doc(db, "users", player1Id)),
          getDoc(doc(db, "users", player2Id)),
        ]);
        const p1Data = snap1.data() as any;
        const p2Data = snap2.data() as any;

        const g1 = p1Data.globalElo ?? 1000;
        const g2 = p2Data.globalElo ?? 1000;
        const s1 = winnerId === player1Id ? 1 : 0;
        const s2 = winnerId === player2Id ? 1 : 0;

        const newG1 = calculateElo(g1, g2, s1);
        const newG2 = calculateElo(g2, g1, s2);
        const dp1 = newG1 - g1;
        const dp2 = newG2 - g2;

        const newGW1 = (p1Data.wins || 0) + s1;
        const newGL1 = (p1Data.losses || 0) + (1 - s1);
        const newGW2 = (p2Data.wins || 0) + s2;
        const newGL2 = (p2Data.losses || 0) + (1 - s2);

        /* --- room ratings --- */
        const roomSnap = await getDoc(doc(db, "rooms", roomId));
        const roomData = roomSnap.data() as Room;
        const p1Room = roomData.members.find((m) => m.userId === player1Id) || {};
        const p2Room = roomData.members.find((m) => m.userId === player2Id) || {};

        const rOld1 = p1Room.rating ?? 1000;
        const rOld2 = p2Room.rating ?? 1000;
        const newR1 = rOld1 + dp1;
        const newR2 = rOld2 + dp2;
        const rW1 = (p1Room.wins || 0) + (dp1 > 0 ? 1 : 0);
        const rL1 = (p1Room.losses || 0) + (dp1 < 0 ? 1 : 0);
        const rW2 = (p2Room.wins || 0) + (dp2 > 0 ? 1 : 0);
        const rL2 = (p2Room.losses || 0) + (dp2 < 0 ? 1 : 0);

        /* --- write match --- */
        await addDoc(collection(db, "matches"), {
          player1Id, player2Id, players: [player1Id, player2Id],
          player1: {
            name: p1Room.name, scores: score1,
            oldRating: g1, newRating: newG1, addedPoints: dp1,
            roomOldRating: rOld1, roomNewRating: newR1, roomAddedPoints: dp1,
            side: match.side1,
          },
          player2: {
            name: p2Room.name, scores: score2,
            oldRating: g2, newRating: newG2, addedPoints: dp2,
            roomOldRating: rOld2, roomNewRating: newR2, roomAddedPoints: dp2,
            side: match.side2,
          },
          timestamp, roomId,
          winner: roomData.members.find((m) => m.userId === winnerId)?.name,
        });

        /* --- update stats --- */
        await updatePlayerStats(player1Id, newG1, newGW1, newGL1);
        await updatePlayerStats(player2Id, newG2, newGW2, newGL2);
        await updateRoomMemberStats(player1Id, newR1, rW1, rL1);
        await updateRoomMemberStats(player2Id, newR2, rW2, rL2);
      }

      /* --- reset form --- */
      setPlayer1Id("");
      setPlayer2Id("");
      setMatches([{ score1: "", score2: "", side1: "", side2: "" }]);
      toast({ title: "Matches Recorded", description: "ELO & stats updated." });
    } catch (e) {
      console.error(e);
      toast({ title: "Error", description: "Failed to record match(es).", variant: "destructive" });
    } finally {
      setIsRecording(false);
    }
  };

  /* ----------------------- finish season -------------------------- */
  const finishSeason = async () => {
    try {
      await finalizeSeason(roomId);
      toast({ title: "Season Finished", description: "Stats & achievements updated." });
    } catch (e) {
      console.error(e);
      toast({ title: "Error", description: "Could not finish season.", variant: "destructive" });
    }
  };

  /* -------------------------- guards ------------------------------ */
  if (isLoading || !room) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-primary" />
      </div>
    );
  }

  /* --------------------- finalMembers for UI ---------------------- */
  let finalMembers: any[] = [];
  if (latestSeason) {
    if (Array.isArray(latestSeason.summary)) {
      finalMembers = [...latestSeason.summary].sort((a, b) => (a.place ?? 0) - (b.place ?? 0));
    } else if (Array.isArray(latestSeason.members)) {
      // «старая» запись без summary → сортируем по рейтингу
      finalMembers = [...latestSeason.members]
        .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))
        .map((m, idx) => ({ ...m, place: idx + 1, finalScore: m.rating ?? 0 }));
    }
  }

  const roomMembers = members.map((m) => ({ userId: m.userId, name: m.name, rating: m.rating }));

  /* --------------------------- UI --------------------------------- */
  return (
    <ProtectedRoutes.ProtectedRoute>
      <div className="container mx-auto py-8 px-4">
        <Button variant="outline" className="mb-6" onClick={() => router.push("/rooms")}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to Rooms
        </Button>

        {/* ------------------------------------------------------------ */}
        {/* ROOM HEADER + MEMBERS ------------------------------------- */}
        {/* ------------------------------------------------------------ */}
        <Card className="mb-8 shadow-xl">
          <CardHeader className="bg-muted/50 p-6 flex flex-col md:flex-row items-center gap-6">
            <Avatar className="h-24 w-24 border-4 border-background shadow-md">
              <AvatarImage src={room.avatarURL || undefined} />
              <AvatarFallback>{room.name.charAt(0)}</AvatarFallback>
            </Avatar>
            <div className="text-center md:text-left">
              <CardTitle className="text-3xl font-bold">{room.name}</CardTitle>
              <CardDescription>Created by: {room.creatorName}</CardDescription>
            </div>
          </CardHeader>

          <CardContent className="p-6 grid md:grid-cols-3 gap-6">
            {/* MEMBERS LIST + INVITE */}
            <div>
              <Users className="text-primary" /> Members ({members.length})
              <ScrollArea className="h-[300px] border rounded-md p-3 bg-background">
                {[...members]
                  .sort((a, b) => (b.rating || 0) - (a.rating || 0))
                  .map((m) => {
                    const played = (m.wins || 0) + (m.losses || 0);
                    const winPct = played ? Math.round(((m.wins || 0) / played) * 100) : 0;
                    return (
                      <div key={m.userId} className="flex items-center justify-between p-2 hover:bg-muted/50 rounded-md">
                        <div className="flex items-center gap-3">
                          <Avatar className="h-8 w-8">
                            <AvatarImage src={m.photoURL || undefined} />
                            <AvatarFallback>{m.name.charAt(0)}</AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="font-medium">{m.name}</p>
                            <p className="text-xs text-muted-foreground">
                              MP: {played} &middot; W%: {winPct}%
                            </p>
                          </div>
                          {m.userId === room.creator && <Crown className="h-4 w-4 text-yellow-500" />}
                        </div>
                        <span className="text-sm font-semibold text-primary">{m.rating} pts</span>
                      </div>
                    );
                  })}
              </ScrollArea>

              <Dialog>
                <DialogTrigger asChild>
                  <Button className="mt-4 w-full" variant="outline" disabled={isInviting}>
                    <MailPlus className="mr-2 h-4 w-4" /> Invite Player
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Invite to {room.name}</DialogTitle>
                    <DialogDescription>By email</DialogDescription>
                  </DialogHeader>
                  <div className="space-y-2 py-2">
                    <Label htmlFor="inviteEmail">Email</Label>
                    <Input id="inviteEmail" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} />
                  </div>
                  <DialogFooter>
                    <DialogClose asChild><Button variant="ghost">Cancel</Button></DialogClose>
                    <Button onClick={handleInvite}>Send Invite</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>

            {/* RECORD MATCHES */}
            {!seasonEnded && (
              <Card className="md:col-span-2 shadow-md">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2"><Sword className="text-accent" /> Record Match(es)</CardTitle>
                  <CardDescription>Select two players and enter one or more games.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* PLAYER SELECTORS */}
                  <div className="grid grid-cols-2 gap-4 items-end">
                    <PlayerSelect label="Player 1" value={player1Id} list={roomMembers.filter((x) => x.userId !== player2Id)} onChange={setPlayer1Id} />
                    <PlayerSelect label="Player 2" value={player2Id} list={roomMembers.filter((x) => x.userId !== player1Id)} onChange={setPlayer2Id} />
                  </div>

                  {/* MATCH ROWS */}
                  {matches.map((m, i) => (
                    <MatchRowInput
                      key={i}
                      index={i}
                      data={m}
                      onChange={(newRow) => setMatches((rows) => rows.map((r, idx) => (idx === i ? newRow : r)))}
                      onRemove={() => removeMatchRow(i)}
                      removable={i > 0}
                    />
                  ))}

                  <Button variant="outline" className="flex items-center gap-2" onClick={addMatchRow}>
                    <Plus /> Add another match
                  </Button>

                  <Button className="w-full mt-4" disabled={isRecording} onClick={handleRecordMatches}>
                    {isRecording ? "Recording..." : "Record Match & Update ELO"}
                  </Button>
                </CardContent>
              </Card>
            )}

            {/* FINISH SEASON BUTTON */}
            {!seasonEnded && (
              <div className="md:col-span-3 text-right">
                <Button variant="destructive" onClick={finishSeason}>
                  Finish Season
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <Separator className="my-8" />

        {/* ------------------------------------------------------------ */}
        {/* SEASON RESULTS -------------------------------------------- */}
        {/* ------------------------------------------------------------ */}
        {seasonEnded && (
          <Card className="shadow-lg">
            <CardHeader>
              <CardTitle>Season Results</CardTitle>
              <CardDescription>Final standings for this season.</CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[300px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Place</TableHead>
                      <TableHead>Player</TableHead>
                      <TableHead>Fair&nbsp;Score</TableHead>
                      <TableHead>W</TableHead>
                      <TableHead>L</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {finalMembers.map((m) => (
                      <TableRow key={m.userId}>
                        <TableCell>{m.place}</TableCell>
                        <TableCell>{m.name}</TableCell>
                        <TableCell>{m.finalScore?.toFixed?.(2) ?? "-"}</TableCell>
                        <TableCell>{m.wins}</TableCell>
                        <TableCell>{m.losses}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>
            </CardContent>
          </Card>
        )}

        {/* ------------------------------------------------------------ */}
        {/* RECENT MATCHES -------------------------------------------- */}
        {/* ------------------------------------------------------------ */}
        <Card className="shadow-lg mt-8">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><ShieldCheck className="text-primary" /> Recent Matches</CardTitle>
          </CardHeader>
          <CardContent>
            {recentMatches.length ? (
              <ScrollArea className="h-[300px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Player 1</TableHead>
                      <TableHead>Player 2</TableHead>
                      <TableHead>Points</TableHead>
                      <TableHead>Score</TableHead>
                      <TableHead>Winner</TableHead>
                      <TableHead>Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recentMatches.map((m) => (
                      <TableRow key={m.id}>
                        <TableCell>{m.player1.name}</TableCell>
                        <TableCell>{m.player2.name}</TableCell>
                        <TableCell>{m.player1.roomAddedPoints} | {m.player2.roomAddedPoints}</TableCell>
                        <TableCell>{m.player1.scores} – {m.player2.scores}</TableCell>
                        <TableCell className="font-semibold">{m.winner}</TableCell>
                        <TableCell>{m.timestamp}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>
            ) : (
              <p className="text-center text-muted-foreground py-8">No recent matches.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </ProtectedRoutes.ProtectedRoute>
  );
}

/* ------------------------------------------------------------------ */
/* small sub-components                                                */
/* ------------------------------------------------------------------ */

function PlayerSelect({
  label, value, onChange, list,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  list: { userId: string; name: string; rating: number }[];
}) {
  return (
    <div>
      <Label>{label}</Label>
      <select className="w-full border p-2 rounded" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Select</option>
        {list.map((x) => (
          <option key={x.userId} value={x.userId}>
            {x.name} ({x.rating})
          </option>
        ))}
      </select>
    </div>
  );
}

function MatchRowInput({
  index, data, onChange, onRemove, removable,
}: {
  index: number;
  data: { score1: string; score2: string; side1: string; side2: string };
  onChange: (r: any) => void;
  onRemove: () => void;
  removable: boolean;
}) {
  return (
    <div className="grid grid-cols-2 gap-4 mb-2 relative">
      {["1", "2"].map((n) => (
        <div key={n}>
          <Label>{`P${n} Score`}</Label>
          <Input
            type="number"
            value={data[`score${n}` as const]}
            onChange={(e) => onChange({ ...data, [`score${n}`]: e.target.value })}
          />
          <Label className="mt-2">Side</Label>
          <select
            className="w-full border p-2 rounded"
            value={data[`side${n}` as const]}
            onChange={(e) =>
              onChange({
                ...data,
                [`side${n}`]: e.target.value,
                [`side${n === "1" ? "2" : "1"}`]: e.target.value === "left" ? "right" : "left",
              })
            }
          >
            <option value="">–</option>
            <option value="left">Left</option>
            <option value="right">Right</option>
          </select>
        </div>
      ))}

      {removable && (
        <Button variant="ghost" className="absolute top-1/2 right-0 -translate-y-1/2" onClick={onRemove}>
          <Trash2 />
        </Button>
      )}
    </div>
  );
}