// src/app/rooms/[roomId]/page.tsx
/* eslint-disable @typescript-eslint/no-non-null-assertion */
"use client";

import * as ProtectedRoutes from "@/components/ProtectedRoutes";
import {
  Avatar, AvatarFallback, AvatarImage,
  Button,
  Card, CardContent, CardDescription, CardHeader, CardTitle,
  Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
  Input, Label, ScrollArea, Separator,
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { db } from "@/lib/firebase";
import { finalizeSeason } from "@/lib/season";
import type { Match, Room, UserProfile } from "@/lib/types";
import { getFinnishFormattedDate } from "@/lib/utils";
import {
  addDoc, arrayUnion, collection, doc, getDoc, getDocs,
  onSnapshot, orderBy, query, updateDoc, where,
} from "firebase/firestore";
import {
  ArrowLeft, Crown, MailPlus, Plus, ShieldCheck, Sword, Trash2, Users,
} from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

/* ------------------------------------------------------------------ */
/* helpers ----------------------------------------------------------- */
const calcWinPct = (w: number, l: number) => {
  const t = w + l;
  return t ? ((w / t) * 100).toFixed(1) : "0.0";
};
const calculateElo = (pr: number, or: number, s: 0 | 1) => {
  const k = 32;
  const expected = 1 / (1 + 10 ** ((or - pr) / 400));
  return Math.round(pr + k * (s - expected));
};

/* ------------------------------------------------------------------ */
/* component --------------------------------------------------------- */
export default function RoomPage() {
  /* ---------------------------------------------------------------- */
  /* basic hooks / params ------------------------------------------- */
  const { user } = useAuth();
  const { toast } = useToast();
  const router = useRouter();
  const roomId = useParams().roomId as string;

  /* ---------------------------------------------------------------- */
  /* state ----------------------------------------------------------- */
  const [room, setRoom] = useState<Room | null>(null);
  const [members, setMembers] = useState<Room["members"]>([]);
  const [isLoading, setIsLoading] = useState(true);

  /* ---- invite ---------------- */
  const [inviteEmail, setInvite] = useState("");
  const [isInviting, setInviting] = useState(false);

  /* ---- record matches -------- */
  const [player1Id, setP1] = useState("");
  const [player2Id, setP2] = useState("");
  const [matches, setMatches] = useState([{ score1: "", score2: "", side1: "", side2: "" }]);
  const [isRecording, setRec] = useState(false);

  /* ---- history / results ----- */
  const [recent, setRecent] = useState<Match[]>([]);
  const [latestSeason, setLast] = useState<any | null>(null);
  const seasonEnded = Boolean(latestSeason);

  /* ---- table view ------------ */
  const [viewMode, setView] = useState<"regular" | "final">("regular");
  const [isFiltered, setFilter] = useState(false);
  const [sort, setSort] = useState<{ key: string; dir: "asc" | "desc" }>({ key: "rating", dir: "desc" });

  /* ---------------------------------------------------------------- */
  /* live subscriptions --------------------------------------------- */
  useEffect(() => {
    if (!user) return;

    const roomRef = doc(db, "rooms", roomId);
    const unsubRoom = onSnapshot(roomRef, (snap) => {
      if (!snap.exists()) {
        toast({ title: "Error", description: "Room not found", variant: "destructive" });
        router.push("/rooms");
        return;
      }
      const d = snap.data() as Room;
      setRoom(d);
      setMembers(d.members ?? []);
      /* последняя запись сезона (summary - новая схема, members - старая) */
      const ls = d.seasonHistory?.slice().reverse()
        .find((s: any) => Array.isArray(s.summary) || Array.isArray(s.members)) ?? null;
      setLast(ls);
      setIsLoading(false);
    });

    const mQ = query(collection(db, "matches"), where("roomId", "==", roomId), orderBy("timestamp", "desc"));
    const unsubMatches = onSnapshot(mQ, (s) =>
      setRecent(s.docs.map((d) => ({ id: d.id, ...(d.data() as any) }) as Match))
    );

    return () => { unsubRoom(); unsubMatches(); };
  }, [user, roomId, router, toast]);

  /* если сезон закончился – по умолчанию показываем финальную таблицу */
  useEffect(() => {
    if (seasonEnded) setView("final");
  }, [seasonEnded]);

  /* ---------------------------------------------------------------- */
  /* invite ---------------------------------------------------------- */
  const handleInvite = async () => {
    if (!inviteEmail.trim() || !room) return;
    setInviting(true);
    try {
      const q = query(collection(db, "users"), where("email", "==", inviteEmail.trim()));
      const s = await getDocs(q);
      if (s.empty) { toast({ title: "No user", description: "Email not found", variant: "destructive" }); return; }
      const snap = s.docs[0];
      const target = snap.data() as UserProfile;
      const uid = snap.id;
      if (members.some(m => m.userId === uid)) { toast({ title: "Already member" }); return; }

      const newMember = { userId: uid, name: target.name || target.email!, email: target.email!, rating: 1000, wins: 0, losses: 0, date: getFinnishFormattedDate(), role: "editor" as const };
      await updateDoc(doc(db, "rooms", roomId), { members: arrayUnion(newMember) });
      toast({ title: "Invited", description: `${newMember.name} added` });
      setInvite("");
    } catch (e) { console.error(e); toast({ title: "Error", description: "Invite failed", variant: "destructive" }); }
    finally { setInviting(false); }
  };

  /* ---------------------------------------------------------------- */
  /* record matches -------------------------------------------------- */
  const addRow = () => setMatches((r) => [...r, { score1: "", score2: "", side1: "", side2: "" }]);
  const removeRow = (i: number) => setMatches((r) => r.filter((_, idx) => idx !== i));

  const saveMatches = async () => {
    if (!player1Id || !player2Id || player1Id === player2Id || matches.some(m => !m.score1 || !m.score2 || !m.side1 || !m.side2)) {
      toast({ title: "Fill all fields", variant: "destructive" }); return;
    }
    setRec(true);
    try {
      for (const row of matches) {
        const s1 = parseInt(row.score1, 10), s2 = parseInt(row.score2, 10);
        const winnerId = s1 > s2 ? player1Id : player2Id;
        const time = getFinnishFormattedDate();

        /* global players */
        const [g1s, g2s] = await Promise.all([getDoc(doc(db, "users", player1Id)), getDoc(doc(db, "users", player2Id))]);
        const p1 = g1s.data() as any, p2 = g2s.data() as any;
        const g1 = p1.globalElo ?? 1000, g2 = p2.globalElo ?? 1000;
        const newG1 = calculateElo(g1, g2, winnerId === player1Id ? 1 : 0);
        const newG2 = calculateElo(g2, g1, winnerId === player2Id ? 1 : 0);
        const dG1 = newG1 - g1, dG2 = newG2 - g2;

        /* room ratings */
        const rSnap = await getDoc(doc(db, "rooms", roomId)); const rData = rSnap.data() as Room;
        const rp1 = rData.members.find(m => m.userId === player1Id)!;
        const rp2 = rData.members.find(m => m.userId === player2Id)!;
        const r1 = rp1.rating + dG1, r2 = rp2.rating + dG2;

        /* write match */
        await addDoc(collection(db, "matches"), {
          roomId, timestamp: time,
          player1Id, player2Id, players: [player1Id, player2Id],
          player1: { name: rp1.name, scores: s1, oldRating: g1, newRating: newG1, addedPoints: dG1, roomOldRating: rp1.rating, roomNewRating: r1, roomAddedPoints: dG1, side: row.side1 },
          player2: { name: rp2.name, scores: s2, oldRating: g2, newRating: newG2, addedPoints: dG2, roomOldRating: rp2.rating, roomNewRating: r2, roomAddedPoints: dG2, side: row.side2 },
          winner: winnerId === player1Id ? rp1.name : rp2.name,
        });

        /* update firestore stats (users & room members) */
        await Promise.all([
          updateDoc(doc(db, "users", player1Id), {
            globalElo: newG1, wins: (p1.wins || 0) + (winnerId === player1Id ? 1 : 0),
            losses: (p1.losses || 0) + (winnerId === player2Id ? 1 : 0),
            matchesPlayed: (p1.matchesPlayed || 0) + 1,
            eloHistory: arrayUnion({ date: time, elo: newG1 }),
          }),
          updateDoc(doc(db, "users", player2Id), {
            globalElo: newG2, wins: (p2.wins || 0) + (winnerId === player2Id ? 1 : 0),
            losses: (p2.losses || 0) + (winnerId === player1Id ? 1 : 0),
            matchesPlayed: (p2.matchesPlayed || 0) + 1,
            eloHistory: arrayUnion({ date: time, elo: newG2 }),
          }),
          updateDoc(doc(db, "rooms", roomId), {
            members: rData.members.map((m) => m.userId === player1Id ? { ...m, rating: r1, wins: m.wins + (dG1 > 0 ? 1 : 0), losses: m.losses + (dG1 < 0 ? 1 : 0) }
              : m.userId === player2Id ? { ...m, rating: r2, wins: m.wins + (dG2 > 0 ? 1 : 0), losses: m.losses + (dG2 < 0 ? 1 : 0) }
                : m)
          }),
        ]);
      }
      setP1(""); setP2(""); setMatches([{ score1: "", score2: "", side1: "", side2: "" }]);
      toast({ title: "Recorded" });
    } catch (e) { console.error(e); toast({ title: "Error", variant: "destructive" }); }
    finally { setRec(false); }
  };

  /* ---------------------------------------------------------------- */
  /* finish season --------------------------------------------------- */
  const handleFinishSeason = async () => {
    try {
      await finalizeSeason(roomId);
      toast({ title: "Season finished" });
      setView("final");
    } catch (e) { console.error(e); toast({ title: "Error", variant: "destructive" }); }
  };

  /* ---------------------------------------------------------------- */
  /* derived data for tables ---------------------------------------- */
  const finalRows = useMemo(() => {
    if (!latestSeason) return [];
    const arr = Array.isArray(latestSeason.summary)
      ? [...latestSeason.summary]
      : Array.isArray(latestSeason.members)
        ? [...latestSeason.members]
        : [];
    return arr.sort((a: any, b: any) => (a.place ?? 0) - (b.place ?? 0));
  }, [latestSeason]);

  const regularPlayers = useMemo(() => {
    const enriched = members.map((m) => {
      const total = (m.wins || 0) + (m.losses || 0);
      return {
        ...m,
        totalMatches: total,
        ratingVisible: total >= 5,
        winPct: calcWinPct(m.wins || 0, m.losses || 0),
      };
    });

    /* sort (with hidden ratings at bottom) */
    const sorted = [...enriched].sort((a, b) => {
      if (a.ratingVisible !== b.ratingVisible) return a.ratingVisible ? -1 : 1;
      const dir = sort.dir === "asc" ? 1 : -1;
      return a[sort.key] > b[sort.key] ? dir : -dir;
    });

    if (!isFiltered) return sorted;

    const avg = sorted.reduce((acc, p) => acc + p.totalMatches, 0) / (sorted.length || 1);
    return [...sorted.filter(p => p.totalMatches >= avg), ...sorted.filter(p => p.totalMatches < avg)];
  }, [members, sort, isFiltered]);

  /* helpers */
  const toggleSort = (key: string) => setSort((s) => ({
    key,
    dir: s.key === key && s.dir === "asc" ? "desc" : "asc",
  }));

  /* ---------------------------------------------------------------- */
  /* guards ---------------------------------------------------------- */
  if (isLoading || !room) {
    return <div className="flex items-center justify-center min-h-screen"><div className="animate-spin h-16 w-16 rounded-full border-b-4 border-primary" /></div>;
  }

  /* ---------------------------------------------------------------- */
  /* UI -------------------------------------------------------------- */
  return (
    <ProtectedRoutes.ProtectedRoute>
      <div className="container mx-auto py-8 px-4">
        {/* Back */}
        <Button variant="outline" className="mb-6" onClick={() => router.push("/rooms")}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to Rooms
        </Button>

        {/* ------------ HEADER --------------------------------------- */}
        <Card className="mb-8 shadow-xl">
          <CardHeader className="bg-muted/50 p-6 flex flex-col md:flex-row items-center gap-6">
            <Avatar className="h-24 w-24 border-4 border-background shadow-md">
              <AvatarImage src={room.avatarURL || undefined} />
              <AvatarFallback>{room.name[0]}</AvatarFallback>
            </Avatar>
            <div className="text-center md:text-left">
              <CardTitle className="text-3xl font-bold">{room.name}</CardTitle>
              <CardDescription>Created by: {room.creatorName}</CardDescription>
            </div>
          </CardHeader>

          <CardContent className="p-6 grid md:grid-cols-3 gap-6">
            {/* ----------- MEMBERS & INVITE --------------------------- */}
            <MembersBlock />
            {/* ----------- RECORD MATCHES ----------------------------- */}
            {!seasonEnded && <RecordBlock />}
            {/* ----------- FINISH BUTTON ----------------------------- */}
            {!seasonEnded && (
              <div className="md:col-span-3 text-right">
                <Button variant="destructive" onClick={handleFinishSeason}>Finish Season</Button>
              </div>
            )}
          </CardContent>
        </Card>

        <Separator className="my-8" />

        {/* ------------ TABLES (REGULAR / FINAL) -------------------- */}
        <Card className="shadow-lg mb-8">
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <CardTitle>Standings</CardTitle>
              {seasonEnded && (
                <div className="flex gap-2">
                  <Button size="sm" variant={viewMode === "regular" ? "default" : "outline"} onClick={() => setView("regular")}>Regular table</Button>
                  <Button size="sm" variant={viewMode === "final" ? "default" : "outline"} onClick={() => setView("final")}>Final table</Button>
                </div>
              )}
            </div>
            {viewMode === "regular" && (
              <CardDescription>Current points / rankings inside the room.</CardDescription>
            )}
            {viewMode === "final" && (
              <CardDescription>Final standings for the finished season.</CardDescription>
            )}
          </CardHeader>
          <CardContent>
            {viewMode === "regular" && (
              <>
                {/* filter & info */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
                  <p className="text-sm">Apply <strong>fair ranking</strong>: first players with matches ≥ average.</p>
                  <Button size="sm" variant="outline" onClick={() => setFilter(f => !f)}>
                    {isFiltered ? "Remove fair ranking" : "Apply fair ranking"}
                  </Button>
                </div>

                <ScrollArea className="max-h-[400px]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead onClick={() => toggleSort("name")} className="cursor-pointer select-none">Name</TableHead>
                        <TableHead onClick={() => toggleSort("rating")} className="cursor-pointer select-none">Points</TableHead>
                        <TableHead onClick={() => toggleSort("totalMatches")} className="cursor-pointer select-none">Matches</TableHead>
                        <TableHead onClick={() => toggleSort("winPct")} className="cursor-pointer select-none">Win&nbsp;%</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {regularPlayers.map(p => (
                        <TableRow key={p.userId}>
                          <TableCell>
                            <a href={`/profile/${p.userId}`} className="hover:underline">{p.name}</a>
                            {p.userId === room.creator && <Crown className="inline ml-1 h-4 w-4 text-yellow-500" />}
                          </TableCell>
                          <TableCell>{p.ratingVisible ? p.rating : "Hidden"}</TableCell>
                          <TableCell>{p.totalMatches}</TableCell>
                          <TableCell>{p.ratingVisible ? p.winPct + "%" : "Hidden"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </>
            )}

            {viewMode === "final" && (
              seasonEnded ? (
                <ScrollArea className="max-h-[400px]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Place</TableHead><TableHead>Name</TableHead>
                        <TableHead>Matches</TableHead><TableHead>Wins</TableHead><TableHead>Losses</TableHead>
                        <TableHead>Longest&nbsp;WS</TableHead><TableHead>Total&nbsp;Added</TableHead><TableHead>Fair&nbsp;Score</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {finalRows.map((r: any) => (
                        <TableRow key={r.userId}>
                          <TableCell>{r.place}</TableCell>
                          <TableCell>{r.name}</TableCell>
                          <TableCell>{r.matchesPlayed}</TableCell>
                          <TableCell>{r.wins}</TableCell>
                          <TableCell>{r.losses}</TableCell>
                          <TableCell>{r.longestWinStreak ?? "-"}</TableCell>
                          <TableCell>{r.totalAddedPoints?.toFixed?.(2) ?? "-"}</TableCell>
                          <TableCell>{r.finalScore?.toFixed?.(2) ?? "-"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </ScrollArea>
              ) : (
                <p className="text-muted-foreground">Season is not finished yet.</p>
              )
            )}
          </CardContent>
        </Card>

        {/* ------------ RECENT MATCHES ------------------------------ */}
        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><ShieldCheck className="text-primary" /> Recent Matches</CardTitle>
          </CardHeader>
          <CardContent>
            {recent.length ? (
              <ScrollArea className="h-[300px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Player&nbsp;1</TableHead><TableHead>Player&nbsp;2</TableHead>
                      <TableHead>Δ&nbsp;pts</TableHead><TableHead>Score</TableHead>
                      <TableHead>Winner</TableHead><TableHead>Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recent.map(m => (
                      <TableRow key={m.id}>
                        <TableCell>{m.player1.name}</TableCell>
                        <TableCell>{m.player2.name}</TableCell>
                        <TableCell>{m.player1.roomAddedPoints}&nbsp;|&nbsp;{m.player2.roomAddedPoints}</TableCell>
                        <TableCell>{m.player1.scores} – {m.player2.scores}</TableCell>
                        <TableCell className="font-semibold">{m.winner}</TableCell>
                        <TableCell>{m.timestamp}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>
            ) : <p className="text-center py-8 text-muted-foreground">No recent matches.</p>}
          </CardContent>
        </Card>
      </div>
    </ProtectedRoutes.ProtectedRoute>
  );

  /* =============================================================== */
  /* ===== local sub-components (Members / RecordMatch blocks) ===== */
  /* =============================================================== */

  function MembersBlock() {
    return (
      <div>
        <Users className="text-primary" /> Members ({members.length})
        <ScrollArea className="h-[300px] border rounded-md p-3 bg-background">
          {[...members].sort((a, b) => (b.rating || 0) - (a.rating || 0)).map(m => {
            const played = (m.wins || 0) + (m.losses || 0);
            const winPct = played ? Math.round(((m.wins || 0) / played) * 100) : 0;
            return (
              <div key={m.userId} className="flex items-center justify-between p-2 hover:bg-muted/50 rounded-md">
                <div className="flex items-center gap-3">
                  <Avatar className="h-8 w-8"><AvatarImage src={m.photoURL || undefined} /><AvatarFallback>{m.name[0]}</AvatarFallback></Avatar>
                  <div>
                    <p className="font-medium"><a href={`/profile/${m.userId}`} className="hover:underline">{m.name}</a></p>
                    <p className="text-xs text-muted-foreground">MP:{played}&nbsp;·&nbsp;W%:{winPct}%</p>
                  </div>
                  {m.userId === room.creator && <Crown className="h-4 w-4 text-yellow-500" />}
                </div>
                <span className="text-sm font-semibold text-primary">{m.rating} pts</span>
              </div>
            );
          })}
        </ScrollArea>

        {/* invite dialog */}
        <Dialog>
          <DialogTrigger asChild>
            <Button className="mt-4 w-full" variant="outline" disabled={isInviting}>
              <MailPlus className="mr-2 h-4 w-4" /> Invite Player
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Invite to {room.name}</DialogTitle><DialogDescription>By email</DialogDescription></DialogHeader>
            <div className="space-y-2 py-2">
              <Label htmlFor="invEmail">Email</Label>
              <Input id="invEmail" value={inviteEmail} onChange={(e) => setInvite(e.target.value)} />
            </div>
            <DialogFooter>
              <DialogClose asChild><Button variant="ghost">Cancel</Button></DialogClose>
              <Button onClick={handleInvite} disabled={isInviting}>Send</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  function RecordBlock() {
    const roomMembers = members.map(m => ({ userId: m.userId, name: m.name, rating: m.rating }));
    return (
      <Card className="md:col-span-2 shadow-md">
        <CardHeader><CardTitle className="flex items-center gap-2"><Sword className="text-accent" /> Record Match(es)</CardTitle><CardDescription>Select two players & scores</CardDescription></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4 items-end">
            <PlayerSelect label="Player 1" value={player1Id} list={roomMembers.filter(x => x.userId !== player2Id)} onChange={setP1} />
            <PlayerSelect label="Player 2" value={player2Id} list={roomMembers.filter(x => x.userId !== player1Id)} onChange={setP2} />
          </div>

          {matches.map((m, i) => (
            <MatchRowInput key={i} index={i} data={m}
              onChange={(row) => setMatches(r => r.map((v, idx) => idx === i ? row : v))}
              onRemove={() => removeRow(i)} removable={i > 0} />
          ))}

          <Button variant="outline" className="flex items-center gap-2" onClick={addRow}><Plus /> Add another match</Button>
          <Button className="w-full mt-4" disabled={isRecording} onClick={saveMatches}>
            {isRecording ? "Recording…" : "Record & update ELO"}
          </Button>
        </CardContent>
      </Card>
    );
  }
}

/* ------------------------------------------------------------------ */
/* reusable mini-components ----------------------------------------- */
function PlayerSelect({ label, value, onChange, list }: { label: string; value: string; onChange: (v: string) => void; list: { userId: string; name: string; rating: number }[] }) {
  return (
    <div>
      <Label>{label}</Label>
      <select className="w-full border rounded p-2" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Select</option>
        {list.map(o => <option key={o.userId} value={o.userId}>{o.name} ({o.rating})</option>)}
      </select>
    </div>
  );
}

function MatchRowInput({ index, data, onChange, onRemove, removable }: { index: number; data: any; onChange: (d: any) => void; onRemove: () => void; removable: boolean }) {
  return (
    <div className="grid grid-cols-2 gap-4 mb-2 relative">
      {["1", "2"].map(n => (
        <div key={n}>
          <Label>{`P${n} Score`}</Label>
          <Input type="number" value={data[`score${n}`]} onChange={(e) => onChange({ ...data, [`score${n}`]: e.target.value })} />
          <Label className="mt-2">Side</Label>
          <select className="w-full border rounded p-2" value={data[`side${n}`]}
            onChange={(e) => onChange({ ...data, [`side${n}`]: e.target.value, [`side${n === "1" ? "2" : "1"}`]: e.target.value === "left" ? "right" : "left" })}>
            <option value="">–</option><option value="left">Left</option><option value="right">Right</option>
          </select>
        </div>
      ))}
      {removable && <Button variant="ghost" className="absolute top-1/2 right-0 -translate-y-1/2" onClick={onRemove}><Trash2 /></Button>}
    </div>
  );
}