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
    let unsubProfile: () => void = () => {};
    let unsubRoomRequests: () => void = () => {};

    const unsubscribeAuth = onAuthStateChanged(auth, (firebaseUser) => {
      unsubProfile();
      unsubRoomRequests();

      if (firebaseUser) {
        setUser(firebaseUser);

        // Слушатель для профиля пользователя
        const userRef = doc(db, 'users', firebaseUser.uid);
        unsubProfile = onSnapshot(
          userRef,
          async (snap) => {
            if (snap.exists()) {
              setUserProfile({ uid: snap.id, ...snap.data() } as UserProfile);
            } else {
              // Создаем профиль, если его нет
              const initialData: UserProfile = {
                uid: firebaseUser.uid,
                email: firebaseUser.email!,
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
            setLoading(false); // Завершаем загрузку ТОЛЬКО после получения профиля
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

        // Слушатель для запросов в комнаты
        const ownedRoomsQuery = query(
          collection(db, 'rooms'),
          where('creator', '==', firebaseUser.uid)
        );
        unsubRoomRequests = onSnapshot(ownedRoomsQuery, (snapshot) => {
          let totalRequests = 0;
          snapshot.forEach((doc) => {
            const room = doc.data();
            if (room.joinRequests && Array.isArray(room.joinRequests)) {
              totalRequests += room.joinRequests.length;
            }
          });
          setRoomRequestCount(totalRequests);
        });
      } else {
        // Если пользователя нет
        setUser(null);
        setUserProfile(null);
        setRoomRequestCount(0);
        setLoading(false);
      }
    });

    // Отписка при размонтировании компонента
    return () => {
      unsubscribeAuth();
      unsubProfile();
      unsubRoomRequests();
    };
  }, [toast]); // Зависимость только от toast

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
