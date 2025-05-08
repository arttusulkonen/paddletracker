"use client";

import type { User as FirebaseUser } from 'firebase/auth';
import { auth, db } from '@/lib/firebase';
import type { UserProfile } from '@/lib/types';
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { onAuthStateChanged, signOut } from 'firebase/auth'; // Removed User type import as it's not directly used here
import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { useToast } from '@/hooks/use-toast';

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
    if (!auth) { // Check if Firebase Auth instance is available
      console.warn("Firebase Auth is not available or not initialized. User authentication features will be disabled.");
      setUser(null);
      setUserProfile(null);
      setLoading(false);
      return () => {}; // Return an empty cleanup function
    }

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        setUser(firebaseUser);
        const userRef = doc(db, "users", firebaseUser.uid);
        const userSnap = await getDoc(userRef);
        if (userSnap.exists()) {
          setUserProfile(userSnap.data() as UserProfile);
        } else {
          const newUserProfile: UserProfile = {
            uid: firebaseUser.uid,
            email: firebaseUser.email,
            displayName: firebaseUser.displayName,
            photoURL: firebaseUser.photoURL,
            globalElo: 1000,
            matchesPlayed: 0,
            wins: 0,
            losses: 0,
            createdAt: serverTimestamp() as any,
            eloHistory: [{ date: serverTimestamp() as any, elo: 1000 }],
          };
          try {
            await setDoc(userRef, newUserProfile);
            setUserProfile(newUserProfile);
          } catch (error) {
            console.error("Error creating user profile in Firestore:", error);
            // Handle profile creation error if necessary
          }
        }
      } else {
        setUser(null);
        setUserProfile(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []); // Effect runs once on mount

  const logout = async () => {
    if (!auth) { // Check if Firebase Auth instance is available
      toast({ title: "Logout Error", description: "Firebase Auth not available. Cannot log out.", variant: "destructive" });
      return;
    }
    try {
      await signOut(auth);
      setUser(null);
      setUserProfile(null);
      toast({ title: "Logged out", description: "You have been successfully logged out." });
    } catch (error) {
      console.error("Error logging out:", error);
      toast({ title: "Logout Error", description: "Failed to log out. Please try again.", variant: "destructive" });
    }
  };

  const value = { user, userProfile, loading, logout };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
