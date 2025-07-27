// src/lib/elo.ts

import { TennisSetData } from '@/components/record-blocks/TennisRecordBlock';
import {
  addDoc,
  arrayUnion,
  collection,
  doc,
  getDoc,
  increment,
  updateDoc,
} from 'firebase/firestore';
import { db } from './firebase';
import type { Match, Room, Sport, SportConfig, UserProfile } from './types';
import { getFinnishFormattedDate } from './utils';

const calculateElo = (
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

type MatchInputData = { score1: string; score2: string; side1: string; side2: string } | TennisSetData;

export async function processAndSaveMatches(
  roomId: string,
  room: Room,
  player1Id: string,
  player2Id: string,
  matchesInput: MatchInputData[],
  currentMembers: Room['members'],
  sport: Sport,
  config: SportConfig
): Promise<boolean> {
  try {
    const [p1Snap, p2Snap] = await Promise.all([
      getDoc(doc(db, 'users', player1Id)),
      getDoc(doc(db, 'users', player2Id)),
    ]);

    if (!p1Snap.exists() || !p2Snap.exists()) return false;

    const p1Profile = p1Snap.data() as UserProfile;
    const p2Profile = p2Snap.data() as UserProfile;

    let currentG1 = p1Profile.sports?.[sport]?.globalElo ?? 1000;
    let currentG2 = p2Profile.sports?.[sport]?.globalElo ?? 1000;

    let draft = JSON.parse(JSON.stringify(currentMembers)) as Room['members'];
    const startDate = new Date();

    let totalWinsP1 = 0;
    let totalWinsP2 = 0;

    let tennisStatsP1 = { aces: 0, doubleFaults: 0, winners: 0 };
    let tennisStatsP2 = { aces: 0, doubleFaults: 0, winners: 0 };

    for (let i = 0; i < matchesInput.length; i++) {
      const row = matchesInput[i];
      const score1 = +row.score1;
      const score2 = +row.score2;

      const oldG1 = currentG1;
      const oldG2 = currentG2;

      const newG1 = calculateElo(oldG1, oldG2, score1, score2);
      const newG2 = calculateElo(oldG2, oldG1, score2, score1);

      const dG1 = newG1 - oldG1;
      const dG2 = newG2 - oldG2;

      currentG1 = newG1;
      currentG2 = newG2;

      score1 > score2 ? totalWinsP1++ : totalWinsP2++;

      const p1Member = draft.find((m) => m.userId === player1Id)!;
      const p2Member = draft.find((m) => m.userId === player2Id)!;

      const p1OldRoomRating = p1Member.rating;
      const p2OldRoomRating = p2Member.rating;

      p1Member.rating += dG1;
      p2Member.rating += dG2;

      const ts = new Date(startDate.getTime() + i * 1000);
      const createdAt = getFinnishFormattedDate(ts);
      const tsIso = ts.toISOString();

      // ✅ **ИСПРАВЛЕНИЕ**: Создаем правильные объекты для каждого игрока
      let player1Data: any = {};
      let player2Data: any = {};

      if (sport === 'tennis') {
        const setData = row as TennisSetData;
        player1Data = {
          aces: Number(setData.aces1) || 0,
          doubleFaults: Number(setData.doubleFaults1) || 0,
          winners: Number(setData.winners1) || 0,
        };
        player2Data = {
          aces: Number(setData.aces2) || 0,
          doubleFaults: Number(setData.doubleFaults2) || 0,
          winners: Number(setData.winners2) || 0,
        };
        // Суммируем для финального инкремента в профиле
        tennisStatsP1.aces += player1Data.aces;
        tennisStatsP1.doubleFaults += player1Data.doubleFaults;
        tennisStatsP1.winners += player1Data.winners;
        tennisStatsP2.aces += player2Data.aces;
        tennisStatsP2.doubleFaults += player2Data.doubleFaults;
        tennisStatsP2.winners += player2Data.winners;
      } else {
        const pingPongData = row as { side1: string, side2: string };
        player1Data.side = pingPongData.side1;
        player2Data.side = pingPongData.side2;
      }

      const matchDoc: Omit<Match, 'id'> = {
        roomId, createdAt, timestamp: createdAt, tsIso,
        isRanked: room.isRanked !== false,
        player1Id, player2Id, players: [player1Id, player2Id],
        player1: {
          name: p1Member.name, scores: score1, oldRating: oldG1, newRating: newG1,
          addedPoints: dG1, roomOldRating: p1OldRoomRating, roomNewRating: p1Member.rating,
          roomAddedPoints: dG1, ...player1Data,
        },
        player2: {
          name: p2Member.name, scores: score2, oldRating: oldG2, newRating: newG2,
          addedPoints: dG2, roomOldRating: p2OldRoomRating, roomNewRating: p2Member.rating,
          roomAddedPoints: dG2, ...player2Data,
        },
        winner: score1 > score2 ? p1Member.name : p2Member.name,
      };

      await addDoc(collection(db, config.collections.matches), matchDoc);

      if (matchesInput.length > 1 && i < matchesInput.length - 1) {
        await new Promise(res => setTimeout(res, 1000));
      }
    }

    await updateDoc(doc(db, config.collections.rooms, roomId), { members: draft });

    await Promise.all([
      updateDoc(doc(db, 'users', player1Id), {
        [`sports.${sport}.globalElo`]: currentG1,
        [`sports.${sport}.eloHistory`]: arrayUnion({ ts: new Date().toISOString(), elo: currentG1 }),
        [`sports.${sport}.wins`]: increment(totalWinsP1),
        [`sports.${sport}.losses`]: increment(totalWinsP2),
        ...(sport === 'tennis' && {
          [`sports.${sport}.aces`]: increment(tennisStatsP1.aces),
          [`sports.${sport}.doubleFaults`]: increment(tennisStatsP1.doubleFaults),
          [`sports.${sport}.winners`]: increment(tennisStatsP1.winners),
        })
      }),
      updateDoc(doc(db, 'users', player2Id), {
        [`sports.${sport}.globalElo`]: currentG2,
        [`sports.${sport}.eloHistory`]: arrayUnion({ ts: new Date().toISOString(), elo: currentG2 }),
        [`sports.${sport}.wins`]: increment(totalWinsP2),
        [`sports.${sport}.losses`]: increment(totalWinsP1),
        ...(sport === 'tennis' && {
          [`sports.${sport}.aces`]: increment(tennisStatsP2.aces),
          [`sports.${sport}.doubleFaults`]: increment(tennisStatsP2.doubleFaults),
          [`sports.${sport}.winners`]: increment(tennisStatsP2.winners),
        })
      }),
    ]);

    return true;
  } catch (error) {
    console.error('Failed to process and save matches:', error);
    return false;
  }
}