// functions/src/lib/eloMath.ts

export type RoomMode = 'office' | 'professional' | 'arcade';

// Helper to determine Dynamic K-Factor
// If player has < 10 matches in this room, use higher volatility (Placement matches)
export const getDynamicK = (baseK: number, matchesPlayed: number, mode: RoomMode) => {
  if (mode !== 'professional') return baseK; 
  
  // Placement games: First 10 games have 2x volatility (e.g. K=64 if base is 32)
  if (matchesPlayed < 10) return baseK * 2; 
  
  // Standard games
  return baseK;
};

export const calculateDelta = (
  rating1: number,
  rating2: number,
  score1: number,
  score2: number,
  isGlobal: boolean,
  mode: RoomMode = 'office',
  kFactor: number = 32
) => {
  // В аркаде рейтинг не меняется
  if (!isGlobal && mode === 'arcade') return 0;

  const K = isGlobal ? 32 : kFactor;
  const result = score1 > score2 ? 1 : 0;
  const expected = 1 / (1 + 10 ** ((rating2 - rating1) / 400));

  let delta = Math.round(K * (result - expected));

  if (!isGlobal) {
    if (mode === 'office' && delta < 0) {
      const inflationFactor = 0.8;
      delta = Math.round(delta * inflationFactor);
    }
  }

  return delta;
};