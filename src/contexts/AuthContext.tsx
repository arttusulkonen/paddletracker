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
  onSnapshot,
  query,
  setDoc,
  where,
} from 'firebase/firestore';
import React, {
  createContext,
  ReactNode,
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
    const unsubscribers: Array<() => void> = [];

    const unsubscribeAuth = onAuthStateChanged(auth, async (firebaseUser) => {
      unsubscribers.forEach((u) => u());
      unsubscribers.length = 0;

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
        setIsGlobalAdmin(!!token.claims.admin);
      } catch {
        setIsGlobalAdmin(false);
      }

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
            };
            await setDoc(userRef, initialData);
            setUserProfile(initialData);
          }
          setLoading(false);
        },
        (error) => {
          console.error('Profile listener error:', error);
          toast({
            title: 'Error',
            description: 'Failed to load profile.',
            variant: 'destructive',
          });
          setLoading(false);
        }
      );
      unsubscribers.push(unsubProfile);

      const unsubsRooms = ROOM_COLLECTIONS.map((collName) => {
        const ownedRoomsQuery = query(
          collection(db, collName),
          where('creator', '==', firebaseUser.uid)
        );
        return onSnapshot(
          ownedRoomsQuery,
          (snapshot) => {
            let requests = 0;
            snapshot.forEach((d) => {
              const room = d.data() as any;
              if (Array.isArray(room.joinRequests)) {
                requests += room.joinRequests.length;
              }
            });
            setRoomRequestCount((prev) => {
              return prev;
            });
          },
          (err) => {
            console.warn(`Room listener error for ${collName}:`, err);
          }
        );
      });

      unsubsRooms.forEach((u) => u());
      const accurateUnsubs = ROOM_COLLECTIONS.map((collName) => {
        const ownedRoomsQuery = query(
          collection(db, collName),
          where('creator', '==', firebaseUser.uid)
        );
        return onSnapshot(
          ownedRoomsQuery,
          (snapshot) => {
            let requests = 0;
            snapshot.forEach((d) => {
              const room = d.data() as any;
              if (Array.isArray(room.joinRequests)) {
                requests += room.joinRequests.length;
              }
            });

            perCollCounts.current.set(collName, requests);
            const total = Array.from(perCollCounts.current.values()).reduce(
              (a, b) => a + b,
              0
            );
            setRoomRequestCount(total);
          },
          (err) => {
            console.warn(`Room listener error for ${collName}:`, err);
            perCollCounts.current.delete(collName);
            const total = Array.from(perCollCounts.current.values()).reduce(
              (a, b) => a + b,
              0
            );
            setRoomRequestCount(total);
          }
        );
      });

      unsubscribers.push(...accurateUnsubs);
    });

    const perCollCounts = { current: new Map<string, number>() };

    return () => {
      unsubscribeAuth();
      unsubscribers.forEach((u) => u());
    };
  }, [toast]);

  const logout = async () => {
    try {
      await signOut(auth);
      toast({ title: 'Logged out', description: 'You have been logged out.' });
    } catch (err) {
      console.error('Error logging out:', err);
      toast({
        title: 'Logout Error',
        description: 'Failed to log out.',
        variant: 'destructive',
      });
    }
  };

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
