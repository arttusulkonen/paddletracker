// src/components/ControlPanel.tsx
'use client';

import { Card } from '@/components/ui/card';
import { useAuth } from '@/contexts/AuthContext';
import {
	LayoutGrid,
	User,
	Users,
	Warehouse
} from 'lucide-react';
import Link from 'next/link';
import React from 'react';
import { useTranslation } from 'react-i18next';

export const ControlPanel = () => {
  const { t } = useTranslation();
  const { user, userProfile } = useAuth();

  if (!user || !userProfile) return null;

  const isOrganizer =
    userProfile.accountType === 'coach' ||
    userProfile.roles?.includes('coach');

  const navItems = [
    {
      href: '/rooms',
      label: t('All Rooms'),
      icon: <LayoutGrid className='h-6 w-6 text-primary' />,
      description: t('Browse and join game rooms'),
      bgHover: 'group-hover:bg-primary/10',
    },
    {
      href: '/manage/communities',
      label: t('Communities'),
      icon: <Warehouse className='h-6 w-6 text-indigo-500' />,
      description: t('Find or create player groups'),
      bgHover: 'group-hover:bg-indigo-500/10',
    },
  ];

  if (isOrganizer) {
    navItems.push({
      href: '/manage/players',
      label: t('My Players'),
      icon: <Users className='h-6 w-6 text-emerald-500' />,
      description: t('Manage your ghost players'),
      bgHover: 'group-hover:bg-emerald-500/10',
    });
  } else {
    navItems.push({
      href: `/profile/${user.uid}`,
      label: t('My Profile'),
      icon: <User className='h-6 w-6 text-blue-500' />,
      description: t('View your stats and history'),
      bgHover: 'group-hover:bg-blue-500/10',
    });
  }

  return (
    <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 animate-in fade-in slide-in-from-bottom-4 duration-700'>
      {navItems.map((item) => (
        <Link key={item.href} href={item.href} className='group block h-full'>
          <Card className='h-full p-6 flex items-center gap-5 transition-all duration-300 border-0 rounded-[2rem] glass-panel shadow-sm hover:shadow-xl hover:-translate-y-1 relative overflow-hidden'>
            <div className={`absolute inset-0 transition-opacity duration-300 opacity-0 group-hover:opacity-100 ${item.bgHover}`} />
            
            <div className='relative p-4 rounded-2xl bg-background/80 backdrop-blur-sm ring-1 ring-black/5 dark:ring-white/10 shadow-sm group-hover:scale-110 transition-transform duration-300 ease-out z-10'>
              {item.icon}
            </div>
            
            <div className="relative z-10">
              <div className='font-bold text-lg mb-1 tracking-tight text-foreground transition-colors'>
                {item.label}
              </div>
              <div className='text-sm text-muted-foreground font-light leading-snug'>
                {item.description}
              </div>
            </div>
          </Card>
        </Link>
      ))}
    </div>
  );
};