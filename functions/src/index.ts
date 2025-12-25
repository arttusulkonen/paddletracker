// functions/src/index.ts
import { googleAI } from '@genkit-ai/googleai';
import * as admin from 'firebase-admin';
import * as logger from 'firebase-functions/logger';
import {
	CallableRequest,
	HttpsError,
	onCall,
} from 'firebase-functions/v2/https';
import { genkit, z } from 'genkit';
import { SPORT_COLLECTIONS } from './config';
import { calculateDelta as calcDeltaImport, getDynamicK, RoomMode } from './lib/eloMath';

admin.initializeApp();
const db = admin.firestore();
const auth = admin.auth();
const storage = admin.storage();

function levenshtein(a: string, b: string): number {
  const matrix: number[][] = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          Math.min(matrix[i][j - 1] + 1, matrix[i - 1][j] + 1)
        );
      }
    }
  }
  return matrix[b.length][a.length];
}

function getFinnishDate(dateObj: Date = new Date()): string {
  const options: Intl.DateTimeFormatOptions = {
    timeZone: 'Europe/Helsinki',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  };

  const formatter = new Intl.DateTimeFormat('fi-FI', options);
  const parts = formatter.formatToParts(dateObj);
  const getPart = (type: string) =>
    parts.find((p) => p.type === type)?.value || '00';

  return `${getPart('day')}.${getPart('month')}.${getPart('year')} ${getPart(
    'hour'
  )}.${getPart('minute')}.${getPart('second')}`;
}

const calculateDelta = (
  rating1: number,
  rating2: number,
  score1: number,
  score2: number,
  isGlobal: boolean
) => {
  const K = 32;
  const result = score1 > score2 ? 1 : 0;
  const expected = 1 / (1 + 10 ** ((rating2 - rating1) / 400));
  let delta = Math.round(K * (result - expected));

  if (!isGlobal) {
    if (delta < 0) {
      const inflationFactor = 0.8;
      delta = Math.round(delta * inflationFactor);
    }
  }
  return delta;
};

const findUserOrSuggest = async (name: string) => {
  const normalized = (name || '').trim();
  if (!normalized) return { doc: null };

  const normalizedLower = normalized.toLowerCase();
  const usersRef = db.collection('users');

  let snap = await usersRef.where('name', '==', normalized).limit(1).get();
  if (!snap.empty) return { doc: snap.docs[0] };

  snap = await usersRef.where('displayName', '==', normalized).limit(1).get();
  if (!snap.empty) return { doc: snap.docs[0] };

  const allUsers = await usersRef.get();
  let bestDoc: admin.firestore.QueryDocumentSnapshot | null = null;
  let minDist = Infinity;

  for (const doc of allUsers.docs) {
    const data = doc.data();
    const dn = (data.displayName || '').toString();
    const n = (data.name || '').toString();
    const variants = [dn.toLowerCase(), n.toLowerCase()].filter(Boolean);

    if (variants.includes(normalizedLower)) {
      return { doc };
    }

    for (const field of variants) {
      const dist = levenshtein(normalizedLower, field);
      if (dist < minDist) {
        minDist = dist;
        bestDoc = doc;
      }
    }
  }

  if (minDist <= 2 && bestDoc) {
    return { doc: bestDoc };
  }

  return { doc: null };
};

const ai = genkit({
  plugins: [
    googleAI({
      apiKey: process.env.GOOGLE_GENAI_API_KEY || '',
    }),
  ],
  model: 'googleai/gemini-2.0-flash',
});

export const aiChat = onCall(
  { cors: true },
  async (request: CallableRequest) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Login required');
    }

    const text = request.data?.text;
    const sport = 'pingpong';

    if (typeof text !== 'string') {
      throw new HttpsError('invalid-argument', 'Missing text');
    }

    try {
      const chatResponse = await ai.generate({
        prompt: `
        You are a specialized parser for sports match results (${sport}).
        Your ONLY task is to extract match scores from the user input into a JSON structure.

        Rules:
        1. Extract player names and scores for *each* game/set.
        2. Multiple matches can be listed. Parse ALL of them.
        3. Names can be separated by "vs", "-", or spaces.
        4. Do NOT auto-capitalize names. Keep them exactly as typed.
        5. If no matches found, return type "TEXT".

        REQUIRED JSON OUTPUT FORMAT:
        If matches found:
        {
          "type": "MATCH_DRAFT",
          "data": {
            "matches": [
              { "player1Name": "string", "player2Name": "string", "score1": number, "score2": number }
            ]
          }
        }

        If NO matches found:
        {
          "type": "TEXT",
          "message": "I am a match recorder. Please provide scores like 'Alex vs Bob 11-9'."
        }

        IMPORTANT: Return ONLY the valid JSON string.
        
        Input: "${text}"
      `,
        output: {
          schema: z.object({
            type: z.enum(['MATCH_DRAFT', 'TEXT']),
            data: z
              .object({
                matches: z.array(
                  z.object({
                    player1Name: z.string(),
                    player2Name: z.string(),
                    score1: z.number(),
                    score2: z.number(),
                  })
                ),
              })
              .optional(),
            message: z.string().optional(),
          }),
        },
      });

      return chatResponse.output;
    } catch (error: any) {
      logger.error('aiChat error:', error);
      throw new HttpsError(
        'internal',
        error?.message || 'AI processing failed'
      );
    }
  }
);

