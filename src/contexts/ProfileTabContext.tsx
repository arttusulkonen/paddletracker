'use client';

import type { Sport } from '@/lib/types';
import { createContext, ReactNode, useContext, useState } from 'react';

type ProfileTabContextType = {
  activeSportTab: Sport | null;
  setActiveSportTab: (sport: Sport | null) => void;
};

const ProfileTabContext = createContext<ProfileTabContextType | undefined>(
  undefined
);

export function ProfileTabProvider({ children }: { children: ReactNode }) {
  const [activeSportTab, setActiveSportTab] = useState<Sport | null>(null);

  return (
    <ProfileTabContext.Provider value={{ activeSportTab, setActiveSportTab }}>
      {children}
    </ProfileTabContext.Provider>
  );
}

export function useProfileTab() {
  const context = useContext(ProfileTabContext);
  if (context === undefined) {
    throw new Error('useProfileTab must be used within a ProfileTabProvider');
  }
  return context;
}
