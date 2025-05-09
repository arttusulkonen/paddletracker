import { arrayRemove, arrayUnion, doc, getDoc, updateDoc } from "firebase/firestore";
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

export async function getUserLite(uid: string) {
  const snap = await getDoc(doc(db, "users", uid));
  if (!snap.exists()) return null;
  return { uid, ...(snap.data() as any) };
}