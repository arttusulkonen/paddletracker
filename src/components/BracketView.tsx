
/* src/components/BracketView.tsx */
"use client"

import { useToast } from "@/hooks/use-toast"
import { db } from "@/lib/firebase"
import type { Tournament } from "@/lib/types" // Ensure Tournament type is correctly defined or imported
import { computeTable, seedKnockoutRounds } from "@/lib/utils/bracketUtils"
import {
  addDoc,
  arrayUnion,
  collection,
  doc,
  increment,
  runTransaction,
  Timestamp,
  updateDoc,
} from "firebase/firestore"
import React, { useEffect, useState } from "react" // Added React for Fragment

import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  ScrollArea,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Separator,
} from "@/components/ui"
import { getFinnishFormattedDate } from '@/lib/utils'
import Link from "next/link" // For linking to profiles
interface Props {
  tournament: Tournament
  onUpdate: () => void
}

/* ───────── очки за места ───────── */
const computeDelta = (place: number, totalParticipants: number) => {
  if (totalParticipants <= 4) { // Smaller tournaments, simpler point scale
    return place === 1 ? 50 : place === 2 ? 30 : place === 3 ? 20 : 10;
  }
  // Larger tournaments, original scale
  return place === 1 ? 100 : place === 2 ? 60 : place === 3 ? 40 : 10;
}


