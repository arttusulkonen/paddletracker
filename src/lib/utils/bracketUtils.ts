// src/lib/utils/bracketUtils.ts
import type { Match as BracketMatch, Round as BracketRound, TournamentBracket } from '@/lib/types';

/**
 * Compute round-robin standings table from matches
 */
export function computeTable(
  matches: BracketMatch[]
): Array<{ userId: string; wins: number; losses: number; pf: number; pa: number }> {
  const stats: Record<
    string,
    { wins: number; losses: number; pf: number; pa: number }
  > = {}
  matches.forEach((m) => {
    const p1 = m.player1.userId
    const p2 = m.player2.userId
    if (!stats[p1]) stats[p1] = { wins: 0, losses: 0, pf: 0, pa: 0 }
    if (!stats[p2]) stats[p2] = { wins: 0, losses: 0, pf: 0, pa: 0 }

    stats[p1].pf += m.scorePlayer1
    stats[p1].pa += m.scorePlayer2
    stats[p2].pf += m.scorePlayer2
    stats[p2].pa += m.scorePlayer1

    if (m.scorePlayer1 > m.scorePlayer2) {
      stats[p1].wins++
      stats[p2].losses++
    } else {
      stats[p2].wins++
      stats[p1].losses++
    }
  })

  return Object.entries(stats).map(([userId, s]) => ({ userId, ...s }))
}

/**
 * Seed next knockout round based on finished matches
 */
export function seedKnockoutRounds(
  bracket: TournamentBracket,
  finishedMatches: BracketMatch[]
): void {
  // find winners
  const winners = finishedMatches
    .filter((m) => m.matchStatus === 'finished')
    .map((m) => m.winner!) // winner guaranteed

  const nextIndex = (bracket.currentRound ?? 0) + 1
  const nextRound: BracketRound = {
    roundIndex: nextIndex,
    label: `Round ${nextIndex + 1}`,
    type: 'knockout',
    status: 'notStarted',
    matches: winners.map((uid, i) => ({
      matchId: `${nextIndex}-${i}`,
      player1: { userId: uid, name: '' },
      player2: { userId: '', name: '' },
      scorePlayer1: 0,
      scorePlayer2: 0,
      matchStatus: 'notStarted',
    })),
  }

  bracket.rounds.push(nextRound)
  bracket.currentRound = nextIndex
}
