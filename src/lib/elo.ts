const K_FACTOR_DEFAULT = 32;

/**
 * Calculates the expected score for player A against player B.
 * @param ratingA Player A's rating
 * @param ratingB Player B's rating
 * @returns Expected score for player A (between 0 and 1)
 */
function getExpectedScore(ratingA: number, ratingB: number): number {
  return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
}

/**
 * Calculates the new ELO ratings for two players after a match.
 * @param player1Rating Current ELO rating of player 1
 * @param player2Rating Current ELO rating of player 2
 * @param player1Result Score for player 1 (1 for win, 0.5 for draw, 0 for loss). Ping pong usually no draws.
 * @param kFactor The K-factor to use for rating calculation. Defaults to 32.
 * @returns Object with new ratings { newPlayer1Rating: number, newPlayer2Rating: number, eloChangeP1: number, eloChangeP2: number }
 */
export function calculateEloRatings(
  player1Rating: number,
  player2Rating: number,
  player1Result: 1 | 0, // 1 if P1 wins, 0 if P1 loses (no draws in typical ping pong)
  kFactor: number = K_FACTOR_DEFAULT
): { newPlayer1Rating: number; newPlayer2Rating: number; eloChangeP1: number; eloChangeP2: number } {
  
  if (player1Result !== 1 && player1Result !== 0) {
    throw new Error("player1Result must be 1 (win) or 0 (loss) for ping pong.");
  }
  const player2Result = 1 - player1Result;

  const expectedScoreP1 = getExpectedScore(player1Rating, player2Rating);
  const expectedScoreP2 = getExpectedScore(player2Rating, player1Rating);

  const eloChangeP1 = Math.round(kFactor * (player1Result - expectedScoreP1));
  const eloChangeP2 = Math.round(kFactor * (player2Result - expectedScoreP2));
  
  const newPlayer1Rating = player1Rating + eloChangeP1;
  const newPlayer2Rating = player2Rating + eloChangeP2;

  return { newPlayer1Rating, newPlayer2Rating, eloChangeP1, eloChangeP2 };
}
