'use client'

import type { Tournament } from '@/lib/types'
import dynamic from 'next/dynamic'

const SingleEliminationBracket = dynamic(
  () => import('@g-loot/react-tournament-brackets').then(m => m.SingleEliminationBracket),
  { ssr: false }
)

type DTO = {
  id: string
  name: string
  nextMatchId: string | null
  tournamentRoundText: string
  startTime: string | null
  state: 'DONE'
  participants: {
    id: string
    name: string
    isWinner: boolean
    resultText: string | null
    status: null
  }[]
}

interface Props { bracket: Tournament['bracket'] }

const label = (t: string) =>
  t === 'knockoutQuarters' ? 'Quarter-final' :
  t === 'knockoutSemis'   ? 'Semi-final'    :
  t === 'knockoutFinal'   ? 'Final'         :
  t === 'knockoutBronze'  ? '3rd-place'     : t

const part = (p: any, w: string | undefined, sc: number | null) => ({
  id: p?.userId ?? crypto.randomUUID(),
  name: p ? `${p.name}${p.place ? ` (${p.place})` : ''}` : 'TBD',
  isWinner: w ? p?.userId === w : false,
  resultText: sc != null ? String(sc) : null,
  status: null
})

function map(br: Props['bracket']): DTO[] {
  const res: DTO[] = []
  br.rounds.filter(r => r.type.startsWith('knockout')).forEach(r => {
    r.matches.forEach((m: any, i: number) => {
      const nx = br.rounds.find(x => x.roundIndex === r.roundIndex + 1)
      res.push({
        id: m.matchId,
        name: m.name || `${label(r.type)} ${i + 1}`,
        nextMatchId: nx?.matches[Math.floor(i / 2)]?.matchId || null,
        tournamentRoundText: label(r.type),
        startTime: null,
        state: 'DONE',
        participants: [
          part(m.player1, m.winner, m.scorePlayer1),
          part(m.player2, m.winner, m.scorePlayer2)
        ]
      })
    })
  })
  return res
}

const Card = ({ match }: { match: any }) => (
  <div className="min-w-[180px] rounded border bg-card p-2 text-xs shadow">
    <div className="flex justify-between">
      <span>{match.participants[0]?.name}</span>
      <span className="font-semibold">{match.participants[0]?.resultText ?? ''}</span>
    </div>
    <div className="flex justify-between">
      <span>{match.participants[1]?.name}</span>
      <span className="font-semibold">{match.participants[1]?.resultText ?? ''}</span>
    </div>
  </div>
)

export default function BracketTree({ bracket }: Props) {
  const matches = map(bracket)
  if (!matches.length) return <p className="text-muted-foreground">Knock-out bracket will appear once seeded.</p>
  return (
    <div className="relative overflow-x-auto">
      <SingleEliminationBracket matches={matches} matchComponent={Card} />
    </div>
  )
}