export default function BracketView({ tournament, onUpdate }: Props) {
  const [bracket, setBracket] = useState(tournament.bracket)
  useEffect(() => setBracket(tournament.bracket), [tournament.bracket])

  const persist = async (nextBracketState: any) => {
    // Determine if the tournament is now completed
    const justCompleted = bracket.stage !== "completed" && nextBracketState.stage === "completed";
    
    await updateDoc(doc(db, "tournament-rooms", tournament.id), { 
        bracket: nextBracketState, 
        champion: nextBracketState.champion ?? null,
        isFinished: nextBracketState.stage === "completed", // Update isFinished status
    });

    if (justCompleted) {
        await saveResults(nextBracketState);
    }
    onUpdate(); // Callback to inform parent component of update
}


  /* ───────── achievements / ELO / matches collection ───────── */
  const saveResults = async (finalBracket: any) => {
    const date = getFinnishFormattedDate()
    const ts = Timestamp.fromDate(new Date())
    const totalParticipants = tournament.participants?.length ?? 0;

    /** временно собираем данные, чтобы потом сформировать матчи */
    const stash: Record<string, {
      name: string
      oldElo: number
      newElo: number
      delta: number
      place: number
    }> = {}

    /* ―― обновляем пользователей ―― */
    await Promise.all(
      (finalBracket.finalStats ?? []).map(async (p: any) => { // Added null check for finalStats
        const delta = computeDelta(p.place, totalParticipants)
        const userRef = doc(db, "users", p.userId)

        await runTransaction(db, async tx => {
          const snap = await tx.get(userRef)
          const prevElo = snap.data()?.globalElo ?? 1000
          const newElo = prevElo + delta

          /* сохраняем для записи в matches */
          stash[p.userId] = {
            name: p.name,
            place: p.place,
            oldElo: prevElo,
            newElo,
            delta,
          }

          tx.update(userRef, {
            eloHistory: arrayUnion({ date, elo: newElo }),
            globalElo: newElo,
            maxRating: Math.max(snap.data()?.maxRating ?? 0, newElo), // Update maxRating
            achievements: arrayUnion({
              type: "tournamentFinish",
              dateFinished: date,
              tournamentId: tournament.id,
              tournamentName: tournament.name,
              place: p.place,
              wins: p.wins,
              losses: p.losses,
              pointsFor: p.pf,
              pointsAgainst: p.pa,
              totalAddedPoints: delta, // Store ELO change as totalAddedPoints for this achievement
            }),
          })
        })
      })
    )

    /* ―― достаём финальный и бронзовый матчи ―― */
    const finalRound = finalBracket.rounds.find((r: any) => r.type === "knockoutFinal")
    const bronzeRound = finalBracket.rounds.find((r: any) => r.type === "knockoutBronze")
    if (!finalRound?.matches?.length) return            // safety

    /** вспомогалка: формируем doc для коллекции matches */
    const pushMatch = async (match: any, stage: "final" | "bronze") => {
      const p1Id = match.player1.userId
      const p2Id = match.player2.userId
      const p1 = stash[p1Id]
      const p2 = stash[p2Id]

      if (!p1 || !p2) return

      await addDoc(collection(db, "matches"), {
        tournamentId: tournament.id,
        tournamentName: tournament.name,
        tournamentStage: stage,
        isTournament: true,

        timestamp: date,
        playedAt: ts,

        roomId: tournament.id, // Use tournament ID as room ID for consistency if needed

        winner: match.winner === p1Id ? p1.name : p2.name,
        players: [p1Id, p2Id],

        player1Id: p1Id,
        player2Id: p2Id,

        player1: {
          name: p1.name,
          side: "left", // Default side, can be made dynamic if needed
          scores: match.scorePlayer1,
          oldRating: p1.oldElo,
          newRating: p1.newElo,
          addedPoints: p1.delta, // This is the ELO change from tournament placement
          roomOldRating: p1.oldElo, // For tournaments, global ELO is used
          roomNewRating: p1.newElo,
          roomAddedPoints: p1.delta,
        },
        player2: {
          name: p2.name,
          side: "right",
          scores: match.scorePlayer2,
          oldRating: p2.oldElo,
          newRating: p2.newElo,
          addedPoints: p2.delta,
          roomOldRating: p2.oldElo,
          roomNewRating: p2.newElo,
          roomAddedPoints: p2.delta,
        },
      })
    }

    await pushMatch(finalRound.matches[0], "final")
    if (bronzeRound?.matches?.length) await pushMatch(bronzeRound.matches[0], "bronze")
  }

  if (!bracket)
    return <p className="text-center text-muted-foreground py-8">Bracket not available. This tournament might still be setting up.</p>

  /* ───────── разбиваем раунды ───────── */
  const rrRounds = bracket.rounds.filter((r: any) => r.type === "roundRobin")

  const uniqMap = new Map<string, any>()
  bracket.rounds
    .filter((r: any) => r.type.startsWith("knockout"))
    .forEach((r: any) => uniqMap.set(`${r.type}-${r.roundIndex}`, r))

  /* ② сортируем для корректного визуального порядка */
  const koOrder = { knockoutQuarters: 0, knockoutSemis: 1, knockoutBronze: 2, knockoutFinal: 3 } as const
  const koRounds = Array.from(uniqMap.values()).sort(
    (a: any, b: any) =>
      koOrder[a.type as keyof typeof koOrder] - koOrder[b.type as keyof typeof koOrder] ||
      a.roundIndex - b.roundIndex
  )

  return (
    <div className="space-y-6 sm:space-y-8 md:space-y-10">
      {rrRounds.map(r => (
        <RoundEditor
          key={`rr-${r.roundIndex}`}
          round={r}
          bracket={bracket}
          persist={persist}
          roundType="rr"
          isTournamentAdmin={tournament.creator === useAuth().user?.uid}
        />
      ))}

      {koRounds.map(r => (
        <RoundEditor
          key={`${r.type}-${r.roundIndex}`}
          round={r}
          bracket={bracket}
          persist={persist}
          roundType="ko"
          isTournamentAdmin={tournament.creator === useAuth().user?.uid}
        />
      ))}

      {bracket.stage === "completed" && bracket.finalStats && <FinalTable stats={bracket.finalStats} />}
    </div>
  )
}

