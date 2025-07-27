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
  Sheet,
  SheetContent,
  SheetTrigger,
} from '@/components/ui';
import { useAuth } from '@/contexts/AuthContext';
import { Sport, sportConfig, useSport } from '@/contexts/SportContext';
import {
  Bell,
  Globe,
  HomeIcon,
  LogIn,
  Menu,
  TrophyIcon,
  UserCircle,
  UserPlus,
  UsersIcon,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

// --- Компоненты для мобильного меню ---
const MobileNav = ({ user, t }: { user: any; t: (key: string) => string }) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetTrigger asChild>
        <Button variant='ghost' size='icon' className='md:hidden'>
          <Menu className='h-5 w-5' />
          <span className='sr-only'>Open Menu</span>
        </Button>
      </SheetTrigger>
      <SheetContent side='left' className='w-64'>
        <div className='flex flex-col gap-4 py-6'>
          <NavLink href='/' onClick={() => setIsOpen(false)}>
            <HomeIcon /> {t('Home')}
          </NavLink>
          {user && (
            <>
              <NavLink href='/rooms' onClick={() => setIsOpen(false)}>
                <UsersIcon /> {t('Rooms')}
              </NavLink>
              <NavLink href='/tournaments' onClick={() => setIsOpen(false)}>
                <TrophyIcon /> {t('Tournaments')}
              </NavLink>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
};

const NavLink = ({
  href,
  children,
  onClick,
}: {
  href: string;
  children: React.ReactNode;
  onClick?: () => void;
}) => {
  const pathname = usePathname();
  const isActive = pathname === href;
  return (
    <Link
      href={href}
      onClick={onClick}
      className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
        isActive
          ? 'bg-muted text-foreground'
          : 'text-muted-foreground hover:bg-muted/50'
      }`}
    >
      {children}
    </Link>
  );
};

// --- Основной компонент Navbar ---
export function Navbar() {
  const { t, i18n } = useTranslation();
  const { user, userProfile, roomRequestCount, loading, logout } = useAuth();
  const router = useRouter();
  const { sport, setSport, config } = useSport();
  const [hasMounted, setHasMounted] = useState(false);

  useEffect(() => {
    setHasMounted(true);
  }, []);

  const handleLogout = async () => {
    await logout();
    router.push('/');
  };

  const friendReqCount = userProfile?.incomingRequests?.length ?? 0;
  const totalReqCount = friendReqCount + roomRequestCount;

  if (!hasMounted) {
    return (
      <header className='bg-card border-b sticky top-0 z-50 shadow-sm'>
        <div className='container mx-auto px-4 h-16 flex items-center justify-between'>
          <div className='h-8 w-48 bg-muted rounded animate-pulse' />
          <div className='flex items-center gap-2'>
            <div className='h-10 w-10 bg-muted rounded-full animate-pulse' />
            <div className='h-10 w-10 bg-muted rounded-full animate-pulse' />
          </div>
        </div>
      </header>
    );
  }

  return (
    <header className='bg-card border-b sticky top-0 z-50 shadow-sm'>
      <div className='container mx-auto px-4 h-16 flex items-center justify-between'>
        {/* Левая сторона: Меню (моб.), Лого, Навигация (десктоп) */}
        <div className='flex items-center gap-4'>
          <MobileNav user={user} t={t} />
          <Link
            href='/'
            className={`flex items-center gap-2 text-foreground hover:opacity-80 transition-opacity`}
          >
            {React.cloneElement(config.icon as React.ReactElement, {
              className: `h-7 w-7 ${config.theme.primary}`,
            })}
            <h1 className='text-xl font-bold tracking-tight hidden sm:block'>
              {`${config.name}Tracker`}
            </h1>
          </Link>
          <nav className='hidden md:flex items-center gap-2'>
            {user && (
              <>
                <NavLink href='/rooms'>
                  <UsersIcon /> {t('Rooms')}
                </NavLink>
                <NavLink href='/tournaments'>
                  <TrophyIcon /> {t('Tournaments')}
                </NavLink>
              </>
            )}
          </nav>
        </div>

        {/* Правая сторона: Действия и Пользователь */}
        <nav className='flex items-center gap-1 sm:gap-2'>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant='ghost'
                className='flex items-center gap-2'
                aria-label='Change sport'
              >
                {config.icon}
                <span className='hidden sm:inline'>{config.name}</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align='end'>
              {Object.keys(sportConfig).map((sportKey) => (
                <DropdownMenuItem
                  key={sportKey}
                  onClick={() => setSport(sportKey as Sport)}
                  className='flex items-center gap-2'
                >
                  {sportConfig[sportKey as Sport].icon}
                  <span>{sportConfig[sportKey as Sport].name}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant='ghost' size='icon' aria-label='Change language'>
                <Globe className='h-5 w-5' />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align='end'>
              <DropdownMenuItem onClick={() => i18n.changeLanguage('en')}>
                English
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => i18n.changeLanguage('ru')}>
                Русский
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => i18n.changeLanguage('fi')}>
                Suomi
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => i18n.changeLanguage('ko')}>
                한국어
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {loading ? (
            <div className='h-10 w-10 bg-muted rounded-full animate-pulse' />
          ) : user ? (
            <>
              <Link href='/friend-requests'>
                {/* ✅ ИСПРАВЛЕНИЕ: Добавлен класс 'relative' для правильного позиционирования значка */}
                <Button
                  variant='ghost'
                  size='icon'
                  aria-label='Requests'
                  className='relative'
                >
                  {totalReqCount > 0 && (
                    <span className='absolute top-1.5 right-1.5 flex h-3 w-3'>
                      <span className='animate-ping absolute inline-flex h-full w-full rounded-full bg-destructive opacity-75'></span>
                      <span className='relative inline-flex rounded-full h-3 w-3 bg-destructive'></span>
                    </span>
                  )}
                  <Bell className='h-5 w-5' />
                </Button>
              </Link>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant='ghost'
                    className='relative h-10 w-10 rounded-full'
                  >
                    <Avatar className='h-9 w-9'>
                      <AvatarImage src={user.photoURL || undefined} />
                      <AvatarFallback>
                        {user.displayName ? (
                          user.displayName[0].toUpperCase()
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
                        {user.displayName || 'User'}
                      </p>
                      <p className='text-xs text-muted-foreground'>
                        {user.email}
                      </p>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link href={`/profile/${user.uid}`}>
                      <UserCircle className='mr-2' />
                      <span>{t('Profile')}</span>
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleLogout}>
                    <LogIn className='mr-2' />
                    <span>{t('Log out')}</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          ) : (
            <>
              <Button variant='ghost' asChild>
                <Link href='/login'>{t('Login')}</Link>
              </Button>
              <Button asChild>
                <Link href='/register'>{t('Register')}</Link>
              </Button>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
