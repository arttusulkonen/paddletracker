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
  arrayUnion,
  collection,
  doc,
  onSnapshot,
  query,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import React, {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useState,
} from 'react';

interface AuthContextType {
  user: FirebaseUser | null;
  roomRequestCount: number;
  userProfile: UserProfile | null;
  loading: boolean;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [roomRequestCount, setRoomRequestCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      if (!firebaseUser) {
        setUserProfile(null);
        setLoading(false);
      } else {
        setLoading(true);
      }
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!user || !db) return;

    const userRef = doc(db, 'users', user.uid);
    const unsubProfile = onSnapshot(
      userRef,
      async (snap) => {
        if (snap.exists()) {
          setUserProfile({ uid: snap.id, ...snap.data() } as UserProfile);
        } else {
          const initialData: UserProfile = {
            uid: user.uid,
            email: user.email!,
            displayName: user.displayName || 'New Player',
            name: user.displayName || 'New Player',
            globalElo: 1000,
            matchesPlayed: 0,
            wins: 0,
            losses: 0,
            maxRating: 1000,
            createdAt: getFinnishFormattedDate(),
            photoURL: user.photoURL || null,
            eloHistory: [{ date: getFinnishFormattedDate(), elo: 1000 }],
            friends: [],
            incomingRequests: [],
            outgoingRequests: [],
            achievements: [],
            rooms: [],
            isPublic: true,
            bio: '',
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

    const ownedRoomsQuery = query(
      collection(db, 'rooms'),
      where('creator', '==', user.uid)
    );
    const unsubRoomRequests = onSnapshot(ownedRoomsQuery, (snapshot) => {
      let totalRequests = 0;
      snapshot.forEach((doc) => {
        const room = doc.data();
        if (room.joinRequests && Array.isArray(room.joinRequests)) {
          totalRequests += room.joinRequests.length;
        }
      });
      setRoomRequestCount(totalRequests);
    });

    return () => {
      unsubProfile();
      unsubRoomRequests();
    };
  }, [user, toast]);

  const logout = async () => {
    try {
      await signOut(auth);
      setUser(null);
      setUserProfile(null);
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

  return (
    <AuthContext.Provider
      value={{ user, userProfile, roomRequestCount, loading, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
