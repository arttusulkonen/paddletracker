// src/contexts/AuthContext.tsx
"use client";

import { useToast } from "@/hooks/use-toast";
import { auth, db } from "@/lib/firebase";
import type { UserProfile } from "@/lib/types";
import { getFinnishFormattedDate } from "@/lib/utils";
import { User as FirebaseUser, onAuthStateChanged, signOut } from "firebase/auth";
import {
  arrayUnion,
  doc,
  getDoc,
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

  useEffect(() => {
    setLoading(true);
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        setUser(firebaseUser);
        const userRef = doc(db, "users", firebaseUser.uid);
        const snap = await getDoc(userRef);
        if (snap.exists()) {
          setUserProfile(snap.data() as UserProfile);
        } else {
          const baseProfile: Omit<UserProfile, "eloHistory"> = {
            uid: firebaseUser.uid,
            email: firebaseUser.email!,
            displayName: firebaseUser.displayName || undefined,
            globalElo: 1000,
            matchesPlayed: 0,
            wins: 0,
            losses: 0,
            createdAt: getFinnishFormattedDate(),
          };
          const initialData = firebaseUser.photoURL
            ? { ...baseProfile, photoURL: firebaseUser.photoURL, eloHistory: [] }
            : { ...baseProfile, eloHistory: [] };
          await setDoc(userRef, initialData);
          await updateDoc(userRef, {
            eloHistory: arrayUnion({
              date: getFinnishFormattedDate(),
              elo: 1000,
            }),
          });
          setUserProfile({
            ...baseProfile,
            eloHistory: [{ date: getFinnishFormattedDate(), elo: 1000 }],
          } as any);
        }
      } else {
        setUser(null);
        setUserProfile(null);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, [toast]);

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