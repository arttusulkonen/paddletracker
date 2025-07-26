'use client';

import { db } from '@/lib/firebase';
import { doc, updateDoc } from 'firebase/firestore';
import { Bot, Swords } from 'lucide-react';
import React, {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import { useAuth } from './AuthContext';

export type Sport = 'pingpong' | 'tennis';

export interface SportConfig {
  name: string;
  icon: React.ReactNode;
  collections: {
    rooms: string;
    matches: string;
    tournaments: string;
  };
  theme: {
    primary: string;
    gradientFrom: string;
    gradientTo: string;
  };
  validateScore: (
    score1: number,
    score2: number
  ) => { isValid: boolean; message?: string };
}

export const sportConfig: Record<Sport, SportConfig> = {
  pingpong: {
    name: 'Ping-Pong',
    icon: <Bot size={24} />,
    collections: {
      rooms: 'rooms',
      matches: 'matches-pingpong',
      tournaments: 'tournament-rooms',
    },
    theme: {
      primary: 'text-primary',
      gradientFrom: 'from-primary',
      gradientTo: 'to-blue-400',
    },
    validateScore: (score1, score2) => {
      const hi = Math.max(score1, score2);
      const lo = Math.min(score1, score2);
      const isValid = !(hi < 11 || (hi > 11 && hi - lo !== 2));
      return {
        isValid,
        message:
          'A ping-pong game is won by the first player to score 11 points with a 2-point margin.',
      };
    },
  },
  tennis: {
    name: 'Tennis',
    icon: <Swords size={24} />,
    collections: {
      rooms: 'rooms-tennis',
      matches: 'matches-tennis',
      tournaments: 'tournaments-tennis',
    },
    theme: {
      primary: 'text-yellow-500',
      gradientFrom: 'from-yellow-500',
      gradientTo: 'to-lime-500',
    },
    validateScore: (score1, score2) => {
      // Пример логики для тенниса (можно усложнить)
      const isValid =
        (score1 === 6 && score2 <= 4) ||
        (score2 === 6 && score1 <= 4) ||
        (score1 === 7 && (score2 === 5 || score2 === 6)) ||
        (score2 === 7 && (score1 === 5 || score1 === 6));
      return {
        isValid,
        message: 'Invalid tennis set score.',
      };
    },
  },
};

interface SportContextType {
  sport: Sport;
  setSport: (sport: Sport) => void;
  config: SportConfig;
  updateActiveSport: (sport: Sport) => Promise<void>;
}

const SportContext = createContext<SportContextType | undefined>(undefined);

export const SportProvider = ({ children }: { children: ReactNode }) => {
  const { user, userProfile } = useAuth();
  const [sport, setSport] = useState<Sport>('pingpong');

  useEffect(() => {
    if (userProfile?.activeSport) {
      setSport(userProfile.activeSport as Sport);
    }
  }, [userProfile]);

  const updateActiveSport = useCallback(
    async (newSport: Sport) => {
      setSport(newSport);
      if (user && db) {
        try {
          const userRef = doc(db, 'users', user.uid);
          await updateDoc(userRef, { activeSport: newSport });
        } catch (error) {
          console.error('Failed to update active sport:', error);
        }
      }
    },
    [user]
  );

  const value = {
    sport,
    setSport: updateActiveSport,
    config: sportConfig[sport],
    updateActiveSport,
  };

  return (
    <SportContext.Provider value={value}>{children}</SportContext.Provider>
  );
};

export const useSport = () => {
  const context = useContext(SportContext);
  if (context === undefined) {
    throw new Error('useSport must be used within a SportProvider');
  }
  return context;
};