export const aiSaveMatch = onCall(
  {
    cors: true,
    timeoutSeconds: 540,
    memory: '512MiB',
  },
  async (request: CallableRequest) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Login required');
    }

    const { matches, roomId } = request.data || {};

    if (!Array.isArray(matches) || typeof roomId !== 'string') {
      throw new HttpsError('invalid-argument', 'Missing matches or roomId');
    }

    if (matches.length > 400) {
      throw new HttpsError(
        'invalid-argument',
        'Too many matches at once. Max 400.'
      );
    }

    const sport = 'pingpong';
    const config = SPORT_COLLECTIONS.pingpong;
    const collectionName = config.matches;
    const roomsCollection = config.rooms;

    const roomRef = db.collection(roomsCollection).doc(roomId);
    const roomSnap = await roomRef.get();
    if (!roomSnap.exists) {
      throw new HttpsError('not-found', `Room ${roomId} not found`);
    }

    const roomData = roomSnap.data() || {};
    let members: any[] = roomData.members || [];

    // --- Сбор уникальных имен из запроса ---
    const uniqueNames = new Set<string>();
    matches.forEach((m) => {
      uniqueNames.add(m.player1Name);
      uniqueNames.add(m.player2Name);
    });

    // --- Маппинг имен на UID из текущих участников ---
    const memberMap = new Map<string, string>();
    members.forEach((m: any) => {
      const uid = m.userId;
      // Сохраняем и имя и displayName в нижнем регистре для поиска
      if (m.name) memberMap.set(m.name.trim().toLowerCase(), uid);
      if (m.displayName) memberMap.set(m.displayName.trim().toLowerCase(), uid);
    });

    const nameToUidMap = new Map<string, string>();

    // --- Поиск UID для тех имен, которых нет в мапе ---
    for (const name of Array.from(uniqueNames)) {
      const lower = name.trim().toLowerCase();

      if (memberMap.has(lower)) {
        nameToUidMap.set(name, memberMap.get(lower)!);
        continue;
      }

      // Если не нашли в memberMap, ищем глобально в users
      const findUser = async (n: string) => {
        const norm = n.trim();
        const normLower = norm.toLowerCase();
        const usersRef = db.collection('users');

        // Точное совпадение
        let snap = await usersRef.where('name', '==', norm).limit(1).get();
        if (!snap.empty) return snap.docs[0];
        snap = await usersRef.where('displayName', '==', norm).limit(1).get();
        if (!snap.empty) return snap.docs[0];

        // Нечеткий поиск (дорогой, но для AI фичи ок)
        const allUsers = await usersRef.get();
        let bestDoc: admin.firestore.QueryDocumentSnapshot | null = null;
        let minDist = Infinity;

        for (const doc of allUsers.docs) {
          const d = doc.data();
          const variants = [
            (d.displayName || '').toString(),
            (d.name || '').toString(),
          ]
            .map((s) => s.toLowerCase())
            .filter(Boolean);

          if (variants.includes(normLower)) return doc;

          for (const v of variants) {
            const dist = levenshtein(normLower, v);
            if (dist < minDist) {
              minDist = dist;
              bestDoc = doc;
            }
          }
        }
        // Разрешаем дистанцию 2 (опечатки)
        return minDist <= 2 ? bestDoc : null;
      };

      const foundDoc = await findUser(name);
      if (foundDoc) {
        nameToUidMap.set(name, foundDoc.id);
      } else {
         console.warn(`User not found for name: ${name}`);
      }
    }

    const uniqueUids = Array.from(new Set(nameToUidMap.values()));
    
    // Загружаем данные пользователей
    const userDocsRefs = uniqueUids.map((uid) =>
      db.collection('users').doc(uid)
    );

    const userDocs =
      userDocsRefs.length > 0 ? await db.getAll(...userDocsRefs) : [];

    const userDataMap = new Map<string, any>();
    userDocs.forEach((d) => {
      if (d.exists) userDataMap.set(d.id, d.data());
    });

    // --- Хелпер для создания/получения участника ---
    const getOrAddMember = (uid: string, userData: any) => {
      const existingIndex = members.findIndex((m: any) => m.userId === uid);
      if (existingIndex !== -1) {
        return members[existingIndex];
      }
      
      const newMember = {
        userId: uid,
        name: userData?.name || userData?.displayName || 'Unknown Player',
        email: userData?.email || '',
        rating: 1000,
        wins: 0,
        losses: 0,
        role: 'viewer', 
        date: new Date().toISOString(),
        globalElo: userData?.sports?.[sport]?.globalElo ?? 1000
      };
      
      members.push(newMember);
      return newMember;
    };

    const batch = db.batch();
    const baseDate = new Date();

    const getSortedMembers = (mems: any[]) => {
      return [...mems].sort((a, b) => (b.rating || 1000) - (a.rating || 1000));
    };

    const oldSorted = getSortedMembers(members);
    const oldRanks = new Map<string, number>();
    oldSorted.forEach((m, index) => oldRanks.set(m.userId, index + 1));

    type UserUpdateState = {
      startGlobalElo: number;
      currentGlobalElo: number;
      startRoomElo: number;
      currentRoomElo: number;
      winsToAdd: number;
      lossesToAdd: number;
      name: string;
    };

    const userUpdates = new Map<string, UserUpdateState>();

    const initUser = (uid: string, nameForReport: string, memberObj: any) => {
      if (!userUpdates.has(uid)) {
        const globalData = userDataMap.get(uid) || {};
        
        const gElo = globalData.sports?.[sport]?.globalElo ?? 1000;
        const rElo = memberObj?.rating ?? 1000;

        const realName =
          globalData.name || globalData.displayName || nameForReport;

        userUpdates.set(uid, {
          startGlobalElo: gElo,
          currentGlobalElo: gElo,
          startRoomElo: rElo,
          currentRoomElo: rElo,
          winsToAdd: 0,
          lossesToAdd: 0,
          name: realName,
        });
      }
    };

    try {
      for (let i = 0; i < matches.length; i++) {
        const match = matches[i];
        const { player1Name, player2Name, score1, score2 } = match;

        const p1Id = nameToUidMap.get(player1Name);
        const p2Id = nameToUidMap.get(player2Name);

        // --- ВАЖНОЕ ИЗМЕНЕНИЕ: Явный выброс ошибки, если игрок не найден ---
        if (!p1Id) {
             console.error(`AI Match Error: Player 1 not found. Name: "${player1Name}"`);
             throw new HttpsError('failed-precondition', `Could not find player: "${player1Name}". Please check the name spelling.`);
        }
        if (!p2Id) {
             console.error(`AI Match Error: Player 2 not found. Name: "${player2Name}"`);
             throw new HttpsError('failed-precondition', `Could not find player: "${player2Name}". Please check the name spelling.`);
        }

        const p1Data = userDataMap.get(p1Id) || {};
        const p2Data = userDataMap.get(p2Id) || {};

        const p1Member = getOrAddMember(p1Id, p1Data);
        const p2Member = getOrAddMember(p2Id, p2Data);

        initUser(p1Id, player1Name, p1Member);
        initUser(p2Id, player2Name, p2Member);

        const p1State = userUpdates.get(p1Id)!;
        const p2State = userUpdates.get(p2Id)!;

        const d1_Global = calculateDelta(
          p1State.currentGlobalElo,
          p2State.currentGlobalElo,
          score1,
          score2,
          true
        );
        const d2_Global = calculateDelta(
          p2State.currentGlobalElo,
          p1State.currentGlobalElo,
          score2,
          score1,
          true
        );

        const d1_Room = calculateDelta(
          p1State.currentRoomElo,
          p2State.currentRoomElo,
          score1,
          score2,
          false
        );
        const d2_Room = calculateDelta(
          p2State.currentRoomElo,
          p1State.currentRoomElo,
          score2,
          score1,
          false
        );

        const newGlobalG1 = p1State.currentGlobalElo + d1_Global;
        const newGlobalG2 = p2State.currentGlobalElo + d2_Global;
        const newRoomR1 = p1State.currentRoomElo + d1_Room;
        const newRoomR2 = p2State.currentRoomElo + d2_Room;

        p1State.currentGlobalElo = newGlobalG1;
        p2State.currentGlobalElo = newGlobalG2;
        p1State.currentRoomElo = newRoomR1;
        p2State.currentRoomElo = newRoomR2;

        if (score1 > score2) {
          p1State.winsToAdd += 1;
          p2State.lossesToAdd += 1;
          p1Member.wins = (p1Member.wins || 0) + 1;
          p2Member.losses = (p2Member.losses || 0) + 1;
        } else {
          p2State.winsToAdd += 1;
          p1State.lossesToAdd += 1;
          p2Member.wins = (p2Member.wins || 0) + 1;
          p1Member.losses = (p1Member.losses || 0) + 1;
        }

        p1Member.rating = newRoomR1;
        p2Member.rating = newRoomR2;
        p1Member.globalElo = newGlobalG1;
        p2Member.globalElo = newGlobalG2;

        const matchDate = new Date(baseDate.getTime() + i * 10);
        const tsIso = matchDate.toISOString();
        const timestamp = getFinnishDate(matchDate);

        const matchRef = db.collection(collectionName).doc();

        batch.set(matchRef, {
          roomId,
          isRanked: true,
          player1Id: p1Id,
          player2Id: p2Id,
          players: [p1Id, p2Id],
          timestamp,
          tsIso,
          createdAt: timestamp,
          winner: score1 > score2 ? p1State.name : p2State.name,
          player1: {
            name: p1State.name,
            scores: score1,
            oldRating: p1State.currentGlobalElo - d1_Global,
            newRating: newGlobalG1,
            addedPoints: d1_Global,
            roomOldRating: p1State.currentRoomElo - d1_Room,
            roomNewRating: newRoomR1,
            roomAddedPoints: d1_Room,
            side: 'left',
          },
          player2: {
            name: p2State.name,
            scores: score2,
            oldRating: p2State.currentGlobalElo - d2_Global,
            newRating: newGlobalG2,
            addedPoints: d2_Global,
            roomOldRating: p2State.currentRoomElo - d2_Room,
            roomNewRating: newRoomR2,
            roomAddedPoints: d2_Room,
            side: 'right',
          },
        });
      }

      userUpdates.forEach((data, uid) => {
        const updates: any = {
          [`sports.${sport}.globalElo`]: data.currentGlobalElo,
        };
        if (data.winsToAdd > 0) {
          updates[`sports.${sport}.wins`] =
            admin.firestore.FieldValue.increment(data.winsToAdd);
        }
        if (data.lossesToAdd > 0) {
          updates[`sports.${sport}.losses`] =
            admin.firestore.FieldValue.increment(data.lossesToAdd);
        }

        updates[`sports.${sport}.eloHistory`] =
          admin.firestore.FieldValue.arrayUnion({
            ts: new Date().toISOString(),
            elo: data.currentGlobalElo,
          });

        batch.update(db.collection('users').doc(uid), updates);
      });

      // Обновляем memberIds, чтобы синхронизировать данные (если добавился новый игрок)
      const currentMemberIds: string[] = roomData.memberIds || [];
      const updatedMemberIds = new Set(currentMemberIds);
      members.forEach(m => updatedMemberIds.add(m.userId));

      batch.update(roomRef, { 
        members, 
        memberIds: Array.from(updatedMemberIds) 
      });

      await batch.commit();

      const newSorted = getSortedMembers(members);
      const newRanks = new Map<string, number>();
      newSorted.forEach((m, index) => newRanks.set(m.userId, index + 1));

      const updatesList: any[] = [];
      userUpdates.forEach((data, uid) => {
        const oldRank = oldRanks.get(uid) || 0;
        const newRank = newRanks.get(uid) || 0;
        const eloDiff = data.currentRoomElo - data.startRoomElo;

        updatesList.push({
          name: data.name,
          eloDiff: eloDiff,
          newElo: data.currentGlobalElo,
          roomElo: data.currentRoomElo,
          oldRank: oldRank,
          newRank: newRank,
        });
      });

      updatesList.sort((a, b) => b.eloDiff - a.eloDiff);

      return { success: true, updates: updatesList };
    } catch (error: any) {
      logger.error('aiSaveMatch error:', error);
      // Если это наша кастомная ошибка, прокидываем её сообщение
      if (error instanceof HttpsError) {
          throw error;
      }
      throw new HttpsError(
        'internal',
        error?.message || 'Failed to save matches'
      );
    }
  }
);

