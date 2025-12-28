// src/contexts/AuthContext.tsx
'use client';

import { useToast } from '@/hooks/use-toast';
import { auth, db } from '@/lib/firebase';
import type { UserProfile } from '@/lib/types';
import { getFinnishFormattedDate } from '@/lib/utils';
import {
	User as FirebaseUser,
	onAuthStateChanged,
	signOut,
} from 'firebase/auth';
import {
	collection,
	doc,
	getDoc,
	onSnapshot,
	query,
	setDoc,
	where,
} from 'firebase/firestore';
import React, {
	createContext,
	ReactNode,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useState,
} from 'react';

interface AuthContextType {
  user: FirebaseUser | null;
  userProfile: UserProfile | null;
  roomRequestCount: number;
  loading: boolean;
  isGlobalAdmin: boolean;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const ROOM_COLLECTIONS = ['rooms-pingpong', 'rooms-tennis', 'rooms-badminton'];

export function AuthProvider({ children }: { children: ReactNode }) {
  const { toast } = useToast();

  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [roomRequestCount, setRoomRequestCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [isGlobalAdmin, setIsGlobalAdmin] = useState(false);

  useEffect(() => {
    let unsubscribers: Array<() => void> = [];
    const requestsMap = new Map<string, number>();

    if (!auth) {
      setLoading(false);
      return;
    }

    const unsubscribeAuth = onAuthStateChanged(auth, async (firebaseUser) => {
      unsubscribers.forEach((u) => u());
      unsubscribers = [];
      requestsMap.clear();

      if (!firebaseUser) {
        setUser(null);
        setUserProfile(null);
        setIsGlobalAdmin(false);
        setRoomRequestCount(0);
        setLoading(false);
        return;
      }

      setUser(firebaseUser);

      try {
        const token = await firebaseUser.getIdTokenResult(true);
        let isAdmin = !!token.claims.admin;

        if (!isAdmin && db) {
          try {
            const appSnap = await getDoc(doc(db, 'config', 'app'));
            const ids = Array.isArray(appSnap.data()?.superAdminIds)
              ? (appSnap.data()!.superAdminIds as string[])
              : [];
            if (ids.includes(firebaseUser.uid)) {
              isAdmin = true;
            }
          } catch {
            // игнорируем ошибку чтения конфига
          }
        }
        setIsGlobalAdmin(isAdmin);
      } catch {
        setIsGlobalAdmin(false);
      }

      if (db) {
        const userRef = doc(db, 'users', firebaseUser.uid);
        const unsubProfile = onSnapshot(
          userRef,
          async (snap) => {
            if (snap.exists()) {
              setUserProfile({ uid: snap.id, ...(snap.data() as any) });
            } else {
              const initialData: UserProfile = {
                uid: firebaseUser.uid,
                email: firebaseUser.email || '',
                displayName: firebaseUser.displayName || 'New Player',
                name: firebaseUser.displayName || 'New Player',
                globalElo: 1000,
                matchesPlayed: 0,
                wins: 0,
                losses: 0,
                maxRating: 1000,
                createdAt: getFinnishFormattedDate(),
                photoURL: firebaseUser.photoURL || null,
                eloHistory: [{ date: getFinnishFormattedDate(), elo: 1000 }],
                friends: [],
                incomingRequests: [],
                outgoingRequests: [],
                achievements: [],
                rooms: [],
                isPublic: true,
                bio: '',
                isDeleted: false,
                approved: false,
                approvalReason: '',
                approvedAt: undefined,
                approvedBy: undefined,
              };
              await setDoc(userRef, initialData);
              setUserProfile(initialData);
            }
            setLoading(false);
          },
          (err) => {
            console.error('Profile subscription error:', err);
            setLoading(false);
          }
        );
        unsubscribers.push(unsubProfile);

        ROOM_COLLECTIONS.forEach((collName) => {
          if (!db) return;
          const ownedRoomsQuery = query(
            collection(db, collName),
            where('creator', '==', firebaseUser.uid)
          );

          const unsubRoom = onSnapshot(
            ownedRoomsQuery,
            (snapshot) => {
              let requests = 0;
              snapshot.forEach((d) => {
                const room = d.data() as any;
                if (Array.isArray(room.joinRequests)) {
                  requests += room.joinRequests.length;
                }
              });

              requestsMap.set(collName, requests);

              const total = Array.from(requestsMap.values()).reduce(
                (a, b) => a + b,
                0
              );
              setRoomRequestCount(total);
            },
            () => {
              requestsMap.set(collName, 0);
            }
          );
          unsubscribers.push(unsubRoom);
        });
      } else {
        setLoading(false);
      }
    });

    return () => {
      unsubscribeAuth();
      unsubscribers.forEach((u) => u());
    };
  }, [toast]);

  const logout = useCallback(async () => {
    if (!auth) return;
    try {
      await signOut(auth);
    } catch {
      // ignore logout errors
    }
  }, []);

  const value = useMemo<AuthContextType>(
    () => ({
      user,
      userProfile,
      roomRequestCount,
      loading,
      isGlobalAdmin,
      logout,
    }),
    [user, userProfile, roomRequestCount, loading, isGlobalAdmin, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
