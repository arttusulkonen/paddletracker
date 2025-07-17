// src/components/layout/Navbar.tsx

'use client';

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui';
import { useAuth } from '@/contexts/AuthContext';
import {
  Bell,
  Globe,
  HomeIcon,
  LogIn,
  TrophyIcon,
  UserCircle,
  UserPlus,
  UsersIcon,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

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

export function Navbar() {
  const { t, i18n } = useTranslation();
  const { user, userProfile, loading, logout } = useAuth();
  const router = useRouter();

  // highlight-start
  // 2. Добавляем состояние для отслеживания монтирования
  const [hasMounted, setHasMounted] = useState(false);

  // 3. Устанавливаем состояние в true только на клиенте
  useEffect(() => {
    setHasMounted(true);
  }, []);
  // highlight-end

  const handleLogout = async () => {
    await logout();
    router.push('/');
  };

  const reqCount = userProfile?.incomingRequests?.length ?? 0;
  const visibleName = user?.displayName ?? user?.name;

  const changeLanguage = (lng: string) => {
    i18n.changeLanguage(lng);
  };

  if (!hasMounted) {
    return null;
  }

  return (
    <header className='bg-card border-b sticky top-0 z-50 shadow-sm'>
      <div className='container mx-auto px-4 h-16 flex items-center justify-between'>
        <Link
          href='/'
          className='flex items-center gap-2 text-primary hover:text-primary/80'
        >
          <PingPongIcon className='h-8 w-8' />
          <h1 className='text-2xl font-bold'>PingPongTracker</h1>
        </Link>

        <nav className='flex items-center gap-2 sm:gap-4'>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant='ghost' size='icon'>
                <Globe className='h-5 w-5' />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align='end'>
              <DropdownMenuItem onClick={() => changeLanguage('en')}>
                English
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => changeLanguage('ru')}>
                Русский
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => changeLanguage('fi')}>
                Suomi
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => changeLanguage('ko')}>
                한국어
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Button variant='ghost' asChild>
            <Link href='/' className='flex items-center gap-1'>
              <HomeIcon size={18} /> {t('Home')}
            </Link>
          </Button>

          {user && (
            <>
              <Button variant='ghost' asChild>
                <Link href='/rooms' className='flex items-center gap-1'>
                  <UsersIcon size={18} /> {t('Rooms')}
                </Link>
              </Button>
              <Button variant='ghost' asChild>
                <Link href='/tournaments' className='flex items-center gap-1'>
                  <TrophyIcon size={18} /> {t('Tournaments')}
                </Link>
              </Button>
            </>
          )}

          {loading ? (
            <div className='h-8 w-20 bg-muted rounded-md animate-pulse' />
          ) : user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant='ghost'
                  className='relative h-10 w-10 rounded-full'
                >
                  {reqCount > 0 && (
                    <span className='absolute -top-0.5 -right-0.5 z-10 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-0.5 text-[10px] font-medium leading-none text-background'>
                      {reqCount}
                    </span>
                  )}
                  <Avatar className='relative z-0 h-9 w-9'>
                    <AvatarImage src={user.photoURL || undefined} />
                    <AvatarFallback>
                      {visibleName ? (
                        visibleName[0].toUpperCase()
                      ) : (
                        <UserCircle />
                      )}
                    </AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className='w-56' align='end' forceMount>
                <DropdownMenuLabel className='font-normal'>
                  <div className='flex flex-col space-y-1'>
                    <p className='text-sm font-medium'>
                      {visibleName || 'User'}
                    </p>
                    <p className='text-xs text-muted-foreground'>
                      {user.email}
                    </p>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href={`/profile/${user.uid}`}>
                    <UserCircle className='mr-2 h-4 w-4' />
                    <span>{t('Profile')}</span>
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href='/friend-requests'>
                    <Bell className='mr-2 h-4 w-4' />
                    <span>
                      {t('Requests')} {reqCount > 0 && `(${reqCount})`}
                    </span>
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleLogout}>
                  <LogIn className='mr-2 h-4 w-4' />
                  <span>{t('Log out')}</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <>
              <Button variant='ghost' asChild>
                <Link href='/login' className='flex items-center gap-1'>
                  <LogIn size={18} /> {t('Login')}
                </Link>
              </Button>
              <Button asChild>
                <Link href='/register' className='flex items-center gap-1'>
                  <UserPlus size={18} /> {t('Register')}
                </Link>
              </Button>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
