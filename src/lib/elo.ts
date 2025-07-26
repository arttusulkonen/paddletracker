// src/lib/elo.ts

import {
  addDoc,
  arrayUnion,
  collection,
  doc,
  getDoc,
  increment, // 👈 1. Убедитесь, что `increment` импортирован
  updateDoc,
} from 'firebase/firestore';
import { db } from './firebase';
import type { Match, Room, Sport, SportConfig, UserProfile } from './types';
import { getFinnishFormattedDate } from './utils';

// Эта функция остаётся без изменений
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

export async function processAndSaveMatches(
  roomId: string,
  room: Room,
  player1Id: string,
  player2Id: string,
  matchesInput: { score1: string; score2: string; side1: string; side2: string }[],
  currentMembers: Room['members'],
  sport: Sport,
  config: SportConfig
): Promise<boolean> {
  try {
    const [p1Snap, p2Snap] = await Promise.all([
      getDoc(doc(db, 'users', player1Id)),
      getDoc(doc(db, 'users', player2Id)),
    ]);

    if (!p1Snap.exists() || !p2Snap.exists()) {
      console.error('One or more players not found');
      return false;
    }

    const p1Profile = p1Snap.data() as UserProfile;
    const p2Profile = p2Snap.data() as UserProfile;

    // Начальные ELO для текущего спорта
    let currentG1 = p1Profile.sports?.[sport]?.globalElo ?? 1000;
    let currentG2 = p2Profile.sports?.[sport]?.globalElo ?? 1000;

    let draft = JSON.parse(JSON.stringify(currentMembers)) as Room['members'];
    const historyUpdates: Record<string, any> = {};
    const startDate = new Date();

    // 👉 2. Добавлена логика подсчета побед для итогового обновления
    let totalWinsP1 = 0;
    let totalWinsP2 = 0;

    const matchesCollectionName = config.collections.matches;
    const roomsCollectionName = config.collections.rooms;

    for (let i = 0; i < matchesInput.length; i++) {
      const row = matchesInput[i];
      const score1 = +row.score1;
      const score2 = +row.score2;

      const oldG1 = currentG1;
      const oldG2 = currentG2;

      // Рассчитываем ELO для каждого матча
      const newG1 = calculateElo(oldG1, oldG2, score1, score2);
      const newG2 = calculateElo(oldG2, oldG1, score2, score1);

      const dG1 = newG1 - oldG1;
      const dG2 = newG2 - oldG2;

      // Обновляем текущие ELO для следующего матча в серии
      currentG1 = newG1;
      currentG2 = newG2;

      // Считаем победы
      if (score1 > score2) {
        totalWinsP1++;
      } else {
        totalWinsP2++;
      }

      const p1Member = draft.find((m) => m.userId === player1Id)!;
      const p2Member = draft.find((m) => m.userId === player2Id)!;

      const p1OldRoomRating = p1Member.rating;
      const p2OldRoomRating = p2Member.rating;

      // Обновляем рейтинг в комнате
      p1Member.rating += dG1;
      p2Member.rating += dG2;

      const ts = new Date(startDate.getTime() + i * 1000);
      const createdAt = getFinnishFormattedDate(ts);
      const tsIso = ts.toISOString();

      const matchDoc: Omit<Match, 'id'> = {
        roomId,
        createdAt,
        timestamp: createdAt,
        tsIso,
        isRanked: true,
        player1Id,
        player2Id,
        players: [player1Id, player2Id],
        player1: {
          name: p1Member.name,
          scores: score1,
          oldRating: oldG1,
          newRating: newG1,
          addedPoints: dG1,
          roomOldRating: p1OldRoomRating,
          roomNewRating: p1Member.rating,
          roomAddedPoints: dG1,
          side: row.side1,
        },
        player2: {
          name: p2Member.name,
          scores: score2,
          oldRating: oldG2,
          newRating: newG2,
          addedPoints: dG2,
          roomOldRating: p2OldRoomRating,
          roomNewRating: p2Member.rating,
          roomAddedPoints: dG2,
          side: row.side2,
        },
        winner: score1 > score2 ? p1Member.name : p2Member.name,
      };

      await addDoc(collection(db, matchesCollectionName), matchDoc);
      // Искусственная задержка для уникальных timestamp, если нужно
      if (matchesInput.length > 1 && i < matchesInput.length - 1) {
        await new Promise(res => setTimeout(res, 10));
      }
    }

    // Обновляем данные комнаты
    await updateDoc(doc(db, roomsCollectionName, roomId), {
      members: draft,
      ...historyUpdates,
    });

    // ✅ 3. Полностью исправленный блок обновления профилей пользователей
    await Promise.all([
      updateDoc(doc(db, 'users', player1Id), {
        [`sports.${sport}.globalElo`]: currentG1,
        [`sports.${sport}.eloHistory`]: arrayUnion({
          ts: new Date().toISOString(),
          elo: currentG1,
        }),
        // Используем increment для атомарного обновления
        [`sports.${sport}.wins`]: increment(totalWinsP1),
        [`sports.${sport}.losses`]: increment(totalWinsP2),
      }),
      updateDoc(doc(db, 'users', player2Id), {
        [`sports.${sport}.globalElo`]: currentG2,
        [`sports.${sport}.eloHistory`]: arrayUnion({
          ts: new Date().toISOString(),
          elo: currentG2,
        }),
        // Используем increment для атомарного обновления
        [`sports.${sport}.wins`]: increment(totalWinsP2),
        [`sports.${sport}.losses`]: increment(totalWinsP1),
      }),
    ]);

    return true;
  } catch (error) {
    console.error('Failed to process and save matches:', error);
    return false;
  }
}