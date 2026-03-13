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
import { useSport } from '@/contexts/SportContext';
import { cn } from '@/lib/utils';
import {
	Bell,
	Briefcase,
	Globe,
	HomeIcon,
	LayoutGrid,
	LogIn,
	Menu,
	ShieldCheck,
	UserCircle,
	Warehouse,
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
  isCoach,
}: {
  user: any;
  t: (key: string) => string;
  isSuperAdmin: boolean;
  isCoach: boolean;
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const { i18n } = useTranslation();

  const LANGS = [
    { code: 'en', label: 'English' },
    { code: 'ru', label: 'Русский' },
    { code: 'fi', label: 'Suomi' },
    { code: 'ko', label: '한국어' },
  ];

  const close = () => setIsOpen(false);

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetTrigger asChild>
        <Button
          variant='ghost'
          size='icon'
          className='md:hidden rounded-full'
          aria-label='Open Menu'
        >
          <Menu className='h-6 w-6' />
        </Button>
      </SheetTrigger>

      <SheetContent
        side='left'
        className='w-[280px] p-0 md:hidden flex flex-col border-r-0 glass-panel bg-white/80 dark:bg-zinc-950/80'
        title={t('Main navigation')}
      >
        <div className='p-6 border-b border-black/5 dark:border-white/5 bg-background/50 backdrop-blur-md'>
          <div className='font-bold text-2xl mb-1 tracking-tight'>
            {t('Menu')}
          </div>
          {user && (
            <div className='text-xs font-medium text-muted-foreground uppercase tracking-widest'>
              {isCoach ? t('Organizer Account') : t('Player Account')}
            </div>
          )}
        </div>

        <div className='flex-1 overflow-y-auto py-6 px-4 flex flex-col gap-2'>
          <NavLink href='/' onClick={close}>
            <div className='bg-muted/50 p-2 rounded-xl'>
              <HomeIcon className='w-5 h-5' />
            </div>{' '}
            <span className='font-semibold text-base'>{t('Home')}</span>
          </NavLink>

          {user && (
            <>
              <NavLink href='/rooms' onClick={close}>
                <div className='bg-primary/10 text-primary p-2 rounded-xl'>
                  <LayoutGrid className='w-5 h-5' />
                </div>{' '}
                <span className='font-semibold text-base'>
                  {t('Match Rooms')}
                </span>
              </NavLink>

              <NavLink href='/manage/communities' onClick={close}>
                <div className='bg-indigo-500/10 text-indigo-500 p-2 rounded-xl'>
                  <Warehouse className='w-5 h-5' />
                </div>{' '}
                <span className='font-semibold text-base'>
                  {t('Communities')}
                </span>
              </NavLink>

              {isCoach && (
                <NavLink href='/manage/players' onClick={close}>
                  <div className='bg-emerald-500/10 text-emerald-500 p-2 rounded-xl'>
                    <Briefcase className='w-5 h-5' />
                  </div>{' '}
                  <span className='font-semibold text-base'>
                    {t('My Players')}
                  </span>
                </NavLink>
              )}

              {isSuperAdmin && (
                <div className='mt-6 pt-6 border-t border-black/5 dark:border-white/5'>
                  <div className='text-[10px] font-bold text-muted-foreground mb-3 px-3 uppercase tracking-widest'>
                    {t('Admin')}
                  </div>
                  <NavLink href='/admin/users' onClick={close}>
                    <div className='bg-destructive/10 text-destructive p-2 rounded-xl'>
                      <ShieldCheck className='w-5 h-5' />
                    </div>{' '}
                    <span className='font-semibold text-base'>
                      {t('Admin Panel')}
                    </span>
                  </NavLink>
                </div>
              )}
            </>
          )}
        </div>

        <div className='p-6 bg-muted/20 border-t border-black/5 dark:border-white/5 space-y-4'>
          <div>
            <div className='mb-3 text-[10px] font-bold text-muted-foreground uppercase tracking-widest'>
              {t('Language')}
            </div>
            <div className='grid grid-cols-2 gap-2'>
              {LANGS.map((lng) => {
                const active = i18n.language?.startsWith(lng.code);
                return (
                  <Button
                    key={lng.code}
                    variant={active ? 'default' : 'outline'}
                    size='sm'
                    className={`h-10 text-xs rounded-xl font-semibold shadow-sm transition-all ${active ? '' : 'border-0 ring-1 ring-black/5 dark:ring-white/10 bg-background/50 backdrop-blur-md'}`}
                    onClick={() => {
                      i18n.changeLanguage(lng.code);
                      close();
                    }}
                  >
                    {lng.label}
                  </Button>
                );
              })}
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
      className={cn(
        'flex items-center gap-4 rounded-2xl px-3 py-2 transition-all duration-300',
        isActive
          ? 'bg-background shadow-sm ring-1 ring-black/5 dark:ring-white/10'
          : 'hover:bg-black/5 dark:hover:bg-white/5',
      )}
    >
      {children}
    </Link>
  );
};

