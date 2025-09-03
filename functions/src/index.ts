import * as admin from "firebase-admin";
import { HttpsError, onCall } from "firebase-functions/v2/https";

admin.initializeApp();

const db = admin.firestore();
const auth = admin.auth();
const storage = admin.storage();

const collectionsToScan = {
  rooms: ["pingpong-rooms", "tennis-rooms", "badminton-rooms"],
  matches: ["matches-pingpong", "matches-tennis", "matches-badminton"],
  tournaments: [
    "tournaments-pingpong",
    "tournaments-tennis",
    "tournaments-badminton",
  ],
};

// Определяем типы, чтобы избавиться от `any`
interface Member {
  userId: string;
  name?: string;
  displayName?: string;
  email?: string;
  photoURL?: string | null;
}

interface Participant {
  userId: string;
  name?: string;
}

interface Match {
  player1?: Participant;
  player2?: Participant;
}

interface Round {
  matches: Match[];
}

/**
 * Получает ID супер админов из документа 'config/app'.
 * @return {Promise<string[]>} Массив UID супер админов.
 */
async function getSuperAdminIds(): Promise<string[]> {
  try {
    const docRef = db.collection("config").doc("app");
    const docSnap = await docRef.get();
    if (docSnap.exists) {
      const data = docSnap.data();
      if (data && Array.isArray(data.superAdminIds)) {
        return data.superAdminIds;
      }
    }
    return [];
  } catch (error) {
    console.error("Error fetching super admin IDs:", error);
    return [];
  }
}

export const permanentlyDeleteUser = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "You must be logged in.");
  }

  const {userId: userIdToDelete} = request.data;
  const {uid: callingUid} = request.auth;
  const anonymizedName = "Deleted User";

  const superAdminIds = await getSuperAdminIds();
  const isSuperAdmin = superAdminIds.includes(callingUid);

  if (!isSuperAdmin && callingUid !== userIdToDelete) {
    throw new HttpsError("permission-denied", "You don't have permission.");
  }

  const userDoc = await db.collection("users").doc(userIdToDelete).get();
  if (!userDoc.exists) {
    await auth
      .deleteUser(userIdToDelete)
      .catch((e) =>
        console.error(
          `Auth user ${userIdToDelete} likely already deleted.`,
          e.message
        )
      );
    return {success: true, message: "User already deleted."};
  }
  const originalName = userDoc.data()?.name || userDoc.data()?.displayName;

  try {
    const batch = db.batch();

    for (const collection of collectionsToScan.rooms) {
      const snapshot = await db
        .collection(collection)
        .where("memberIds", "array-contains", userIdToDelete)
        .get();
      snapshot.forEach((doc) => {
        const data = doc.data();
        const updates: { [key: string]: any } = {};
        updates.members = data.members.map((member: Member) =>
          member.userId === userIdToDelete ?
            {
              ...member,
              name: anonymizedName,
              displayName: anonymizedName,
              email: `deleted-${userIdToDelete}@deleted.com`,
              photoURL: null,
            } :
            member
        );
        updates.memberIds = data.memberIds.filter(
          (id: string) => id !== userIdToDelete
        );
        if (data.creator === userIdToDelete) {
          updates.creatorName = anonymizedName;
        }
        batch.update(doc.ref, updates);
      });
    }

    for (const collection of collectionsToScan.matches) {
      const snapshot = await db
        .collection(collection)
        .where("players", "array-contains", userIdToDelete)
        .get();
      snapshot.forEach((doc) => {
        const data = doc.data();
        const updates: { [key: string]: any } = {};
        if (data.player1Id === userIdToDelete) {
          updates["player1.name"] = anonymizedName;
        }
        if (data.player2Id === userIdToDelete) {
          updates["player2.name"] = anonymizedName;
        }
        if (data.winner === originalName) {
          updates.winner = anonymizedName;
        }
        if (Object.keys(updates).length > 0) {
          batch.update(doc.ref, updates);
        }
      });
    }

    for (const collection of collectionsToScan.tournaments) {
      const snapshot = await db
        .collection(collection)
        .where("participantsIds", "array-contains", userIdToDelete)
        .get();
      snapshot.forEach((doc) => {
        const data = doc.data();
        const updates: { [key: string]: any } = {};

        if (data.participants) {
          updates.participants = data.participants.map((p: Participant) =>
            p.userId === userIdToDelete ? {...p, name: anonymizedName} : p
          );
        }
        if (data.finalStats) {
          updates.finalStats = data.finalStats.map((s: Participant) =>
            s.userId === userIdToDelete ? {...s, name: anonymizedName} : s
          );
        }
        if (data.champion?.userId === userIdToDelete) {
          updates.champion = {...data.champion, name: anonymizedName};
        }
        if (data.rounds) {
          updates.rounds = data.rounds.map((round: Round) => ({
            ...round,
            matches: round.matches.map((match: Match) => {
              if (match.player1 && match.player1.userId === userIdToDelete) {
                match.player1.name = anonymizedName;
              }
              if (match.player2?.userId === userIdToDelete && match.player2) {
                match.player2.name = anonymizedName;
              }
              return match;
            }),
          }));
        }
        batch.update(doc.ref, updates);
      });
    }

    const friendsSnapshot = await db
      .collection("users")
      .where("friends", "array-contains", userIdToDelete)
      .get();
    friendsSnapshot.forEach((userDoc) => {
      batch.update(userDoc.ref, {
        friends: admin.firestore.FieldValue.arrayRemove(userIdToDelete),
      });
    });

    await batch.commit();

    await storage
      .bucket()
      .deleteFiles({prefix: `avatars/${userIdToDelete}`})
      .catch((e) => console.error("Storage cleanup failed:", e.message));

    await db.collection("users").doc(userIdToDelete).delete();

    await auth.deleteUser(userIdToDelete);

    return {success: true, message: "User permanently deleted."};
  } catch (error) {
    console.error("Error deleting user:", error);
    throw new HttpsError("internal", "An error occurred.", error);
  }
});
