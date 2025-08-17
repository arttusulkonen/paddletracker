// src/contexts/SportContext.tsx
'use client';

import BadmintonIcon from '@/icons/icon500-badminton.svg';
import TableTennisIcon from '@/icons/icon500-pingpong.svg';
import TennisIcon from '@/icons/icon500-tennis.svg';
import { db } from '@/lib/firebase';
import { doc, updateDoc } from 'firebase/firestore';
import React, {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import { useAuth } from './AuthContext';

export type Sport = 'pingpong' | 'tennis' | 'badminton';

export interface SportConfig {
  name: string;
  icon: React.ReactNode;
  brandIcon?: string;
  brandLogo: string;
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
    icon: (
      <TableTennisIcon className='h-6 w-6 shrink-0 text-primary' aria-hidden />
    ),
    brandLogo: '/brand/logo500-pingpong-png.png',
     brandIcon: '/brand/icon500-pingpong-png.png',
    collections: {
      rooms: 'rooms-pingpong',
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
    icon: <TennisIcon className='h-6 w-6 shrink-0 text-primary' aria-hidden />,
    brandLogo: '/brand/logo500-tennis-png.png',
    brandIcon: '/brand/icon500-tennis-png.png',
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
  badminton: {
    name: 'Badminton',
    icon: (
      <BadmintonIcon
        className='h-6 w-6 shrink-0 text-primary'
        aria-hidden
      />
    ),
    brandLogo: '/brand/logo500-badminton-png.png',
    brandIcon: '/brand/icon500-badminton-png.png',
    collections: {
      rooms: 'rooms-badminton',
      matches: 'matches-badminton',
      tournaments: 'tournaments-badminton',
    },
    theme: {
      primary: 'text-teal-500',
      gradientFrom: 'from-teal-500',
      gradientTo: 'to-cyan-500',
    },
    validateScore: (score1, score2) => {
      const hi = Math.max(score1, score2);
      const lo = Math.min(score1, score2);
      const isValid = hi >= 21 && hi - lo >= 2;
      return {
        isValid,
        message:
          'A badminton game is won by the first player to score 21 points with a 2-point margin.',
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
  const [sport, setSportState] = useState<Sport>(
    (userProfile?.activeSport as Sport) || 'pingpong'
  );

  useEffect(() => {
    if (userProfile?.activeSport) {
      setSportState(userProfile.activeSport as Sport);
    }
  }, [userProfile]);

  const updateActiveSport = useCallback(
    async (newSport: Sport) => {
      setSportState(newSport);
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
