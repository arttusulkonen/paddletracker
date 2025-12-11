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
import { cn } from '@/lib/utils';
import {
	Bell,
	Briefcase,
	Globe,
	HomeIcon,
	LogIn,
	Menu,
	ShieldCheck,
	TrophyIcon,
	UserCircle,
	UsersIcon,
	Warehouse,
} from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

// --- Components ---

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
  const { sport, setSport } = useSport();
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
          className='md:hidden'
          aria-label='Open Menu'
        >
          <Menu className='h-5 w-5' />
        </Button>
      </SheetTrigger>

      <SheetContent
        side='left'
        className='w-64 p-0 md:hidden flex flex-col'
        title={t('Main navigation')}
      >
        <div className='p-6 border-b'>
            <div className='font-bold text-lg mb-1'>{t('Menu')}</div>
            {user && (
               <div className='text-xs text-muted-foreground'>
                  {isCoach ? t('Coach Account') : t('Player Account')}
               </div>
            )}
        </div>

        <div className='flex-1 overflow-y-auto py-4 px-4 flex flex-col gap-2'>
            <NavLink href='/' onClick={close}>
              <HomeIcon className="w-4 h-4" /> {t('Home')}
            </NavLink>
            
            {user && (
              <>
                {/* GENERAL SECTION */}
                <div className='my-2'>
                  <div className='text-xs font-semibold text-muted-foreground mb-2 px-2 uppercase tracking-wider'>{t('Play')}</div>
                  <NavLink href='/rooms' onClick={close}>
                    <UsersIcon className="w-4 h-4" /> {t('Rooms')}
                  </NavLink>
                  <NavLink href='/tournaments' onClick={close}>
                    <TrophyIcon className="w-4 h-4" /> {t('Tournaments')}
                  </NavLink>
                </div>

                {/* COMMUNITY / MANAGE SECTION (AVAILABLE TO ALL) */}
                <div className='my-2'>
                  <div className='text-xs font-semibold text-muted-foreground mb-2 px-2 uppercase tracking-wider'>{t('Community')}</div>
                  <NavLink href='/manage/communities' onClick={close}>
                    <Warehouse className="w-4 h-4 text-primary" /> {t('Communities')}
                  </NavLink>
                  {/* Optional: Show explicit link to players if needed, otherwise accessed via communities tabs */}
                  <NavLink href='/manage/players' onClick={close}>
                    <Briefcase className="w-4 h-4" /> {t('My Players')}
                  </NavLink>
                </div>

                {/* ADMIN SECTION */}
                {isSuperAdmin && (
                  <div className='my-2'>
                    <div className='text-xs font-semibold text-muted-foreground mb-2 px-2 uppercase tracking-wider'>{t('Admin')}</div>
                    <NavLink href='/admin/users' onClick={close}>
                      <ShieldCheck className="w-4 h-4 text-destructive" /> {t('Admin Panel')}
                    </NavLink>
                  </div>
                )}
              </>
            )}
        </div>

        <div className='p-6 bg-muted/20 border-t space-y-4'>
            {/* Sport Switcher */}
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
                        'gap-2 h-8',
                        active && 'ring-1 ring-offset-1'
                      )}
                      onClick={() => {
                        setSport(k);
                        close();
                      }}
                    >
                      <span className='inline-flex h-3 w-3 items-center justify-center'>
                        {sportConfig[k].icon}
                      </span>
                      <span className='text-xs'>{sportConfig[k].name}</span>
                    </Button>
                  );
                })}
              </div>
            </div>

            {/* Lang Switcher */}
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
                      className="h-8 text-xs"
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
        "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
        isActive
          ? "bg-primary/10 text-primary"
          : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
      )}
    >
      {children}
    </Link>
  );
};

