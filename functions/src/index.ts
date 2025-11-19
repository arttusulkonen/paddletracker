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
import { calculateElo } from './lib/eloMath';

// Инициализация Firebase
admin.initializeApp();
const db = admin.firestore();
const auth = admin.auth();
const storage = admin.storage();

// ==========================================
// 0. HELPERS (SHARED)
// ==========================================

// 1. Нечеткий поиск (Левенштейн)
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

// 2. Форматирование даты для Финляндии
function getFinnishDate(): string {
  const now = new Date();
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
  const parts = formatter.formatToParts(now);
  const getPart = (type: string) =>
    parts.find((p) => p.type === type)?.value || '00';

  return `${getPart('day')}.${getPart('month')}.${getPart('year')} ${getPart(
    'hour'
  )}.${getPart('minute')}.${getPart('second')}`;
}

// 3. Поиск пользователя
const findUserOrSuggest = async (name: string) => {
  const normalized = (name || '').trim();
  if (!normalized) return { doc: null };

  const normalizedLower = normalized.toLowerCase();
  const usersRef = db.collection('users');

  // A) Прямое совпадение (name)
  let snap = await usersRef.where('name', '==', normalized).limit(1).get();
  if (!snap.empty) return { doc: snap.docs[0] };

  // B) Прямое совпадение (displayName)
  snap = await usersRef.where('displayName', '==', normalized).limit(1).get();
  if (!snap.empty) return { doc: snap.docs[0] };

  // C) Нечеткий поиск
  const allUsers = await usersRef.get();
  let bestDoc: admin.firestore.QueryDocumentSnapshot | null = null;
  let bestMatch: string | null = null;
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
        bestMatch = field;
        bestDoc = doc;
      }
    }
  }

  if (minDist <= 2 && bestMatch && bestDoc) {
    return { doc: bestDoc, suggestion: bestMatch };
  }

  return { doc: null };
};

// ==========================================
// 1. AI SETUP
// ==========================================

const ai = genkit({
  plugins: [
    googleAI({
      apiKey: process.env.GOOGLE_GENAI_API_KEY || '',
    }),
  ],
  // Используем стабильную, быструю модель
  model: 'googleai/gemini-2.5-flash',
});

// ==========================================
// 2. WEB CHAT FUNCTION (PURE PARSER)
// ==========================================

