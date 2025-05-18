// src/contexts/AuthContext.tsx
"use client";

import { useToast } from "@/hooks/use-toast";
import { auth, db } from "@/lib/firebase";
import type { UserProfile } from "@/lib/types";
import { getFinnishFormattedDate } from '@/lib/utils';
import {
  User as FirebaseUser,
  onAuthStateChanged,
  signOut,
} from "firebase/auth";
import {
  arrayUnion,
  doc,
  onSnapshot,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import React, {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useState,
} from "react";

interface AuthContextType {
  user: FirebaseUser | null;
  userProfile: UserProfile | null;
  loading: boolean;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  // 1) Listen for auth state changes
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      if (!firebaseUser) {
        // signed out
        setUserProfile(null);
        setLoading(false);
      } else {
        setLoading(true);
      }
    });
    return unsubscribe;
  }, []);

  // 2) When user signs in, subscribe to their Firestore profile
  useEffect(() => {
    if (!user) return;

    const userRef = doc(db, "users", user.uid);
    const unsubProfile = onSnapshot(
      userRef,
      async (snap) => {
        if (snap.exists()) {
          setUserProfile(snap.data() as UserProfile);
        } else {
          // first-time sign-in: create profile
          const baseProfile: Omit<UserProfile, "eloHistory"> = {
            uid: user.uid,
            email: user.email!,
            displayName: user.displayName || null,
            globalElo: 1000,
            matchesPlayed: 0,
            wins: 0,
            losses: 0,
            createdAt: getFinnishFormattedDate(),
          };
          const initialData = {
            ...baseProfile,
            photoURL: user.photoURL || null,
            eloHistory: [],
            friends: [],
            incomingRequests: [],
            outgoingRequests: [],
            achievements: [],
            rooms: [],
          };
          await setDoc(userRef, initialData);
          await updateDoc(userRef, {
            eloHistory: arrayUnion({
              date: getFinnishFormattedDate(),
              elo: 1000,
            }),
          });
          setUserProfile({
            ...initialData,
            eloHistory: [{ date: getFinnishFormattedDate(), elo: 1000 }],
          } as UserProfile);
        }
        setLoading(false);
      },
      (error) => {
        console.error("Profile listener error:", error);
        toast({
          title: "Error",
          description: "Failed to load profile.",
          variant: "destructive",
        });
        setLoading(false);
      }
    );

    return () => {
      unsubProfile();
    };
  }, [user, toast]);

  const logout = async () => {
    try {
      await signOut(auth);
      setUser(null);
      setUserProfile(null);
      toast({ title: "Logged out", description: "You have been logged out." });
    } catch (err) {
      console.error("Error logging out:", err);
      toast({
        title: "Logout Error",
        description: "Failed to log out.",
        variant: "destructive",
      });
    }
  };

  return (
    <AuthContext.Provider value={{ user, userProfile, loading, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}