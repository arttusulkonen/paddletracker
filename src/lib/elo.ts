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
import type {
  Match,
  Room,
  RoomMode,
  Sport,
  SportConfig,
  UserProfile,
} from './types';
import { getFinnishFormattedDate } from './utils';

const calculateDelta = (
  rating1: number,
  rating2: number,
  score1: number,
  score2: number,
  isGlobal: boolean,
  mode: RoomMode = 'office',
  kFactor: number = 32
) => {
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

type NonTennisRow = {
  score1: string;
  score2: string;
  side1: string;
  side2: string;
};
type MatchInputData = NonTennisRow | TennisSetData;

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

    const mode = room.mode || 'office';
    const kFactor = typeof room.kFactor === 'number' ? room.kFactor : 32;

    for (let i = 0; i < matchesInput.length; i++) {
      const row = matchesInput[i] as any;
      const score1 = +row.score1;
      const score2 = +row.score2;

      const p1Member = draft.find((m) => m.userId === player1Id)!;
      const p2Member = draft.find((m) => m.userId === player2Id)!;

      const oldG1 = currentG1;
      const oldG2 = currentG2;

      const p1OldRoomRating = p1Member.rating ?? 1000;
      const p2OldRoomRating = p2Member.rating ?? 1000;

      let newG1 = oldG1;
      let newG2 = oldG2;
      let d1_Global = 0;
      let d2_Global = 0;

      let p1NewRoomRating = p1OldRoomRating;
      let p2NewRoomRating = p2OldRoomRating;
      let d1_Room = 0;
      let d2_Room = 0;

      if (room.isRanked !== false) {
        d1_Global = calculateDelta(
          oldG1,
          oldG2,
          score1,
          score2,
          true,
          'professional',
          32
        );
        d2_Global = calculateDelta(
          oldG2,
          oldG1,
          score2,
          score1,
          true,
          'professional',
          32
        );

        newG1 = oldG1 + d1_Global;
        newG2 = oldG2 + d2_Global;

        currentG1 = newG1;
        currentG2 = newG2;
        p1Member.globalElo = newG1;
        p2Member.globalElo = newG2;
      }

      d1_Room = calculateDelta(
        p1OldRoomRating,
        p2OldRoomRating,
        score1,
        score2,
        false,
        mode,
        kFactor
      );
      d2_Room = calculateDelta(
        p2OldRoomRating,
        p1OldRoomRating,
        score2,
        score1,
        false,
        mode,
        kFactor
      );

      p1NewRoomRating = p1OldRoomRating + d1_Room;
      p2NewRoomRating = p2OldRoomRating + d2_Room;

      p1Member.rating = p1NewRoomRating;
      p2Member.rating = p2NewRoomRating;

      if (score1 > score2) totalWinsP1++;
      else totalWinsP2++;

      const ts = new Date(startDate.getTime() + i * 1000);
      const createdAt = getFinnishFormattedDate(ts);
      const tsIso = ts.toISOString();

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
        tennisStatsP1.aces += player1Data.aces;
        tennisStatsP1.doubleFaults += player1Data.doubleFaults;
        tennisStatsP1.winners += player1Data.winners;
        tennisStatsP2.aces += player2Data.aces;
        tennisStatsP2.doubleFaults += player2Data.doubleFaults;
        tennisStatsP2.winners += player2Data.winners;
      } else {
        const nonTennis = row as NonTennisRow;
        player1Data.side = nonTennis.side1;
        player2Data.side = nonTennis.side2;
      }

      const matchDoc: Omit<Match, 'id'> = {
        roomId,
        createdAt,
        timestamp: createdAt,
        tsIso,
        isRanked: room.isRanked !== false,
        player1Id,
        player2Id,
        players: [player1Id, player2Id],
        player1: {
          name: p1Member.name,
          scores: score1,
          oldRating: oldG1,
          newRating: newG1,
          addedPoints: d1_Global,
          roomOldRating: p1OldRoomRating,
          roomNewRating: p1Member.rating,
          roomAddedPoints: d1_Room,
          ...player1Data,
        },
        player2: {
          name: p2Member.name,
          scores: score2,
          oldRating: oldG2,
          newRating: newG2,
          addedPoints: d2_Global,
          roomOldRating: p2OldRoomRating,
          roomNewRating: p2Member.rating,
          roomAddedPoints: d2_Room,
          ...player2Data,
        },
        winner: score1 > score2 ? p1Member.name : p2Member.name,
      };

      await addDoc(collection(db, config.collections.matches), matchDoc);

      if (matchesInput.length > 1 && i < matchesInput.length - 1) {
        await new Promise((res) => setTimeout(res, 1000));
      }
    }

    await updateDoc(doc(db, config.collections.rooms, roomId), {
      members: draft,
    });

    const p1Update: any = {
      [`sports.${sport}.wins`]: increment(totalWinsP1),
      [`sports.${sport}.losses`]: increment(totalWinsP2),
    };
    const p2Update: any = {
      [`sports.${sport}.wins`]: increment(totalWinsP2),
      [`sports.${sport}.losses`]: increment(totalWinsP1),
    };

    if (sport === 'tennis') {
      p1Update[`sports.tennis.aces`] = increment(tennisStatsP1.aces);
      p1Update[`sports.tennis.doubleFaults`] = increment(
        tennisStatsP1.doubleFaults
      );
      p1Update[`sports.tennis.winners`] = increment(tennisStatsP1.winners);
      p2Update[`sports.tennis.aces`] = increment(tennisStatsP2.aces);
      p2Update[`sports.tennis.doubleFaults`] = increment(
        tennisStatsP2.doubleFaults
      );
      p2Update[`sports.tennis.winners`] = increment(tennisStatsP2.winners);
    }

    if (room.isRanked !== false) {
      p1Update[`sports.${sport}.globalElo`] = currentG1;
      p1Update[`sports.${sport}.eloHistory`] = arrayUnion({
        ts: new Date().toISOString(),
        elo: currentG1,
      });
      p2Update[`sports.${sport}.globalElo`] = currentG2;
      p2Update[`sports.${sport}.eloHistory`] = arrayUnion({
        ts: new Date().toISOString(),
        elo: currentG2,
      });
    }

    await Promise.all([
      updateDoc(doc(db, 'users', player1Id), p1Update),
      updateDoc(doc(db, 'users', player2Id), p2Update),
    ]);

    return true;
  } catch (error) {
    console.error('Failed to process and save matches:', error);
    return false;
  }
}