export function Navbar() {
  const { t, i18n } = useTranslation();
  const {
    user,
    userProfile,
    roomRequestCount,
    loading,
    logout,
    isGlobalAdmin,
  } = useAuth();
  const router = useRouter();
  const { config } = useSport();
  const [hasMounted, setHasMounted] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    setHasMounted(true);

    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const handleLogout = async () => {
    await logout();
    router.push('/');
  };

  const friendReqCount = userProfile?.incomingRequests?.length ?? 0;
  const totalReqCount = friendReqCount + roomRequestCount;

  const isCoach =
    userProfile?.accountType === 'coach' ||
    userProfile?.roles?.includes('coach') ||
    false;

  if (!hasMounted) {
    return (
      <header className='sticky top-0 z-50 w-full h-16 md:h-20 bg-background/80 backdrop-blur-xl border-b border-border/40'>
        <div className='container mx-auto px-4 h-full flex items-center justify-between'>
          <div className='h-8 w-48 bg-muted rounded-xl animate-pulse' />
          <div className='flex items-center gap-3'>
            <div className='h-10 w-10 bg-muted rounded-full animate-pulse' />
            <div className='h-10 w-10 bg-muted rounded-full animate-pulse' />
          </div>
        </div>
      </header>
    );
  }

  return (
    <header
      className={cn(
        'sticky top-0 z-50 w-full transition-all duration-300 border-b',
        scrolled
          ? 'bg-background/70 backdrop-blur-2xl border-black/5 dark:border-white/5 shadow-sm h-16'
          : 'bg-background/90 backdrop-blur-xl border-transparent h-16 md:h-20',
      )}
    >
      <div className='container mx-auto px-4 h-full flex items-center justify-between'>
        <div className='flex items-center gap-6 md:gap-10'>
          <MobileNav
            user={user}
            t={t}
            isSuperAdmin={isGlobalAdmin}
            isCoach={isCoach}
          />

          {/* Logo */}
          <Link
            href='/'
            aria-label={`${config.name}Tracker`}
            className='flex items-center gap-2.5 text-foreground hover:opacity-80 transition-opacity'
          >
            {config.brandIcon ? (
              <div className='relative h-9 w-9 md:hidden drop-shadow-md'>
                <Image
                  src={config.brandIcon}
                  alt={`${config.name} icon`}
                  fill
                  priority
                  className='object-contain'
                  quality={100}
                />
              </div>
            ) : (
              <span className='md:hidden drop-shadow-md'>
                {React.isValidElement(config.icon) &&
                  React.cloneElement(config.icon as React.ReactElement<any>, {
                    className: cn(
                      (config.icon as any).props?.className,
                      'h-9 w-9',
                      config.theme.primary,
                    ),
                    'aria-hidden': true,
                  })}
              </span>
            )}

            {config.brandLogo ? (
              <div className='relative hidden md:block md:h-9 md:w-[150px] drop-shadow-sm'>
                <Image
                  src={config.brandLogo}
                  alt={`${config.name} logo`}
                  fill
                  priority
                  className='object-contain'
                  quality={100}
                />
              </div>
            ) : (
              <span className='hidden md:inline-flex items-center gap-2.5 font-extrabold tracking-tight text-2xl'>
                {React.isValidElement(config.icon) &&
                  React.cloneElement(config.icon as React.ReactElement<any>, {
                    className: cn(
                      (config.icon as any).props?.className,
                      'h-7 w-7 drop-shadow-md',
                      config.theme.primary,
                    ),
                  })}
                {config.name}
              </span>
            )}
          </Link>

          {/* Desktop Navigation */}
          <nav className='hidden md:flex items-center gap-2'>
            {user && (
              <>
                <DesktopLink
                  href='/rooms'
                  icon={<LayoutGrid className='w-4 h-4' />}
                  label={t('Rooms')}
                />

                <DesktopLink
                  href='/manage/communities'
                  icon={<Warehouse className='w-4 h-4' />}
                  label={t('Communities')}
                />

                {isGlobalAdmin && (
                  <DesktopLink
                    href='/admin/users'
                    icon={<ShieldCheck className='w-4 h-4' />}
                    label='Admin'
                    variant='admin'
                  />
                )}
              </>
            )}
          </nav>
        </div>

        {/* Right Actions */}
        <div className='flex items-center gap-2 sm:gap-4'>
          {/* Language Selector */}
          <div className='hidden md:block'>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant='ghost'
                  size='icon'
                  className='text-muted-foreground hover:bg-black/5 dark:hover:bg-white/10 rounded-full h-10 w-10 transition-colors'
                >
                  <Globe className='h-[1.1rem] w-[1.1rem]' />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align='end'
                className='glass-panel border-0 rounded-2xl p-2 w-40'
              >
                <DropdownMenuItem
                  className='rounded-xl cursor-pointer font-medium'
                  onClick={() => i18n.changeLanguage('en')}
                >
                  English
                </DropdownMenuItem>
                <DropdownMenuItem
                  className='rounded-xl cursor-pointer font-medium'
                  onClick={() => i18n.changeLanguage('ru')}
                >
                  Русский
                </DropdownMenuItem>
                <DropdownMenuItem
                  className='rounded-xl cursor-pointer font-medium'
                  onClick={() => i18n.changeLanguage('fi')}
                >
                  Suomi
                </DropdownMenuItem>
                <DropdownMenuItem
                  className='rounded-xl cursor-pointer font-medium'
                  onClick={() => i18n.changeLanguage('ko')}
                >
                  한국어
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {loading ? (
            <div className='h-10 w-10 bg-muted rounded-full animate-pulse' />
          ) : user ? (
            <>
              {/* Notifications */}
              <Link href='/friend-requests'>
                <Button
                  variant='ghost'
                  size='icon'
                  className='relative text-muted-foreground hover:bg-black/5 dark:hover:bg-white/10 rounded-full h-10 w-10 transition-colors'
                  aria-label={t('Notifications')}
                >
                  {totalReqCount > 0 && (
                    <span className='absolute top-2 right-2.5 flex h-2.5 w-2.5'>
                      <span className='animate-ping absolute inline-flex h-full w-full rounded-full bg-destructive opacity-75' />
                      <span className='relative inline-flex rounded-full h-2.5 w-2.5 bg-destructive border-2 border-background' />
                    </span>
                  )}
                  <Bell className='h-[1.1rem] w-[1.1rem]' />
                </Button>
              </Link>

              {/* Profile Dropdown */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant='ghost'
                    className='relative h-10 w-10 rounded-full p-0 overflow-hidden ring-2 ring-transparent focus-visible:ring-primary/50 transition-all hover:scale-105'
                  >
                    <Avatar className='h-full w-full'>
                      <AvatarImage
                        src={user.photoURL || undefined}
                        className='object-cover'
                      />
                      <AvatarFallback className='bg-primary/10 text-primary font-semibold'>
                        {user.displayName ? (
                          user.displayName[0].toUpperCase()
                        ) : (
                          <UserCircle className='w-5 h-5' />
                        )}
                      </AvatarFallback>
                    </Avatar>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  className='w-64 glass-panel border-0 rounded-[1.5rem] p-2 mt-2'
                  align='end'
                  forceMount
                >
                  <DropdownMenuLabel className='font-normal p-3'>
                    <div className='flex flex-col space-y-1.5'>
                      <p className='text-base font-bold leading-none tracking-tight'>
                        {user.displayName || 'User'}
                      </p>
                      <p className='text-xs text-muted-foreground truncate font-medium'>
                        {user.email}
                      </p>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator className='bg-black/5 dark:bg-white/10' />

                  <div className='p-1 space-y-1'>
                    <DropdownMenuItem
                      asChild
                      className='rounded-xl cursor-pointer py-2.5'
                    >
                      <Link href={`/profile/${user.uid}`}>
                        <UserCircle className='mr-2.5 h-4 w-4 opacity-70' />
                        <span className='font-semibold'>{t('Profile')}</span>
                      </Link>
                    </DropdownMenuItem>

                    <DropdownMenuItem
                      asChild
                      className='rounded-xl cursor-pointer py-2.5'
                    >
                      <Link href='/manage/communities'>
                        <Warehouse className='mr-2.5 h-4 w-4 opacity-70' />
                        <span className='font-semibold'>
                          {t('Communities')}
                        </span>
                      </Link>
                    </DropdownMenuItem>

                    {isGlobalAdmin && (
                      <DropdownMenuItem
                        asChild
                        className='rounded-xl cursor-pointer py-2.5 text-destructive focus:text-destructive focus:bg-destructive/10'
                      >
                        <Link href='/admin/users'>
                          <ShieldCheck className='mr-2.5 h-4 w-4' />
                          <span className='font-semibold'>
                            {t('Admin Panel')}
                          </span>
                        </Link>
                      </DropdownMenuItem>
                    )}
                  </div>

                  <DropdownMenuSeparator className='bg-black/5 dark:bg-white/10' />
                  <div className='p-1'>
                    <DropdownMenuItem
                      onClick={handleLogout}
                      className='rounded-xl cursor-pointer py-2.5 text-muted-foreground focus:bg-muted'
                    >
                      <LogIn className='mr-2.5 h-4 w-4' />
                      <span className='font-semibold'>{t('Log out')}</span>
                    </DropdownMenuItem>
                  </div>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          ) : (
            <div className='flex items-center gap-3'>
              <Button
                variant='ghost'
                className='hidden sm:inline-flex rounded-full font-semibold px-5 hover:bg-black/5 dark:hover:bg-white/10'
                asChild
              >
                <Link href='/login'>{t('Login')}</Link>
              </Button>
              <Button
                className='rounded-full font-bold px-6 shadow-md hover:shadow-lg transition-all'
                asChild
              >
                <Link href='/register'>{t('Register')}</Link>
              </Button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

function DesktopLink({
  href,
  icon,
  label,
  variant = 'default',
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  variant?: 'default' | 'admin' | 'coach';
}) {
  const pathname = usePathname();
  const isActive = pathname.startsWith(href);

  const colors = {
    default: isActive
      ? 'text-primary bg-primary/10 shadow-inner'
      : 'text-muted-foreground hover:bg-black/5 dark:hover:bg-white/5 hover:text-foreground',
    admin: isActive
      ? 'text-destructive bg-destructive/10 shadow-inner'
      : 'text-muted-foreground hover:bg-destructive/5 hover:text-destructive',
    coach: isActive
      ? 'text-blue-600 bg-blue-50 dark:text-blue-400 dark:bg-blue-900/30 shadow-inner'
      : 'text-muted-foreground hover:bg-blue-50 dark:hover:bg-blue-900/20 hover:text-blue-600 dark:hover:text-blue-400',
  };

  return (
    <Link
      href={href}
      className={cn(
        'flex items-center gap-2.5 px-4 py-2 rounded-full text-sm font-semibold transition-all duration-300 ease-out',
        colors[variant],
      )}
    >
      {icon}
      <span>{label}</span>
    </Link>
  );
}