const collectionsToScan = {
  rooms: ['rooms-pingpong', 'rooms-tennis', 'rooms-badminton'],
  matches: ['matches-pingpong', 'matches-tennis', 'matches-badminton'],
  tournaments: [
    'tournaments-pingpong',
    'tournaments-tennis',
    'tournaments-badminton',
  ],
};

interface Member {
  userId: string;
  name?: string;
  displayName?: string;
  email?: string;
  photoURL?: string | null;
  [k: string]: any;
}
interface Participant {
  userId: string;
  name?: string;
}
interface MatchRef {
  player1?: Participant;
  player2?: Participant;
}
interface Round {
  matches: MatchRef[];
}

async function getSuperAdminIds(): Promise<string[]> {
  try {
    const docRef = db.collection('config').doc('app');
    const docSnap = await docRef.get();
    if (docSnap.exists) {
      const data = docSnap.data();
      if (data && Array.isArray(data.superAdminIds)) {
        return data.superAdminIds;
      }
    }
    return [];
  } catch (error) {
    console.error('Error fetching super admin IDs:', error);
    return [];
  }
}

export const permanentlyDeleteUser = onCall(
  async (request: CallableRequest) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'You must be logged in.');
    }

    const { userId: userIdToDelete } = request.data || {};
    if (!userIdToDelete || typeof userIdToDelete !== 'string') {
      throw new HttpsError('invalid-argument', 'Missing userId');
    }

    const callingUid = request.auth.uid;
    const anonymizedName = 'Deleted User';
    const superAdminIds = await getSuperAdminIds();
    const isSuperAdmin = superAdminIds.includes(callingUid);

    if (!isSuperAdmin && callingUid !== userIdToDelete) {
      throw new HttpsError('permission-denied', "You don't have permission.");
    }

    const userDocRef = db.collection('users').doc(userIdToDelete);
    const userDoc = await userDocRef.get();
    if (!userDoc.exists) {
      await auth
        .deleteUser(userIdToDelete)
        .catch((e: any) => console.error(`Auth delete failed: ${e.message}`));
      return { success: true, message: 'User already deleted.' };
    }

    const originalName =
      userDoc.data()?.name || userDoc.data()?.displayName || 'Unknown';

    try {
      const batch = db.batch();

      for (const collection of collectionsToScan.rooms) {
        const snapshot = await db
          .collection(collection)
          .where('memberIds', 'array-contains', userIdToDelete)
          .get();
        snapshot.forEach((doc: any) => {
          const data = doc.data() || {};
          const updates: { [key: string]: any } = {};
          const members = Array.isArray(data.members) ? data.members : [];
          updates.members = members.map((member: Member) =>
            member.userId === userIdToDelete
              ? {
                  ...member,
                  name: anonymizedName,
                  displayName: anonymizedName,
                  email: `deleted-${userIdToDelete}@deleted.com`,
                  photoURL: null,
                }
              : member
          );
          updates.memberIds = Array.isArray(data.memberIds)
            ? data.memberIds.filter((id: string) => id !== userIdToDelete)
            : [];
          if (data.creator === userIdToDelete) {
            updates.creatorName = anonymizedName;
          }
          batch.update(doc.ref, updates);
        });
      }

      for (const collection of collectionsToScan.matches) {
        const snapshot = await db
          .collection(collection)
          .where('players', 'array-contains', userIdToDelete)
          .get();
        snapshot.forEach((doc: any) => {
          const data = doc.data() || {};
          const updates: { [key: string]: any } = {};
          if (data.player1Id === userIdToDelete) {
            updates['player1.name'] = anonymizedName;
          }
          if (data.player2Id === userIdToDelete) {
            updates['player2.name'] = anonymizedName;
          }
          if (data.winner === originalName) updates.winner = anonymizedName;
          if (Object.keys(updates).length > 0) batch.update(doc.ref, updates);
        });
      }

      for (const collection of collectionsToScan.tournaments) {
        const snapshot = await db
          .collection(collection)
          .where('participantsIds', 'array-contains', userIdToDelete)
          .get();
        snapshot.forEach((doc: any) => {
          const data = doc.data() || {};
          const updates: { [key: string]: any } = {};
          if (Array.isArray(data.participants)) {
            updates.participants = data.participants.map((p: Participant) =>
              p.userId === userIdToDelete ? { ...p, name: anonymizedName } : p
            );
          }
          if (Array.isArray(data.finalStats)) {
            updates.finalStats = data.finalStats.map((s: Participant) =>
              s.userId === userIdToDelete ? { ...s, name: anonymizedName } : s
            );
          }
          if (data.champion?.userId === userIdToDelete) {
            updates.champion = { ...data.champion, name: anonymizedName };
          }
          if (Array.isArray(data.rounds)) {
            updates.rounds = data.rounds.map((round: Round) => ({
              ...round,
              matches: Array.isArray(round.matches)
                ? round.matches.map((match: MatchRef) => {
                    if (
                      match.player1 &&
                      match.player1.userId === userIdToDelete
                    ) {
                      match.player1 = {
                        ...match.player1,
                        name: anonymizedName,
                      };
                    }
                    if (
                      match.player2 &&
                      match.player2.userId === userIdToDelete
                    ) {
                      match.player2 = {
                        ...match.player2,
                        name: anonymizedName,
                      };
                    }
                    return match;
                  })
                : round.matches,
            }));
          }
          if (Object.keys(updates).length > 0) batch.update(doc.ref, updates);
        });
      }

      const friendsSnapshot = await db
        .collection('users')
        .where('friends', 'array-contains', userIdToDelete)
        .get();
      friendsSnapshot.forEach((userDocSnap: any) => {
        batch.update(userDocSnap.ref, {
          friends: admin.firestore.FieldValue.arrayRemove(userIdToDelete),
        });
      });

      await batch.commit();

      await storage
        .bucket()
        .deleteFiles({ prefix: `avatars/${userIdToDelete}` })
        .catch((e: any) => console.error('Storage cleanup failed:', e.message));

      await db.collection('users').doc(userIdToDelete).delete();
      await auth
        .deleteUser(userIdToDelete)
        .catch((e: any) => console.error('Auth delete failed:', e.message));

      return { success: true, message: 'User permanently deleted.' };
    } catch (error: any) {
      console.error('Error deleting user:', error);
      throw new HttpsError('internal', 'An error occurred during deletion.');
    }
  }
);