export function Navbar() {
  const { t, i18n } = useTranslation();
  const { user, userProfile, roomRequestCount, loading, logout, isGlobalAdmin } = useAuth();
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
  
  // Role checks
  const isCoach = userProfile?.accountType === 'coach' || userProfile?.roles?.includes('coach') || false;

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
        <div className='flex items-center gap-6'>
          {/* Mobile Menu Trigger */}
          <MobileNav user={user} t={t} isSuperAdmin={isGlobalAdmin} isCoach={isCoach} />
          
          {/* Logo */}
          <Link
            href='/'
            aria-label={`${config.name}Tracker`}
            className='flex items-center gap-2 text-foreground hover:opacity-80 transition-opacity'
          >
            {config.brandIcon ? (
              <div className='relative h-8 w-8 md:hidden'>
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
              <span className='md:hidden'>
                {React.isValidElement(config.icon) &&
                  React.cloneElement(config.icon as React.ReactElement, {
                    className: cn(
                      (config.icon as any).props?.className,
                      'h-8 w-8',
                      config.theme.primary
                    ),
                    'aria-hidden': true,
                  })}
              </span>
            )}
            {config.brandLogo ? (
              <div className='relative hidden md:block md:h-8 md:w-[140px]'>
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
              <span className='hidden md:inline-flex items-center gap-2 font-bold text-xl'>
                 {React.isValidElement(config.icon) &&
                  React.cloneElement(config.icon as React.ReactElement, {
                    className: cn(
                      (config.icon as any).props?.className,
                      'h-6 w-6',
                      config.theme.primary
                    ),
                  })}
                 {config.name}
              </span>
            )}
          </Link>

          {/* Desktop Navigation */}
          <nav className='hidden md:flex items-center gap-1'>
            {user && (
              <>
                <DesktopLink href='/rooms' icon={<UsersIcon className="w-4 h-4"/>} label={t('Rooms')} />
                <DesktopLink href='/tournaments' icon={<TrophyIcon className="w-4 h-4"/>} label={t('Tournaments')} />
                
                <div className="w-px h-6 bg-border mx-2" />

                {/* Visible to EVERYONE now */}
                <DesktopLink 
                    href='/manage/communities' 
                    icon={<Warehouse className="w-4 h-4" />} 
                    label={t('Communities')} 
                />
                
                {isGlobalAdmin && (
                   <DesktopLink 
                      href='/admin/users' 
                      icon={<ShieldCheck className="w-4 h-4" />} 
                      label="Admin" 
                      variant="admin"
                   />
                )}
              </>
            )}
          </nav>
        </div>

        {/* Right Actions */}
        <div className='flex items-center gap-1 sm:gap-2'>
          {/* Sport Selector (Desktop) */}
          <div className='hidden md:block'>
            <DropdownMenu>
              {user && (
                <DropdownMenuTrigger asChild>
                  <Button
                    variant='ghost'
                    className='flex items-center gap-2 text-muted-foreground hover:text-foreground'
                  >
                    {config.icon}
                    <span className='text-sm font-medium'>{config.name}</span>
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

          {/* Language Selector (Desktop) */}
          <div className='hidden md:block'>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant='ghost' size='icon' className='text-muted-foreground'>
                  <Globe className='h-5 w-5' />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align='end'>
                <DropdownMenuItem onClick={() => i18n.changeLanguage('en')}>English</DropdownMenuItem>
                <DropdownMenuItem onClick={() => i18n.changeLanguage('ru')}>Русский</DropdownMenuItem>
                <DropdownMenuItem onClick={() => i18n.changeLanguage('fi')}>Suomi</DropdownMenuItem>
                <DropdownMenuItem onClick={() => i18n.changeLanguage('ko')}>한국어</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {loading ? (
            <div className='h-9 w-9 bg-muted rounded-full animate-pulse' />
          ) : user ? (
            <>
              {/* Notifications */}
              <Link href='/friend-requests'>
                <Button
                  variant='ghost'
                  size='icon'
                  className='relative text-muted-foreground'
                  aria-label={t('Notifications')}
                >
                  {totalReqCount > 0 && (
                    <span className='absolute top-2 right-2 flex h-2.5 w-2.5'>
                      <span className='animate-ping absolute inline-flex h-full w-full rounded-full bg-destructive opacity-75' />
                      <span className='relative inline-flex rounded-full h-2.5 w-2.5 bg-destructive' />
                    </span>
                  )}
                  <Bell className='h-5 w-5' />
                </Button>
              </Link>
              
              {/* Profile Dropdown */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant='ghost'
                    className='relative h-9 w-9 rounded-full ml-1'
                  >
                    <Avatar className='h-9 w-9 border'>
                      <AvatarImage src={user.photoURL || undefined} />
                      <AvatarFallback>
                        {user.displayName ? (
                          user.displayName[0].toUpperCase()
                        ) : (
                          <UserCircle className="w-6 h-6" />
                        )}
                      </AvatarFallback>
                    </Avatar>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className='w-56' align='end' forceMount>
                  <DropdownMenuLabel className='font-normal'>
                    <div className='flex flex-col space-y-1'>
                      <p className='text-sm font-medium leading-none'>
                        {user.displayName || 'User'}
                      </p>
                      <p className='text-xs text-muted-foreground truncate'>
                        {user.email}
                      </p>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link href={`/profile/${user.uid}`} className="cursor-pointer">
                      <UserCircle className='mr-2 h-4 w-4' />
                      <span>{t('Profile')}</span>
                    </Link>
                  </DropdownMenuItem>
                  
                  {/* Communities available for ALL logged in users */}
                  <DropdownMenuItem asChild>
                    <Link href='/manage/communities' className="cursor-pointer">
                      <Warehouse className='mr-2 h-4 w-4' />
                      <span>{t('Communities')}</span>
                    </Link>
                  </DropdownMenuItem>

                  {isGlobalAdmin && (
                    <DropdownMenuItem asChild>
                      <Link href='/admin/users' className="cursor-pointer">
                        <ShieldCheck className='mr-2 h-4 w-4 text-destructive' />
                        <span>{t('Admin Panel')}</span>
                      </Link>
                    </DropdownMenuItem>
                  )}
                  
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleLogout} className="cursor-pointer text-destructive focus:text-destructive">
                    <LogIn className='mr-2 h-4 w-4' />
                    <span>{t('Log out')}</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          ) : (
            <div className="flex gap-2">
              <Button variant='ghost' size="sm" asChild>
                <Link href='/login'>{t('Login')}</Link>
              </Button>
              <Button size="sm" asChild>
                <Link href='/register'>{t('Register')}</Link>
              </Button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

// Helper for desktop links
function DesktopLink({ href, icon, label, variant = 'default' }: { href: string; icon: React.ReactNode; label: string; variant?: 'default' | 'admin' | 'coach' }) {
  const pathname = usePathname();
  const isActive = pathname.startsWith(href);
  
  const colors = {
     default: isActive ? 'text-primary bg-primary/10' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
     admin: isActive ? 'text-destructive bg-destructive/10' : 'text-muted-foreground hover:bg-destructive/10 hover:text-destructive',
     coach: isActive ? 'text-blue-600 bg-blue-50 dark:text-blue-400 dark:bg-blue-950/30' : 'text-muted-foreground hover:bg-blue-50 hover:text-blue-600 dark:hover:bg-blue-950/30',
  }

  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-all",
        colors[variant]
      )}
    >
      {icon}
      <span>{label}</span>
    </Link>
  )
}