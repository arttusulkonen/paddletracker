// src/components/rooms/RoomHeader.tsx
'use client';

import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
	Avatar,
	AvatarFallback,
	AvatarImage,
	Button,
	Dialog,
	DialogTrigger,
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from '@/components/ui';
import { useAuth } from '@/contexts/AuthContext';
import type { Room, Member as RoomMember } from '@/lib/types';
import {
	Briefcase,
	Clock,
	Flame,
	Gamepad2,
	Globe,
	HelpCircle,
	Lock,
	LogIn,
	LogOut,
	Medal,
	Settings,
	Swords,
	Users,
	X,
	Zap,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { RoomSettingsDialog } from './RoomSettings';

interface RoomHeaderProps {
  room: Room;
  members?: RoomMember[];
  isMember: boolean;
  hasPendingRequest: boolean;
  isCreator: boolean;
  onJoin: () => void;
  onCancelJoin: () => void;
  onLeave: () => void;
}

export function RoomHeader({
  room,
  members,
  isMember,
  hasPendingRequest,
  isCreator,
  onJoin,
  onCancelJoin,
  onLeave,
}: RoomHeaderProps) {
  const { t } = useTranslation();
  const { userProfile } = useAuth();

  const mode = room.mode || 'office';
  const memberCount = room.memberIds?.length || 0;
  const isManagedUser = !!userProfile?.managedBy;

  // --- Логика Таймера Спринта ---
  const [timeLeft, setTimeLeft] = useState<string>('');

  useEffect(() => {
    if (mode !== 'derby' || !room.sprintStartTs) return;

    const interval = setInterval(() => {
      const durationWeeks = (room as any).sprintDurationWeeks || 1;
      const endTs =
        room.sprintStartTs! + durationWeeks * 7 * 24 * 60 * 60 * 1000;
      const now = Date.now();
      const diff = endTs - now;

      if (diff <= 0) {
        setTimeLeft(t('Finalizing...'));
        return;
      }

      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
      const mins = Math.floor((diff / (1000 * 60)) % 60);

      setTimeLeft(
        `${days}d ${hours.toString().padStart(2, '0')}h ${mins.toString().padStart(2, '0')}m`,
      );
    }, 1000);

    return () => clearInterval(interval);
  }, [room.sprintStartTs, mode, t]);

  const topBountyMember = members?.reduce((prev, current) => {
    const prevStreak = prev?.currentStreak ?? 0;
    const currStreak = current?.currentStreak ?? 0;
    return prevStreak > currStreak ? prev : current;
  }, members?.[0]);

  const showBounty =
    mode === 'derby' &&
    topBountyMember &&
    (topBountyMember.currentStreak ?? 0) >= 3;
  const bountyPoints = showBounty
    ? ((topBountyMember.currentStreak ?? 0) - 2) * 5
    : 0;

  const getTheme = () => {
    switch (mode) {
      case 'professional':
        return {
          bg: 'bg-amber-50/50 dark:bg-amber-950/10',
          border: 'border-amber-200 dark:border-amber-900',
          iconColor: 'text-amber-600 dark:text-amber-500',
          icon: <Medal className='w-4 h-4' />,
          label: t('Professional'),
          description: t(
            'Standard ELO rules apply. Every match counts towards your Global Ranking.',
          ),
        };
      case 'arcade':
        return {
          bg: 'bg-purple-50/50 dark:bg-purple-950/10',
          border: 'border-purple-200 dark:border-purple-900',
          iconColor: 'text-purple-600 dark:text-purple-500',
          icon: <Gamepad2 className='w-4 h-4' />,
          label: t('Arcade'),
          description: t(
            'Matches in this room do NOT affect your Global ELO. Play for fun and experiment!',
          ),
        };
      case 'derby':
        return {
          bg: 'bg-red-50/50 dark:bg-red-950/10',
          border: 'border-red-200 dark:border-red-900',
          iconColor: 'text-red-600 dark:text-red-500',
          icon: <Swords className='w-4 h-4' />,
          label: t('Derby'),
          description: t(
            'Micro-league. Points swing heavily based on breaking streaks and defeating your historical nemesis.',
          ),
        };
      default:
        return {
          bg: 'bg-slate-50/50 dark:bg-slate-950/10',
          border: 'border-slate-200 dark:border-slate-800',
          iconColor: 'text-slate-600 dark:text-slate-500',
          icon: <Briefcase className='w-4 h-4' />,
          label: t('Office'),
          description: t(
            'Losses are penalized less (inflated ELO) to keep office morale high. Global ELO is still affected.',
          ),
        };
    }
  };

  const theme = getTheme();

  return (
    <div
      className={`mb-10 rounded-[2.5rem] overflow-hidden glass-panel relative ${theme.bg}`}
    >
      <div
        className={`absolute top-0 left-0 w-full h-1.5 opacity-80 ${theme.bg.includes('amber') ? 'bg-gradient-to-r from-amber-400 to-amber-600' : theme.bg.includes('purple') ? 'bg-gradient-to-r from-purple-400 to-purple-600' : theme.bg.includes('red') ? 'bg-gradient-to-r from-red-400 to-red-600' : 'bg-gradient-to-r from-slate-400 to-slate-600'}`}
      />

      <div className='relative px-8 py-10 md:px-12'>
        <div className='flex flex-col md:flex-row gap-8 items-start md:items-center'>
          <div className='flex-shrink-0 relative'>
            <Avatar className='h-28 w-28 ring-4 ring-white/40 dark:ring-black/20 shadow-2xl overflow-hidden bg-background/50 backdrop-blur-sm'>
              <AvatarImage
                src={room.avatarURL || undefined}
                className='object-cover'
              />
              <AvatarFallback className='text-4xl font-light text-muted-foreground bg-transparent'>
                {room.name[0]?.toUpperCase()}
              </AvatarFallback>
            </Avatar>
          </div>

          <div className='flex-grow space-y-4 min-w-0 w-full'>
            <div className='flex flex-col md:flex-row md:items-center justify-between gap-6'>
              <div>
                <h1 className='text-4xl md:text-5xl font-extrabold tracking-tight text-foreground truncate mb-2'>
                  {room.name}
                </h1>

                <div className='flex flex-wrap items-center gap-x-5 gap-y-3 text-sm text-muted-foreground font-medium'>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div
                          className={`flex items-center gap-2 cursor-help ${theme.iconColor} bg-background/50 px-3 py-1.5 rounded-full ring-1 ring-black/5 dark:ring-white/10`}
                        >
                          {theme.icon}
                          <span className='font-semibold tracking-wide uppercase text-xs'>
                            {theme.label}
                          </span>
                          <HelpCircle className='w-3.5 h-3.5 opacity-50' />
                        </div>
                      </TooltipTrigger>
                      <TooltipContent className='glass-panel border-0 shadow-2xl'>
                        <p className='max-w-xs text-xs leading-relaxed'>
                          {theme.description}
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>

                  <div className='flex items-center gap-2'>
                    {room.isPublic ? (
                      <>
                        <Globe className='w-4 h-4 opacity-70' />
                        <span className='uppercase tracking-widest text-[10px] font-bold'>
                          {t('Public')}
                        </span>
                      </>
                    ) : (
                      <>
                        <Lock className='w-4 h-4 opacity-70' />
                        <span className='uppercase tracking-widest text-[10px] font-bold'>
                          {t('Private')}
                        </span>
                      </>
                    )}
                  </div>
                  <div className='w-1.5 h-1.5 rounded-full bg-muted-foreground/30' />
                  <div className='flex items-center gap-2'>
                    <Users className='w-4 h-4 opacity-70' />
                    <span className='font-mono text-base'>{memberCount}</span>
                  </div>
                </div>
              </div>

              <div className='flex items-center gap-3 mt-4 md:mt-0 flex-shrink-0'>
                {!isMember && !room.isArchived && (
                  <>
                    {hasPendingRequest ? (
                      <Button
                        onClick={onCancelJoin}
                        variant='secondary'
                        size='lg'
                        className='rounded-full shadow-md'
                      >
                        <X className='mr-2 h-5 w-5' />
                        {t('Cancel Request')}
                      </Button>
                    ) : (
                      room.isPublic && (
                        <Button
                          onClick={onJoin}
                          size='lg'
                          className='rounded-full shadow-xl hover:scale-105 transition-transform font-semibold px-8'
                        >
                          <LogIn className='mr-2 h-5 w-5' />
                          {t('Join Room')}
                        </Button>
                      )
                    )}
                  </>
                )}

                {isMember &&
                  !isCreator &&
                  !room.isArchived &&
                  !isManagedUser && (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant='outline'
                          size='icon'
                          className='text-destructive hover:text-destructive hover:bg-destructive/10 rounded-full h-12 w-12 glass-panel border-0'
                          title={t('Leave')}
                        >
                          <LogOut className='h-5 w-5' />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent className='glass-panel border-0 sm:rounded-[2rem]'>
                        <AlertDialogHeader>
                          <AlertDialogTitle className='text-2xl'>
                            {t('Leave this room?')}
                          </AlertDialogTitle>
                          <AlertDialogDescription className='text-base'>
                            {t(
                              "You won't be able to record matches here anymore.",
                            )}
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter className='mt-6 gap-3 sm:gap-0'>
                          <AlertDialogCancel className='rounded-xl h-12 text-base'>
                            {t('Stay')}
                          </AlertDialogCancel>
                          <AlertDialogAction
                            onClick={onLeave}
                            className='bg-destructive text-destructive-foreground hover:bg-destructive/90 rounded-xl h-12 text-base font-bold'
                          >
                            {t('Yes, Leave')}
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  )}

                {isCreator && (
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button
                        variant='outline'
                        size='icon'
                        className='rounded-full h-12 w-12 glass-panel border-0 hover:bg-background/80 transition-all'
                      >
                        <Settings className='h-5 w-5' />
                      </Button>
                    </DialogTrigger>
                    <RoomSettingsDialog room={room} members={members} />
                  </Dialog>
                )}
              </div>
            </div>

            {room.description ? (
              <p className='text-muted-foreground md:text-lg font-light leading-relaxed max-w-3xl mt-4'>
                {room.description}
              </p>
            ) : (
              <p className='text-muted-foreground/60 md:text-lg font-light leading-relaxed max-w-3xl mt-4 italic'>
                {theme.description}
              </p>
            )}

            {/* --- DERBY INFO SECTION (Sprint & Bounty) --- */}
            {mode === 'derby' && (
              <div className='mt-8 flex flex-wrap gap-4'>
                {/* Sprint Timer Block */}
                <div className='flex items-center gap-4 bg-background/40 backdrop-blur-md ring-1 ring-black/5 dark:ring-white/10 rounded-2xl p-4 min-w-[280px] shadow-sm'>
                  <div className='h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary relative'>
                    <Zap className='w-6 h-6 fill-current' />
                    <span className='absolute -top-1 -right-1 flex h-3 w-3'>
                      <span className='animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75'></span>
                      <span className='relative inline-flex rounded-full h-3 w-3 bg-primary'></span>
                    </span>
                  </div>
                  <div>
                    <div className='text-[10px] uppercase font-bold text-muted-foreground tracking-widest mb-0.5 flex items-center gap-1.5'>
                      Sprint #{(room as any).sprintCount || 0 + 1}
                      <span className='text-primary opacity-100'>• LIVE</span>
                    </div>
                    <div className='text-lg font-black tracking-tight flex items-center gap-2'>
                      <Clock className='w-4 h-4 text-muted-foreground' />
                      {timeLeft || '--:--'}
                    </div>
                  </div>
                </div>

                {/* Bounty Block */}
                {showBounty && topBountyMember && (
                  <div className='flex items-center gap-4 bg-red-500/5 backdrop-blur-md ring-1 ring-red-500/20 rounded-2xl p-4 min-w-[280px] shadow-sm animate-in fade-in slide-in-from-left-4 duration-500'>
                    <Avatar className='h-12 w-12 ring-2 ring-red-500 shadow-[0_0_15px_rgba(239,68,68,0.4)]'>
                      <AvatarImage
                        src={topBountyMember.photoURL || undefined}
                      />
                      <AvatarFallback className='bg-red-500/10 text-red-600 font-bold'>
                        {(topBountyMember.name || '?')
                          .substring(0, 2)
                          .toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <div className='text-[10px] uppercase font-bold text-red-600 dark:text-red-400 flex items-center gap-1.5 tracking-widest mb-0.5'>
                        <Flame className='w-3 h-3 fill-current' />
                        {t('Most Wanted')}
                      </div>
                      <div className='text-sm font-bold text-foreground'>
                        {t('Defeat')} {topBountyMember.name}{' '}
                        <span className='text-red-500'>
                          +{bountyPoints} ELO
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
