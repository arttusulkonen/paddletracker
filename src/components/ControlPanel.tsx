'use client';

import { Card } from '@/components/ui/card';
import { useAuth } from '@/contexts/AuthContext';
import {
	Briefcase,
	Globe,
	LayoutGrid,
	Search,
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
      icon: <LayoutGrid className='h-5 w-5 text-primary' />,
      description: t('Browse and join game rooms'),
    },
    {
      href: '/manage/communities',
      label: t('Communities'),
      icon: <Warehouse className='h-5 w-5 text-indigo-500' />,
      description: t('Find or create player groups'),
    },
  ];

  if (isOrganizer) {
    navItems.push({
      href: '/manage/players',
      label: t('My Players'),
      icon: <Users className='h-5 w-5 text-emerald-500' />,
      description: t('Manage your ghost players'),
    });
  } else {
    navItems.push({
      href: `/profile/${user.uid}`,
      label: t('My Profile'),
      icon: <User className='h-5 w-5 text-blue-500' />,
      description: t('View your stats and history'),
    });
  }

  return (
    <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 animate-in fade-in slide-in-from-bottom-2 duration-700'>
      {navItems.map((item) => (
        <Link key={item.href} href={item.href} className='group'>
          <Card className='h-full p-4 flex items-center gap-4 transition-all duration-200 hover:shadow-md hover:border-primary/50 border-muted bg-card/50'>
            <div className='p-3 rounded-full bg-background border shadow-sm group-hover:scale-110 transition-transform duration-200'>
              {item.icon}
            </div>
            <div>
              <div className='font-semibold text-sm group-hover:text-primary transition-colors'>
                {item.label}
              </div>
              <div className='text-xs text-muted-foreground'>
                {item.description}
              </div>
            </div>
          </Card>
        </Link>
      ))}
    </div>
  );
};