/* ───────── универсальный редактор раунда ───────── */
function RoundEditor({ round, bracket, persist, roundType, isTournamentAdmin }: any) {
  const { toast } = useToast()
  const [matches, setMatches] = useState(round.matches ?? []) // Ensure matches is an array
  const [savingMatchId, setSavingMatchId] = useState<string | null>(null);


  useEffect(() => setMatches(round.matches ?? []), [round.matches])

  const okRR = (m: any) =>
    typeof m.scorePlayer1 === "number" &&
    typeof m.scorePlayer2 === "number" &&
    m.scorePlayer1 >= 0 && m.scorePlayer2 >= 0 && // Scores must be non-negative
    Math.abs(m.scorePlayer1 - m.scorePlayer2) >= 2 // Win by 2 for RR (typical rule)

  const okKO = (m: any) =>
    typeof m.scorePlayer1 === "number" &&
    typeof m.scorePlayer2 === "number" &&
    m.scorePlayer1 >= 0 && m.scorePlayer2 >= 0 && // Scores must be non-negative
    m.scorePlayer1 !== m.scorePlayer2 // No draws in KO

  const validator = roundType === "rr" ? okRR : okKO

  const save = async (id: string) => {
    setSavingMatchId(id);
    const idx = matches.findIndex((m: any) => m.matchId === id)
    const m = matches[idx]
    if (!validator(m)) {
      toast({ title: "Invalid score", description: roundType === "rr" ? "Round-robin matches must be won by at least 2 points." : "Knockout matches cannot end in a draw. Scores must be non-negative.", variant: "destructive" })
      setSavingMatchId(null);
      return
    }

    const winner = m.scorePlayer1 > m.scorePlayer2 ? m.player1.userId : m.player2.userId
    const upd = { ...m, matchStatus: "finished", winner }
    const nextMatchesState = [...matches]; nextMatchesState[idx] = upd

    const updRounds = bracket.rounds.map((r: any) =>
      r.roundIndex === round.roundIndex ? { ...round, matches: nextMatchesState } : r
    )
    try {
      await persist({ ...bracket, rounds: updRounds });
      toast({title: "Match saved!"});
    } catch (error) {
      console.error("Error saving match:", error);
      toast({title: "Error", description: "Could not save match.", variant: "destructive"});
    } finally {
      setSavingMatchId(null);
    }
  }

  const finish = async () => {
    setSavingMatchId('__FINISH_ROUND__'); // Special ID for finishing round
    const updRounds = bracket.rounds.map((r: any) =>
      r.roundIndex === round.roundIndex ? { ...round, status: "finished" } : r
    )
    const nextBracketState = { ...bracket, rounds: updRounds }
    seedKnockoutRounds(nextBracketState) // This seeds based on current state
    try {
      await persist(nextBracketState); // Persist the fully updated state
      toast({title: "Round Finished"});
    } catch (error) {
      console.error("Error finishing round:", error);
      toast({title: "Error", description: "Could not finish round.", variant: "destructive"});
    } finally {
      setSavingMatchId(null);
    }
  }

  const allMatchesInRoundFinished = matches.every((m: any) => m.matchStatus === "finished");

  return (
    <Card className="shadow-md">
      <CardHeader className="p-4 sm:p-6">
        <CardTitle className="text-base sm:text-lg md:text-xl">{round.label} <span className="text-xs sm:text-sm text-muted-foreground">({round.status})</span></CardTitle>
      </CardHeader>
      <CardContent className="p-2 sm:p-4 md:p-6">
        <ScrollArea className="max-h-[400px] sm:max-h-none w-full">
          <Table className="min-w-[550px] sm:min-w-full"> {/* Min width for scroll on small screens */}
            <React.Fragment>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs sm:text-sm">P1</TableHead>
                  <TableHead className="text-center text-xs sm:text-sm w-16 sm:w-20">Score</TableHead>
                  <TableHead className="text-center text-xs sm:text-sm w-16 sm:w-20">Score</TableHead>
                  <TableHead className="text-right text-xs sm:text-sm">P2</TableHead>
                  <TableHead className="text-center text-xs sm:text-sm hidden sm:table-cell">Winner</TableHead>
                  {isTournamentAdmin && <TableHead className="w-20 sm:w-24" />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {matches.map((m: any) => {
                  const fin = m.matchStatus === "finished"
                  const p1Name = m.player1?.name || "TBD";
                  const p2Name = m.player2?.name || "TBD";
                  const winnerName = fin ? (m.winner === m.player1?.userId ? p1Name : p2Name) : "—";
                  return (
                    <TableRow key={m.matchId} className={fin ? "opacity-70" : "bg-accent/5"}>
                      <TableCell className="text-xs sm:text-sm font-medium">{p1Name}{m.player1?.place ? ` (${m.player1.place})` : ""}</TableCell>
                      <TableCell className="text-center">
                        <Input
                          type="number"
                          min="0"
                          disabled={fin || !isTournamentAdmin || savingMatchId === m.matchId}
                          value={m.scorePlayer1 ?? ""}
                          onChange={e => setMatches((ms: any[]) => ms.map(x =>
                            x.matchId === m.matchId
                              ? { ...x, scorePlayer1: e.target.value === '' ? null : Number(e.target.value) }
                              : x))}
                          className="w-12 sm:w-16 mx-auto text-center h-8 text-xs sm:text-sm"
                        />
                      </TableCell>
                      <TableCell className="text-center">
                        <Input
                          type="number"
                          min="0"
                          disabled={fin || !isTournamentAdmin || savingMatchId === m.matchId}
                          value={m.scorePlayer2 ?? ""}
                          onChange={e => setMatches((ms: any[]) => ms.map(x =>
                            x.matchId === m.matchId
                              ? { ...x, scorePlayer2: e.target.value === '' ? null : Number(e.target.value) }
                              : x))}
                          className="w-12 sm:w-16 mx-auto text-center h-8 text-xs sm:text-sm"
                        />
                      </TableCell>
                      <TableCell className="text-right text-xs sm:text-sm font-medium">
                        {p2Name}{m.player2?.place ? ` (${m.player2.place})` : ""}
                      </TableCell>
                      <TableCell className="text-center font-semibold text-xs sm:text-sm hidden sm:table-cell">
                        {winnerName}
                      </TableCell>
                      {isTournamentAdmin && (
                        <TableCell className="text-center">
                          {!fin && (
                            <Button size="xs" sm={{size: "sm"}} onClick={() => save(m.matchId)} disabled={savingMatchId === m.matchId || !m.player1 || !m.player2}>
                              {savingMatchId === m.matchId ? 'Saving...' : 'Save'}
                            </Button>
                          )}
                        </TableCell>
                      )}
                    </TableRow>
                  )
                })}
              </TableBody>
            </React.Fragment>
          </Table>
        </ScrollArea>
        <p className="text-xs text-muted-foreground mt-2 sm:hidden">Winner: {matches.map((m:any) => m.matchStatus === 'finished' ? (m.winner === m.player1?.userId ? m.player1?.name : m.player2?.name) : 'TBD').join(', ')}</p>


        {isTournamentAdmin && round.status === "inProgress" && allMatchesInRoundFinished && (
          <div className="flex justify-end mt-4">
            <Button
              onClick={finish}
              disabled={savingMatchId === '__FINISH_ROUND__'}
              size="sm"
            >
              {savingMatchId === '__FINISH_ROUND__' ? 'Finishing...' : 'Finish Round'}
            </Button>
          </div>
        )}

        {roundType === "rr" && round.status === "finished" &&
          <Standings matches={matches} participants={round.participants} />}
      </CardContent>
    </Card>
  )
}

/* ───────── вспомогательные таблицы ───────── */
function Standings({ matches, participants }: { matches: any[], participants: any[] }) {
  const rows = computeTable(matches, participants); // Pass participants to computeTable
  return (
    <div className="mt-4 sm:mt-6">
      <h3 className="text-sm sm:text-base font-semibold mb-2">Round Robin Standings</h3>
      <ScrollArea className="max-h-[300px] sm:max-h-none w-full">
        <Table className="min-w-[400px] sm:min-w-full">
          <React.Fragment>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs sm:text-sm w-8">#</TableHead>
                <TableHead className="text-xs sm:text-sm">Player</TableHead>
                <TableHead className="text-xs sm:text-sm text-center">W</TableHead>
                <TableHead className="text-xs sm:text-sm text-center">L</TableHead>
                <TableHead className="text-xs sm:text-sm text-center">PF</TableHead>
                <TableHead className="text-xs sm:text-sm text-center">PA</TableHead>
                <TableHead className="text-xs sm:text-sm text-center">PD</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(p => (
                <TableRow key={p.userId} className="text-xs sm:text-sm">
                  <TableCell>{p.place}</TableCell>
                  <TableCell className="font-medium">{p.name}</TableCell>
                  <TableCell className="text-center">{p.wins}</TableCell>
                  <TableCell className="text-center">{p.losses}</TableCell>
                  <TableCell className="text-center">{p.pf}</TableCell>
                  <TableCell className="text-center">{p.pa}</TableCell>
                  <TableCell className="text-center">{p.pf - p.pa}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </React.Fragment>
        </Table>
      </ScrollArea>
    </div>
  )
}

function FinalTable({ stats }: { stats?: any[] }) {
  if (!stats?.length) return null
  // Sort stats by place for final display
  const sortedStats = [...stats].sort((a,b) => a.place - b.place);

  return (
    <Card className="shadow-lg">
      <CardHeader className="p-4 sm:p-6"><CardTitle className="text-base sm:text-lg md:text-xl">Final Standings</CardTitle></CardHeader>
      <CardContent className="p-2 sm:p-4 md:p-6">
        <ScrollArea className="max-h-[400px] sm:max-h-none w-full">
          <Table className="min-w-[500px] sm:min-w-full">
            <React.Fragment>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs sm:text-sm w-8">Place</TableHead>
                  <TableHead className="text-xs sm:text-sm">Player</TableHead>
                  <TableHead className="text-xs sm:text-sm text-center">W</TableHead>
                  <TableHead className="text-xs sm:text-sm text-center">L</TableHead>
                  <TableHead className="text-xs sm:text-sm text-center">PF</TableHead>
                  <TableHead className="text-xs sm:text-sm text-center">PA</TableHead>
                   <TableHead className="text-xs sm:text-sm text-center">ELO Δ</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedStats.map(p => (
                  <TableRow key={p.userId} className={`text-xs sm:text-sm ${p.place === 1 ? 'bg-yellow-100 dark:bg-yellow-800/30' : p.place === 2 ? 'bg-gray-100 dark:bg-gray-700/30' : p.place === 3 ? 'bg-orange-100 dark:bg-orange-800/30': ''}`}>
                    <TableCell className="font-bold">{p.place}</TableCell>
                    <TableCell>
                      <Link href={`/profile/${p.userId}`} className="text-primary hover:underline font-medium">
                        {p.name}
                      </Link>
                    </TableCell>
                    <TableCell className="text-center">{p.wins}</TableCell>
                    <TableCell className="text-center">{p.losses}</TableCell>
                    <TableCell className="text-center">{p.pf}</TableCell>
                    <TableCell className="text-center">{p.pa}</TableCell>
                    <TableCell className={`text-center font-semibold ${p.delta >= 0 ? 'text-accent' : 'text-destructive'}`}>{p.delta > 0 ? `+${p.delta}`: p.delta}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </React.Fragment>
          </Table>
        </ScrollArea>
      </CardContent>
    </Card>
  )
}