export const aiChat = onCall(
  { cors: true },
  async (request: CallableRequest) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Login required');
    }

    const text = request.data?.text;
    const sport = request.data?.sport || 'pingpong';

    if (typeof text !== 'string') {
      throw new HttpsError('invalid-argument', 'Missing text');
    }

    try {
      // Генерируем ответ без использования инструментов, чисто на промпте
      const chatResponse = await ai.generate({
        prompt: `
        You are a specialized parser for sports match results (${sport}).
        Your ONLY task is to extract match scores from the user input into a JSON structure.

        Rules:
        1. Extract player names and scores for *each* game/set.
        2. Multiple matches can be listed in one message (e.g., "Pekka vs Jukka 11-9. Matti vs Teppo 11-5"). Parse ALL of them.
        3. Names can be separated by "vs", "-", or spaces.
        4. Do NOT auto-capitalize names. Keep them exactly as typed.
        5. If the user input does NOT contain match scores (e.g., "hello", "who is winning"), return type "TEXT" with a helpful message.

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

        IMPORTANT: Return ONLY the valid JSON string. No markdown (no \`\`\`json).
        
        Input: "${text}"
      `,
        // Мы не используем tools, чтобы не путать модель статистикой
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

// ==========================================
// 3. SAVE MATCH FUNCTION
// ==========================================

export const aiSaveMatch = onCall(
  { cors: true },
  async (request: CallableRequest) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Login required');
    }

    const { matches, roomId } = request.data || {};
    if (!Array.isArray(matches) || typeof roomId !== 'string') {
      throw new HttpsError('invalid-argument', 'Missing matches or roomId');
    }

    const sport = 'pingpong'; // Можно сделать динамическим, если придет из request.data.sport
    const collectionName = SPORT_COLLECTIONS.pingpong.matches;
    const roomsCollection = SPORT_COLLECTIONS.pingpong.rooms;

    const roomRef = db.collection(roomsCollection).doc(roomId);
    const roomSnap = await roomRef.get();
    if (!roomSnap.exists) {
      throw new HttpsError('not-found', `Room ${roomId} not found`);
    }

    const roomData = roomSnap.data() || {};
    const members: any[] = roomData.members || [];
    const batch = db.batch();
    const usersRef = db.collection('users');
    const summary: string[] = [];

    try {
      for (const match of matches) {
        const { player1Name, player2Name, score1, score2 } = match;

        const u1 = await findUserOrSuggest(player1Name);
        const u2 = await findUserOrSuggest(player2Name);

        if (!u1.doc || !u2.doc) {
          let errorMsg = 'Error:';
          if (!u1.doc) errorMsg += ` "${player1Name}" not found.`;
          if (!u2.doc) errorMsg += ` "${player2Name}" not found.`;
          if (u1.suggestion) errorMsg += ` Suggestion1: "${u1.suggestion}".`;
          if (u2.suggestion) errorMsg += ` Suggestion2: "${u2.suggestion}".`;
          throw new HttpsError('not-found', errorMsg);
        }

        const p1Doc = u1.doc;
        const p2Doc = u2.doc;
        const p1Id = p1Doc.id;
        const p2Id = p2Doc.id;
        const p1Data = p1Doc.data() || {};
        const p2Data = p2Doc.data() || {};

        const p1RealName = p1Data.name || p1Data.displayName || 'Unknown';
        const p2RealName = p2Data.name || p2Data.displayName || 'Unknown';

        const m1Index = members.findIndex((m: any) => m.userId === p1Id);
        const m2Index = members.findIndex((m: any) => m.userId === p2Id);

        if (m1Index === -1 || m2Index === -1) {
          throw new HttpsError(
            'failed-precondition',
            `Players must be members of room ${roomData?.name || roomId}`
          );
        }

        const p1Member = { ...(members[m1Index] || {}) };
        const p2Member = { ...(members[m2Index] || {}) };

        const currentGlobalG1 = p1Data.sports?.[sport]?.globalElo ?? 1000;
        const currentGlobalG2 = p2Data.sports?.[sport]?.globalElo ?? 1000;

        const newGlobalG1 = calculateElo(
          currentGlobalG1,
          currentGlobalG2,
          score1,
          score2
        );
        const newGlobalG2 = calculateElo(
          currentGlobalG2,
          currentGlobalG1,
          score2,
          score1
        );

        const diffGlobal1 = newGlobalG1 - currentGlobalG1;
        const diffGlobal2 = newGlobalG2 - currentGlobalG2;

        const currentRoomR1 = p1Member.rating ?? 1000;
        const currentRoomR2 = p2Member.rating ?? 1000;
        const newRoomR1 = calculateElo(
          currentRoomR1,
          currentRoomR2,
          score1,
          score2
        );
        const newRoomR2 = calculateElo(
          currentRoomR2,
          currentRoomR1,
          score2,
          score1
        );
        const diffRoom1 = newRoomR1 - currentRoomR1;
        const diffRoom2 = newRoomR2 - currentRoomR2;

        p1Member.rating = newRoomR1;
        p2Member.rating = newRoomR2;
        p1Member.globalElo = newGlobalG1;
        p2Member.globalElo = newGlobalG2;

        if (score1 > score2) {
          p1Member.wins = (p1Member.wins || 0) + 1;
          p2Member.losses = (p2Member.losses || 0) + 1;
        } else if (score2 > score1) {
          p2Member.wins = (p2Member.wins || 0) + 1;
          p1Member.losses = (p1Member.losses || 0) + 1;
        }

        members[m1Index] = p1Member;
        members[m2Index] = p2Member;

        const matchRef = db.collection(collectionName).doc();
        const tsIso = new Date().toISOString();
        const timestamp = getFinnishDate();

        batch.set(matchRef, {
          roomId,
          isRanked: true,
          player1Id: p1Id,
          player2Id: p2Id,
          players: [p1Id, p2Id],
          timestamp,
          tsIso,
          createdAt: timestamp,
          winner: score1 > score2 ? p1RealName : p2RealName,
          player1: {
            name: p1RealName,
            scores: score1,
            oldRating: currentGlobalG1,
            newRating: newGlobalG1,
            addedPoints: diffGlobal1,
            roomOldRating: currentRoomR1,
            roomNewRating: newRoomR1,
            roomAddedPoints: diffRoom1,
            side: 'left',
          },
          player2: {
            name: p2RealName,
            scores: score2,
            oldRating: currentGlobalG2,
            newRating: newGlobalG2,
            addedPoints: diffGlobal2,
            roomOldRating: currentRoomR2,
            roomNewRating: newRoomR2,
            roomAddedPoints: diffRoom2,
            side: 'right',
          },
        });

        batch.update(usersRef.doc(p1Id), {
          [`sports.${sport}.globalElo`]: newGlobalG1,
          [`sports.${sport}.wins`]: admin.firestore.FieldValue.increment(
            score1 > score2 ? 1 : 0
          ),
          [`sports.${sport}.losses`]: admin.firestore.FieldValue.increment(
            score1 < score2 ? 1 : 0
          ),
        });

        batch.update(usersRef.doc(p2Id), {
          [`sports.${sport}.globalElo`]: newGlobalG2,
          [`sports.${sport}.wins`]: admin.firestore.FieldValue.increment(
            score2 > score1 ? 1 : 0
          ),
          [`sports.${sport}.losses`]: admin.firestore.FieldValue.increment(
            score2 < score1 ? 1 : 0
          ),
        });

        summary.push(`${score1}:${score2}`);
      }

      batch.update(roomRef, { members });
      await batch.commit();
      return { success: true, summary };
    } catch (error: any) {
      logger.error('aiSaveMatch error:', error);
      if (error instanceof HttpsError) throw error;
      throw new HttpsError(
        'internal',
        error?.message || 'Failed to save matches'
      );
    }
  }
);

// ==========================================
// 4. USER PERMANENT DELETE
// ==========================================

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
