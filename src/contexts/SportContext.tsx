'use client';

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

// ✅ НОВЫЕ ИКОНКИ ДЛЯ СПОРТА
const PingPongIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg
    viewBox='0 0 24 24'
    fill='none'
    stroke='currentColor'
    strokeWidth='1.5'
    strokeLinecap='round'
    strokeLinejoin='round'
    {...props}
  >
    <path d='M15.11 10.11c-.9-.9-.9-2.32 0-3.22.9-.9 2.32-.9 3.22 0 .47.47.68 1.12.58 1.7-.12.93-.73 1.72-1.54 2.01' />
    <path d='M12.66 12.65a3.68 3.68 0 0 1-5.2 0 3.68 3.68 0 0 1 0-5.2 3.68 3.68 0 0 1 5.2 0' />
    <path d='M10.23 10.22 5.66 14.79a2 2 0 0 0 0 2.83 2 2 0 0 0 2.83 0l4.57-4.57' />
  </svg>
);

const TennisIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg
    viewBox='0 0 64 64'
    fill='currentColor'
    stroke='currentColor'
    strokeWidth='0'
    {...props}
  >
    <path d='M32 2C15.432 2 2 15.432 2 32s13.432 30 30 30 30-13.432 30-30S48.568 2 32 2zm18.39 12.54c-3.32-3.32-6.05-4.14-8.91-3.7-1.46.22-2.92.79-4.29 1.62-1.37.84-2.65 1.88-3.8 3.04-1.15 1.15-2.2 2.43-3.04 3.8-1.67 2.75-2.31 5.38-1.9 8.24.41 2.86 1.82 5.51 4.34 8.03s5.17 3.93 8.03 4.34c2.86.41 5.49-.23 8.24-1.9 1.37-.84 2.65-1.88 3.8-3.04 1.15-1.15 2.2-2.43 3.04-3.8.83-1.37 1.4-2.83 1.62-4.29.44-2.86-.38-5.59-3.7-8.91z' />
  </svg>
);

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
    icon: <PingPongIcon className='h-6 w-6' />,
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
    icon: <TennisIcon className='h-6 w-6 text-lime-500' />,
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
