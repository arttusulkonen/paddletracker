// functions/src/lib/eloMath.ts

export const calculateElo = (
  rating1: number,
  rating2: number,
  score1: number,
  score2: number
) => {
  const K = 32;
  const result = score1 > score2 ? 1 : 0;
  const expected = 1 / (1 + 10 ** ((rating2 - rating1) / 400));
  const newRating1 = Math.round(rating1 + K * (result - expected));
  return newRating1;
};
