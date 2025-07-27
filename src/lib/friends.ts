import { arrayRemove, arrayUnion, collection, doc, getDoc, getDocs, query, updateDoc, where } from "firebase/firestore";
import { db } from "./firebase";

export async function sendFriendRequest(fromUid: string, toUid: string) {
  if (fromUid === toUid) return;
  await Promise.all([
    updateDoc(doc(db, "users", fromUid), { outgoingRequests: arrayUnion(toUid) }),
    updateDoc(doc(db, "users", toUid), { incomingRequests: arrayUnion(fromUid) })
  ]);
}

export async function cancelRequest(fromUid: string, toUid: string) {
  await Promise.all([
    updateDoc(doc(db, "users", fromUid), { outgoingRequests: arrayRemove(toUid) }),
    updateDoc(doc(db, "users", toUid), { incomingRequests: arrayRemove(fromUid) })
  ]);
}

export async function acceptRequest(myUid: string, fromUid: string) {
  await Promise.all([
    updateDoc(doc(db, "users", myUid), {
      incomingRequests: arrayRemove(fromUid),
      friends: arrayUnion(fromUid)
    }),
    updateDoc(doc(db, "users", fromUid), {
      outgoingRequests: arrayRemove(myUid),
      friends: arrayUnion(myUid)
    })
  ]);
}

export async function declineRequest(myUid: string, fromUid: string) {
  await cancelRequest(fromUid, myUid);
}

export const rejectRequest = declineRequest;

export async function unfriend(uidA: string, uidB: string) {
  await Promise.all([
    updateDoc(doc(db, "users", uidA), { friends: arrayRemove(uidB) }),
    updateDoc(doc(db, "users", uidB), { friends: arrayRemove(uidA) })
  ]);
}

export async function getUserLite(uid: string): Promise<(UserProfile & { uid: string }) | null> {
  const snap = await getDoc(doc(db, "users", uid));
  if (!snap.exists() || snap.data()?.isDeleted) return null;
  return { uid, ...(snap.data() as UserProfile) };
}

export function toggleFriend(uid: string, targetUid: string, targetProfile: UserProfile): void {
  throw new Error('Function not implemented.');
}

/**
 * NEW FUNCTION: Efficiently fetches multiple lightweight user profiles.
 * @param uids - An array of user IDs to fetch.
 * @returns A promise that resolves to an array of user profiles.
 */
export async function getMultipleUsersLite(uids: string[]): Promise<(UserProfile & { uid: string })[]> {
  if (!uids || uids.length === 0) {
    return [];
  }
  // Firestore 'in' query is limited to 30 items per query.
  const chunks = [];
  for (let i = 0; i < uids.length; i += 30) {
    chunks.push(uids.slice(i, i + 30));
  }

  const results: (UserProfile & { uid: string })[] = [];
  for (const chunk of chunks) {
    const q = query(collection(db, "users"), where("uid", "in", chunk));
    const snap = await getDocs(q);
    snap.forEach((doc) => {
      if (!doc.data().isDeleted) {
        results.push({ uid: doc.id, ...(doc.data() as UserProfile) });
      }
    });
  }
  return results;
}
