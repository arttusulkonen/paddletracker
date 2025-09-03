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
import { getSuperAdminIds } from '@/lib/superAdmins';
import { cn } from '@/lib/utils';
import {
  Bell,
  Globe,
  HomeIcon,
  LogIn,
  Menu,
  ShieldCheck,
  TrophyIcon,
  UserCircle,
  UsersIcon,
} from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

const MobileNav = ({
  user,
  t,
  isSuperAdmin,
}: {
  user: any;
  t: (key: string) => string;
  isSuperAdmin: boolean;
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const { sport, setSport } = useSport();
  const { i18n } = useTranslation();

  const LANGS = [
    { code: 'en', label: 'English' },
    { code: 'ru', label: 'Русский' },
    { code: 'fi', label: 'Suomi' },
    { code: 'ko', label: '한국어' },
  ];

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetTrigger asChild>
        <Button
          variant='ghost'
          size='icon'
          className='md:hidden'
          aria-label='Open Menu'
        >
          <Menu className='h-5 w-5' />
        </Button>
      </SheetTrigger>

      <SheetContent
        side='left'
        className='w-64 p-0 md:hidden'
        title={t('Main navigation')}
      >
        <div className='flex h-full flex-col'>
          <div className='flex flex-col gap-2 p-6'>
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
                {isSuperAdmin && (
                  <NavLink href='/admin/users' onClick={() => setIsOpen(false)}>
                    <ShieldCheck /> {t('Admin')}
                  </NavLink>
                )}
              </>
            )}
          </div>

          <div className='mt-2 border-t' />

          <div className='mt-auto p-6 space-y-4'>
            <div>
              <div className='mb-2 text-xs font-medium text-muted-foreground'>
                {t('Sport')}
              </div>
              <div className='flex items-center gap-2 flex-wrap'>
                {Object.keys(sportConfig).map((key) => {
                  const k = key as Sport;
                  const active = sport === k;
                  return (
                    <Button
                      key={k}
                      variant={active ? 'default' : 'outline'}
                      size='sm'
                      className={cn(
                        'gap-2',
                        active && 'ring-2 ring-ring ring-offset-2'
                      )}
                      onClick={() => {
                        setSport(k);
                        setIsOpen(false);
                      }}
                    >
                      <span className='inline-flex h-4 w-4 items-center justify-center'>
                        {sportConfig[k].icon}
                      </span>
                      <span className='text-xs'>{sportConfig[k].name}</span>
                    </Button>
                  );
                })}
              </div>
            </div>

            <div>
              <div className='mb-2 text-xs font-medium text-muted-foreground'>
                {t('Language')}
              </div>
              <div className='flex flex-wrap items-center gap-2'>
                {LANGS.map((lng) => {
                  const active = i18n.language?.startsWith(lng.code);
                  return (
                    <Button
                      key={lng.code}
                      variant={active ? 'default' : 'outline'}
                      size='sm'
                      onClick={() => {
                        i18n.changeLanguage(lng.code);
                        setIsOpen(false);
                      }}
                    >
                      {lng.label}
                    </Button>
                  );
                })}
              </div>
            </div>
          </div>
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

export function Navbar() {
  const { t, i18n } = useTranslation();
  const { user, userProfile, roomRequestCount, loading, logout } = useAuth();
  const router = useRouter();
  const { sport, setSport, config } = useSport();
  const [hasMounted, setHasMounted] = useState(false);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);

  useEffect(() => {
    setHasMounted(true);
  }, []);

  useEffect(() => {
    let canceled = false;
    (async () => {
      if (!user) {
        setIsSuperAdmin(false);
        return;
      }
      try {
        const ids = await getSuperAdminIds();
        if (!canceled) setIsSuperAdmin(ids.includes(user.uid));
      } catch {
        if (!canceled) setIsSuperAdmin(false);
      }
    })();
    return () => {
      canceled = true;
    };
  }, [user]);

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
        <div className='flex items-center gap-4'>
          <MobileNav user={user} t={t} isSuperAdmin={isSuperAdmin} />
          <Link
            href='/'
            aria-label={`${config.name}Tracker`}
            className='flex items-center gap-2 text-foreground hover:opacity-80 transition-opacity'
          >
            {config.brandIcon ? (
              <div className='relative h-9 w-9 md:hidden'>
                <Image
                  src={config.brandIcon}
                  alt={`${config.name} icon`}
                  fill
                  priority
                  sizes='(max-width: 767px) 36px, 0px'
                  className='object-contain'
                  quality={100}
                />
              </div>
            ) : (
              <span className='md:hidden'>
                {React.isValidElement(config.icon) &&
                  React.cloneElement(config.icon as React.ReactElement, {
                    className: cn(
                      (config.icon as any).props?.className,
                      'h-9 w-9',
                      config.theme.primary
                    ),
                    'aria-hidden': true,
                  })}
              </span>
            )}
            {config.brandLogo ? (
              <div className='relative hidden md:block md:h-9 md:w-[160px]'>
                <Image
                  src={config.brandLogo}
                  alt={`${config.name} logo`}
                  fill
                  priority
                  sizes='(min-width: 768px) 160px, 0px'
                  className='object-contain'
                  quality={100}
                />
              </div>
            ) : (
              <span className='hidden md:inline-block'>
                {React.isValidElement(config.icon) &&
                  React.cloneElement(config.icon as React.ReactElement, {
                    className: cn(
                      (config.icon as any).props?.className,
                      'h-9 w-9',
                      config.theme.primary
                    ),
                    'aria-hidden': true,
                  })}
              </span>
            )}
            <span className='sr-only'>{`${config.name}Tracker`}</span>
          </Link>
          <nav className='hidden md:flex items-center gap-2'>
            {user && (
              <>
                <NavLink href='/rooms' onClick={() => setIsOpen(false)}>
                  <UsersIcon /> {t('Rooms')}
                </NavLink>
                <NavLink href='/tournaments' onClick={() => setIsOpen(false)}>
                  <TrophyIcon /> {t('Tournaments')}
                </NavLink>
                <AdminOnly>
                  <NavLink href='/admin/users' onClick={() => setIsOpen(false)}>
                    <UsersIcon /> Admin
                  </NavLink>
                </AdminOnly>
              </>
            )}
          </nav>
        </div>

        <nav className='flex items-center gap-1 sm:gap-2'>
          <div className='hidden md:block'>
            <DropdownMenu>
              {user && (
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
              )}
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
          </div>

          <div className='hidden md:block'>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant='ghost'
                  size='icon'
                  aria-label='Change language'
                >
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
          </div>

          {loading ? (
            <div className='h-10 w-10 bg-muted rounded-full animate-pulse' />
          ) : user ? (
            <>
              <Link href='/friend-requests'>
                <Button
                  variant='ghost'
                  size='icon'
                  aria-label='Requests'
                  className='relative'
                >
                  {totalReqCount > 0 && (
                    <span className='absolute top-1.5 right-1.5 flex h-3 w-3'>
                      <span className='animate-ping absolute inline-flex h-full w-full rounded-full bg-destructive opacity-75' />
                      <span className='relative inline-flex rounded-full h-3 w-3 bg-destructive' />
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
                  {isSuperAdmin && (
                    <DropdownMenuItem asChild>
                      <Link href='/admin/users'>
                        <ShieldCheck className='mr-2' />
                        <span>{t('Admin')}</span>
                      </Link>
                    </DropdownMenuItem>
                  )}
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

function AdminOnly({ children }: { children: React.ReactNode }) {
  const { isGlobalAdmin } = useAuth();
  return isGlobalAdmin ? <>{children}</> : null;
}