export const recordMatch = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'User must be logged in');
  }

  const { roomId, player1Id, player2Id, matches, sport } = request.data;

  if (
    !roomId ||
    !player1Id ||
    !player2Id ||
    !matches ||
    !Array.isArray(matches) ||
    matches.length === 0
  ) {
    throw new HttpsError(
      'invalid-argument',
      'Missing required fields or matches array is empty'
    );
  }

  const roomRef = db.collection(`rooms-${sport}`).doc(roomId);
  const p1Ref = db.collection('users').doc(player1Id);
  const p2Ref = db.collection('users').doc(player2Id);

  const [roomSnap, p1Snap, p2Snap] = await Promise.all([
    roomRef.get(),
    p1Ref.get(),
    p2Ref.get(),
  ]);

  if (!roomSnap.exists) throw new HttpsError('not-found', 'Room not found');

  const roomData = roomSnap.data() || {};
  const p1Data = p1Snap.exists ? p1Snap.data() || {} : {};
  const p2Data = p2Snap.exists ? p2Snap.data() || {} : {};

  const validMemberIds: string[] = roomData.memberIds || [];
  
  if (!validMemberIds.includes(player1Id)) {
     throw new HttpsError('failed-precondition', `Player 1 (${player1Id}) is not in the room memberIds`);
  }
  if (!validMemberIds.includes(player2Id)) {
     throw new HttpsError('failed-precondition', `Player 2 (${player2Id}) is not in the room memberIds`);
  }

  let members = roomData.members || [];
  
  const getOrAddMember = (uid: string, userData: any) => {
    const existingIndex = members.findIndex((m: any) => m.userId === uid);
    if (existingIndex !== -1) {
      return members[existingIndex];
    }

    const newMember = {
      userId: uid,
      name: userData.name || userData.displayName || 'Unknown Player',
      email: userData.email || '',
      rating: 1000,
      wins: 0,
      losses: 0,
      role: 'viewer',
      date: new Date().toISOString(),
      globalElo: userData.sports?.[sport]?.globalElo ?? 1000
    };
    
    members.push(newMember);
    return newMember;
  };

  const member1 = getOrAddMember(player1Id, p1Data);
  const member2 = getOrAddMember(player2Id, p2Data);

  let currentG1 = p1Data.sports?.[sport]?.globalElo ?? 1000;
  let currentG2 = p2Data.sports?.[sport]?.globalElo ?? 1000;

  let currentRoom1 = member1.rating ?? 1000;
  let currentRoom2 = member2.rating ?? 1000;

  let totalWinsP1 = 0;
  let totalWinsP2 = 0;

  const tennisStatsP1 = { aces: 0, doubleFaults: 0, winners: 0 };
  const tennisStatsP2 = { aces: 0, doubleFaults: 0, winners: 0 };

  const mode: RoomMode = roomData.mode || 'office';
  const baseK = typeof roomData.kFactor === 'number' ? roomData.kFactor : 32;
  const isRankedRoom = roomData.isRanked !== false;

  const batch = db.batch();
  const startDate = new Date();

  for (let i = 0; i < matches.length; i++) {
    const game = matches[i];
    const score1 = Number(game.score1);
    const score2 = Number(game.score2);

    const p1MatchesPlayed = (member1.wins ?? 0) + (member1.losses ?? 0) + i;
    const p2MatchesPlayed = (member2.wins ?? 0) + (member2.losses ?? 0) + i;

    const oldG1 = currentG1;
    const oldG2 = currentG2;
    const oldRoom1 = currentRoom1;
    const oldRoom2 = currentRoom2;

    let d1_Global = 0;
    let d2_Global = 0;
    let d1_Room = 0;
    let d2_Room = 0;

    if (isRankedRoom) {
      d1_Global = calcDeltaImport(oldG1, oldG2, score1, score2, true);
      d2_Global = calcDeltaImport(oldG2, oldG1, score2, score1, true);
      currentG1 += d1_Global;
      currentG2 += d2_Global;
    }

    const k1 = getDynamicK(baseK, p1MatchesPlayed, mode);
    const k2 = getDynamicK(baseK, p2MatchesPlayed, mode);

    d1_Room = calcDeltaImport(oldRoom1, oldRoom2, score1, score2, false);
    d2_Room = calcDeltaImport(oldRoom2, oldRoom1, score2, score1, false);

    currentRoom1 += d1_Room;
    currentRoom2 += d2_Room;

    if (score1 > score2) totalWinsP1++;
    else totalWinsP2++;

    let player1Extra: any = {};
    let player2Extra: any = {};

    if (sport === 'tennis') {
      const p1Aces = Number(game.aces1) || 0;
      const p1Df = Number(game.doubleFaults1) || 0;
      const p1Win = Number(game.winners1) || 0;

      const p2Aces = Number(game.aces2) || 0;
      const p2Df = Number(game.doubleFaults2) || 0;
      const p2Win = Number(game.winners2) || 0;

      player1Extra = { aces: p1Aces, doubleFaults: p1Df, winners: p1Win };
      player2Extra = { aces: p2Aces, doubleFaults: p2Df, winners: p2Win };

      tennisStatsP1.aces += p1Aces;
      tennisStatsP1.doubleFaults += p1Df;
      tennisStatsP1.winners += p1Win;
      tennisStatsP2.aces += p2Aces;
      tennisStatsP2.doubleFaults += p2Df;
      tennisStatsP2.winners += p2Win;
    } else {
      player1Extra.side = game.side1 || 'left';
      player2Extra.side = game.side2 || 'right';
    }

    const matchDate = new Date(startDate.getTime() + i * 1000); 
    const matchRef = db.collection(`matches-${sport}`).doc();

    const p1Name = p1Data.name || p1Data.displayName || member1.name || 'Unknown';
    const p2Name = p2Data.name || p2Data.displayName || member2.name || 'Unknown';

    batch.set(matchRef, {
      roomId,
      player1Id,
      player2Id,
      players: [player1Id, player2Id],
      isRanked: isRankedRoom,
      createdAt: getFinnishDate(matchDate),
      timestamp: getFinnishDate(matchDate),
      tsIso: matchDate.toISOString(),
      winner: score1 > score2 ? p1Name : p2Name,
      player1: {
        name: p1Name,
        scores: score1,
        oldRating: oldG1,
        newRating: currentG1,
        addedPoints: d1_Global,
        roomOldRating: oldRoom1,
        roomNewRating: currentRoom1,
        roomAddedPoints: d1_Room,
        ...player1Extra,
      },
      player2: {
        name: p2Name,
        scores: score2,
        oldRating: oldG2,
        newRating: currentG2,
        addedPoints: d2_Global,
        roomOldRating: oldRoom2,
        roomNewRating: currentRoom2,
        roomAddedPoints: d2_Room,
        ...player2Extra,
      },
    });
  }

  member1.rating = currentRoom1;
  member1.globalElo = currentG1;
  member1.wins = (member1.wins || 0) + totalWinsP1;
  member1.losses = (member1.losses || 0) + totalWinsP2;

  member2.rating = currentRoom2;
  member2.globalElo = currentG2;
  member2.wins = (member2.wins || 0) + totalWinsP2;
  member2.losses = (member2.losses || 0) + totalWinsP1;

  batch.update(roomRef, { members: members });

  const updateUserStats = (
    ref: any,
    newGlobalElo: number,
    winsToAdd: number,
    lossesToAdd: number,
    tennisStats: any
  ) => {
    if (!ref) return;

    const updateData: any = {
      [`sports.${sport}.wins`]: admin.firestore.FieldValue.increment(winsToAdd),
      [`sports.${sport}.losses`]:
        admin.firestore.FieldValue.increment(lossesToAdd),
    };

    if (isRankedRoom) {
      updateData[`sports.${sport}.globalElo`] = newGlobalElo;
      updateData[`sports.${sport}.eloHistory`] =
        admin.firestore.FieldValue.arrayUnion({
          ts: new Date().toISOString(),
          elo: newGlobalElo,
        });
    }

    if (sport === 'tennis') {
      updateData[`sports.tennis.aces`] = admin.firestore.FieldValue.increment(
        tennisStats.aces
      );
      updateData[`sports.tennis.doubleFaults`] =
        admin.firestore.FieldValue.increment(tennisStats.doubleFaults);
      updateData[`sports.tennis.winners`] =
        admin.firestore.FieldValue.increment(tennisStats.winners);
    }

    batch.update(ref, updateData);
  };

  if (p1Snap.exists) updateUserStats(p1Ref, currentG1, totalWinsP1, totalWinsP2, tennisStatsP1);
  if (p2Snap.exists) updateUserStats(p2Ref, currentG2, totalWinsP2, totalWinsP1, tennisStatsP2);

  await batch.commit();

  return { success: true, gamesRecorded: matches.length };
});

