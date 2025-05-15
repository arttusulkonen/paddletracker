import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { db } from '@/lib/firebase'
import type { Tournament } from '@/lib/types'
import { computeTable, seedKnockoutRounds } from '@/lib/utils/bracketUtils'
import { doc, updateDoc } from 'firebase/firestore'
import { useEffect, useState } from 'react'

interface BracketViewProps {
  tournament: Tournament
  onUpdate: () => void
}

export default function BracketView({ tournament, onUpdate }: BracketViewProps) {
  const [bracket, setBracket] = useState(tournament.bracket)

  useEffect(() => setBracket(tournament.bracket), [tournament.bracket])

  if (!bracket) return <p className="text-center text-muted">Bracket not available</p>

  const current = bracket.currentRound || 0
  const rrRounds = bracket.rounds.filter(r => r.type === 'roundRobin')
  const rrCount = rrRounds.length
  const lastRR = rrRounds.at(-1)
  const rrSeeds: Record<string, number> = {}
  if (lastRR) {
    computeTable(lastRR.matches).forEach((p, i) => {
      if (p.userId) rrSeeds[p.userId] = i + 1
    })
  }

  const persist = async (newBracket: typeof bracket) => {
    await updateDoc(doc(db, 'tournaments', tournament.id), { bracket: newBracket })
    onUpdate()
  }

  return (
    <div className="space-y-8">
      {bracket.rounds.map(round => (
        <Round
          key={round.roundIndex}
          round={round}
          isCurrent={round.roundIndex === current}
          bracket={bracket}
          rrCount={rrCount}
          rrSeeds={rrSeeds}
          onSave={persist}
        />
      ))}
      {bracket.stage === 'completed' && <FinalTable finalStats={bracket.finalStats} />}
    </div>
  )
}

function Round({ round, isCurrent, bracket, rrCount, rrSeeds, onSave }: any) {
  const [matches, setMatches] = useState(round.matches)

  useEffect(() => setMatches(round.matches), [round.matches])

  const updateMatch = (id: string, field: string, value: number) => {
    setMatches(ms => ms.map(m => m.matchId === id ? { ...m, [field]: value } : m))
  }

  const onBlurMatch = () => {
    const newRounds = bracket.rounds.map((r: any) =>
      r.roundIndex === round.roundIndex ? { ...round, matches } : r
    )
    onSave({ ...bracket, rounds: newRounds })
  }

  const canFinish = matches.every(m =>
    typeof m.scorePlayer1 === 'number' && typeof m.scorePlayer2 === 'number'
  )

  const finishRound = () => {
    const finished = matches.map(m => {
      const winner = m.scorePlayer1 > m.scorePlayer2 ? m.player1?.userId : m.player2?.userId
      return { ...m, matchStatus: 'finished', winner }
    })
    let newBracket: any = {
      ...bracket,
      rounds: bracket.rounds.map((r: any) =>
        r.roundIndex === round.roundIndex
          ? { ...r, status: 'finished', matches: finished }
          : r
      )
    }
    if (['roundRobin', 'knockoutQuarters', 'knockoutSemis'].includes(round.type)) {
      seedKnockoutRounds(newBracket, finished)
    }
    onSave(newBracket)
  }

  const nameOrDash = (player: any) => player?.name || '—'

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {round.label} — Round {round.roundIndex + 1} ({round.status})
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ScrollArea className="w-full">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-left">Player 1</TableHead>
                <TableHead className="text-center">Score</TableHead>
                <TableHead className="text-center">Score</TableHead>
                <TableHead className="text-right">Player 2</TableHead>
                <TableHead className="text-center">Winner</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {matches.map(m => (
                <TableRow key={m.matchId} className={isCurrent && m.matchStatus !== 'finished' ? 'bg-accent/10' : ''}>
                  <TableCell>
                    {nameOrDash(m.player1)}{round.roundIndex >= rrCount && rrSeeds[m.player1?.userId] ?
                      <span className="ml-1 text-sm text-gray-500">#{rrSeeds[m.player1.userId]}</span> : null}
                  </TableCell>
                  <TableCell className="text-center">
                    <Input
                      type="number"
                      value={m.scorePlayer1}
                      onChange={e => updateMatch(m.matchId, 'scorePlayer1', Number(e.target.value))}
                      onBlur={onBlurMatch}
                      className="w-16 mx-auto"
                    />
                  </TableCell>
                  <TableCell className="text-center">
                    <Input
                      type="number"
                      value={m.scorePlayer2}
                      onChange={e => updateMatch(m.matchId, 'scorePlayer2', Number(e.target.value))}
                      onBlur={onBlurMatch}
                      className="w-16 mx-auto"
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    {nameOrDash(m.player2)}{round.roundIndex >= rrCount && rrSeeds[m.player2?.userId] ?
                      <span className="ml-1 text-sm text-gray-500">#{rrSeeds[m.player2.userId]}</span> : null}
                  </TableCell>
                  <TableCell className="text-center font-semibold">
                    {m.winner ? (m.winner === m.player1?.userId ? m.player1.name : m.player2.name) : '—'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </ScrollArea>
        {isCurrent && round.status !== 'finished' && (
          <div className="flex justify-end mt-4">
            <Button onClick={finishRound} disabled={!canFinish}>
              Finish Round
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function FinalTable({ finalStats }: { finalStats?: any[] }) {
  if (!finalStats) return null
  return (
    <Card>
      <CardHeader>
        <CardTitle>Final Standings</CardTitle>
      </CardHeader>
      <CardContent>
        <ScrollArea>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Place</TableHead>
                <TableHead>Player</TableHead>
                <TableHead>W</TableHead>
                <TableHead>L</TableHead>
                <TableHead>PF</TableHead>
                <TableHead>PA</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {finalStats.map(p => (
                <TableRow key={p.userId} className="hover:bg-gray-50">
                  <TableCell>{p.place}</TableCell>
                  <TableCell>{p.name || '—'}</TableCell>
                  <TableCell>{p.wins}</TableCell>
                  <TableCell>{p.losses}</TableCell>
                  <TableCell>{p.pf}</TableCell>
                  <TableCell>{p.pa}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </ScrollArea>
      </CardContent>
    </Card>
  )
}
