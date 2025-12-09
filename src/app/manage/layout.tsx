// src/app/manage/layout.tsx
'use client';

import { cn } from '@/lib/utils';
import { Briefcase, Users, Warehouse } from 'lucide-react';
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
      href: '/manage/players',
      label: t('My Players'),
      icon: <Users className='h-4 w-4' />,
      desc: t('Ghosts & Invites'),
    },
    {
      href: '/manage/communities',
      label: t('Communities'),
      icon: <Warehouse className='h-4 w-4' />,
      desc: t('Groups & Clubs'),
    },
    // Можно добавить в будущем:
    // { href: '/manage/coaches', label: t('Coaches'), ... }
  ];

  return (
    <div className='container mx-auto py-6 max-w-7xl'>
      <div className='flex flex-col mb-8'>
        <h1 className='text-3xl font-bold tracking-tight'>
          {t('Management Console')}
        </h1>
        <p className='text-muted-foreground'>
          {t('Manage your players, groups, and coaching activities.')}
        </p>
      </div>

      <div className='flex flex-col lg:flex-row gap-8'>
        <aside className='lg:w-1/5'>
          <nav className='flex flex-row lg:flex-col gap-2 overflow-x-auto pb-2'>
            {navLinks.map((link) => {
              const isActive = pathname.startsWith(link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={cn(
                    'flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium transition-all whitespace-nowrap',
                    isActive
                      ? 'bg-primary/10 text-primary shadow-sm'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  )}
                >
                  {link.icon}
                  <div className='flex flex-col items-start'>
                    <span>{link.label}</span>
                    <span className='text-[10px] font-normal opacity-70 hidden md:block'>
                      {link.desc}
                    </span>
                  </div>
                </Link>
              );
            })}
          </nav>
        </aside>
        <main className='flex-1 min-w-0'>{children}</main>
      </div>
    </div>
  );
}