export const claimGhostProfile = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'User must be logged in');
  }

  const { ghostId } = request.data;
  const newUserId = request.auth.uid;

  if (!ghostId || !newUserId) {
    throw new HttpsError('invalid-argument', 'Missing ghostId or newUserId');
  }

  // Проверка: действительно ли этот пользователь заклеймил этого призрака
  const newUserDoc = await db.collection('users').doc(newUserId).get();
  const userData = newUserDoc.data();

  if (!userData || userData.claimedFrom !== ghostId) {
    throw new HttpsError('permission-denied', 'Profile mismatch');
  }

  const batch = db.batch();
  let operationCount = 0;

  const sports = ['pingpong', 'tennis', 'badminton'];

  try {
    // 1. Обновляем КОМНАТЫ (Rooms)
    for (const sport of sports) {
      const roomsRef = db.collection(`rooms-${sport}`);
      const snapshot = await roomsRef.where('memberIds', 'array-contains', ghostId).get();

      for (const doc of snapshot.docs) {
        const data = doc.data();
        const updates: any = {};

        // Обновляем массив ID
        const newMemberIds = (data.memberIds || []).filter((id: string) => id !== ghostId);
        if (!newMemberIds.includes(newUserId)) {
           newMemberIds.push(newUserId);
        }
        updates.memberIds = newMemberIds;

        // Обновляем массив объектов members
        if (Array.isArray(data.members)) {
          updates.members = data.members.map((m: any) => {
            if (m.userId === ghostId) {
              return { ...m, userId: newUserId };
            }
            return m;
          });
        }

        // Если создатель комнаты был гостом
        if (data.creator === ghostId) {
          updates.creator = newUserId;
        }

        batch.update(doc.ref, updates);
        operationCount++;
      }
    }

    // 2. Обновляем МАТЧИ (Matches)
    for (const sport of sports) {
      const matchesRef = db.collection(`matches-${sport}`);
      // Ищем матчи, где гост был игроком (array-contains)
      const snapshot = await matchesRef.where('players', 'array-contains', ghostId).get();

      for (const doc of snapshot.docs) {
        const data = doc.data();
        const updates: any = {};

        const newPlayers = (data.players || []).filter((id: string) => id !== ghostId);
        if (!newPlayers.includes(newUserId)) {
           newPlayers.push(newUserId);
        }
        updates.players = newPlayers;

        if (data.player1Id === ghostId) {
          updates.player1Id = newUserId;
        }
        if (data.player2Id === ghostId) {
          updates.player2Id = newUserId;
        }

        batch.update(doc.ref, updates);
        operationCount++;
      }
    }

    // 3. Обновляем СООБЩЕСТВА (Communities)
    const communitiesRef = db.collection('communities');
    // Ищем, где гост был участником
    const commSnapshot = await communitiesRef.where('members', 'array-contains', ghostId).get();

    for (const doc of commSnapshot.docs) {
      const data = doc.data();
      const updates: any = {};

      const newMembers = (data.members || []).filter((id: string) => id !== ghostId);
      if (!newMembers.includes(newUserId)) {
         newMembers.push(newUserId);
      }
      updates.members = newMembers;

      if (data.ownerId === ghostId) {
        updates.ownerId = newUserId;
      }
      
      if (Array.isArray(data.admins) && data.admins.includes(ghostId)) {
         const newAdmins = data.admins.filter((id: string) => id !== ghostId);
         if (!newAdmins.includes(newUserId)) newAdmins.push(newUserId);
         updates.admins = newAdmins;
      }

      batch.update(doc.ref, updates);
      operationCount++;
    }

    // 4. Обновляем старого призрака
    batch.update(db.collection('users').doc(ghostId), {
      migrationStatus: 'completed',
      migratedTo: newUserId,
      isArchivedGhost: true // Убеждаемся, что флаг стоит
    });

    await batch.commit();
    return { success: true, migratedCount: operationCount };

  } catch (error: any) {
    console.error("Migration error:", error);
    throw new HttpsError('internal', error.message);
  }
});