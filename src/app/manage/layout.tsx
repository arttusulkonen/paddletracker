// src/app/manage/layout.tsx
'use client';

import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import {
	Building2,
	Ghost,
	Info,
	LayoutDashboard,
	Users,
	Warehouse,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslation } from 'react-i18next';

export default function ManageLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const { t } = useTranslation();

  const navLinks = [
    {
      href: '/manage/communities',
      label: t('Communities'),
      icon: <Warehouse className='h-4 w-4' />,
      desc: t('Manage your clubs & groups'),
    },
    {
      href: '/manage/players',
      label: t('Ghost Profiles'),
      icon: <Ghost className='h-4 w-4' />,
      desc: t('Manage offline/unregistered players'),
    },
    {
      href: '/manage/members',
      label: t('Member Database'),
      icon: <Users className='h-4 w-4' />,
      desc: t('View all players across your groups'),
    },
  ];

  return (
    <div className='container mx-auto py-8 max-w-7xl px-4 min-h-screen'>
      {/* Header Section */}
      <div className='flex flex-col mb-8'>
        <div className='flex items-center gap-3 mb-2'>
          <div className='p-2 bg-primary/10 rounded-lg'>
            <LayoutDashboard className='h-6 w-6 text-primary' />
          </div>
          <h1 className='text-3xl font-extrabold tracking-tight'>
            {t('Organizer Hub')}
          </h1>
        </div>
        <p className='text-muted-foreground text-lg max-w-2xl'>
          {t(
            'Centralize your sports management. Create communities to group rooms and players together.'
          )}
        </p>
      </div>

      <Separator className='mb-8' />

      <div className='flex flex-col lg:flex-row gap-8'>
        {/* Sidebar Navigation */}
        <aside className='lg:w-1/4 xl:w-1/5 flex flex-col gap-6'>
          <nav className='flex flex-row lg:flex-col gap-2 overflow-x-auto pb-2 lg:pb-0'>
            {navLinks.map((link) => {
              const isActive = pathname.startsWith(link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={cn(
                    'flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium transition-all whitespace-nowrap lg:whitespace-normal',
                    isActive
                      ? 'bg-primary text-primary-foreground shadow-md'
                      : 'bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground'
                  )}
                >
                  <span className={cn(isActive ? 'text-white' : 'text-primary')}>
                    {link.icon}
                  </span>
                  <div className='flex flex-col items-start'>
                    <span className='font-bold'>{link.label}</span>
                    <span
                      className={cn(
                        'text-[10px] font-normal opacity-80 hidden md:block',
                        isActive ? 'text-primary-foreground/80' : ''
                      )}
                    >
                      {link.desc}
                    </span>
                  </div>
                </Link>
              );
            })}
          </nav>

          {/* Educational Card - Explains WHY Communities exist */}
          <Card className='hidden lg:block bg-blue-50/50 dark:bg-blue-950/10 border-blue-100 dark:border-blue-900'>
            <CardHeader className='pb-2'>
              <CardTitle className='text-sm font-bold flex items-center gap-2 text-blue-700 dark:text-blue-400'>
                <Info className='h-4 w-4' />
                {t('Why create a Community?')}
              </CardTitle>
            </CardHeader>
            <CardContent className='text-xs text-muted-foreground space-y-3'>
              <div className='flex gap-2 items-start'>
                <Building2 className='h-3.5 w-3.5 mt-0.5 shrink-0 text-blue-500' />
                <p>
                  {t(
                    'Group multiple rooms (e.g., "Ping Pong", "Tennis") under one organization (e.g., "My Company").'
                  )}
                </p>
              </div>
              <div className='flex gap-2 items-start'>
                <Users className='h-3.5 w-3.5 mt-0.5 shrink-0 text-blue-500' />
                <p>
                  {t(
                    'Invite players once to the Community, and they get access to all linked rooms automatically.'
                  )}
                </p>
              </div>
              <div className='flex gap-2 items-start'>
                <Ghost className='h-3.5 w-3.5 mt-0.5 shrink-0 text-blue-500' />
                <p>
                  {t(
                    'Manage "Ghost Players" (people without accounts) centrally for all your tournaments.'
                  )}
                </p>
              </div>
            </CardContent>
          </Card>
        </aside>

        {/* Main Content */}
        <main className='flex-1 min-w-0'>
          {children}
        </main>
      </div>
    </div>
  );
}