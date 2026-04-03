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
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from '@/components/ui';
import { useAuth } from '@/contexts/AuthContext';
import { useSport } from '@/contexts/SportContext';
import { app } from '@/lib/firebase';
import type { Room, Member as RoomMember } from '@/lib/types';
import { getFunctions, httpsCallable } from 'firebase/functions';
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
import { useEffect, useRef, useState } from 'react';
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
  const { sport } = useSport();

  const mode = room.mode || 'office';
  const memberCount = room.memberIds?.length || 0;
  const isManagedUser = !!userProfile?.managedBy;

  const [timeLeft, setTimeLeft] = useState<string>('');
  
  // Guard references to prevent infinite loops and re-triggering
  const hasTriggeredRef = useRef(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (mode !== 'derby') return;

    const triggerFinalize = async () => {
      try {
        const functions = getFunctions(app, 'europe-west1');
        const finalizeFn = httpsCallable(functions, 'forceFinalizeDerbySprint');
        await finalizeFn({ roomId: room.id, sport: sport });
      } catch (e) {
        console.error('Failed to auto-finalize derby sprint:', e);
      }
    };

    const calculateTimeLeft = () => {
      const startTs = room.sprintStartTs;

      if (!startTs) return t('Awaiting first match...');

      const startMs = Number(startTs);
      if (Number.isNaN(startMs) || startMs === 0)
        return t('Awaiting first match...');

      const durationWeeks = Number(room.sprintDuration) || 2;
      const durationMs = durationWeeks * 7 * 24 * 60 * 60 * 1000;
      const endTs = startMs + durationMs;
      const now = Date.now();
      const diff = endTs - now;

      if (diff <= 0) {
        if (isMember && !hasTriggeredRef.current) {
          hasTriggeredRef.current = true;
          triggerFinalize();
        }
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
        return t('Finalizing...');
      }

      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
      const mins = Math.floor((diff / (1000 * 60)) % 60);
      const secs = Math.floor((diff / 1000) % 60);

      if (days > 0) {
        return `${days}d ${hours.toString().padStart(2, '0')}h ${mins.toString().padStart(2, '0')}m ${secs.toString().padStart(2, '0')}s`;
      }
      return `${hours.toString().padStart(2, '0')}h ${mins.toString().padStart(2, '0')}m ${secs.toString().padStart(2, '0')}s`;
    };

    hasTriggeredRef.current = false;
    setTimeLeft(calculateTimeLeft());

    const startMs = Number(room.sprintStartTs);
    const hasValidStartTs =
      !!room.sprintStartTs && !Number.isNaN(startMs) && startMs !== 0;
      
    if (!hasValidStartTs) return;

    if (!hasTriggeredRef.current) {
      intervalRef.current = setInterval(() => {
        setTimeLeft(calculateTimeLeft());
      }, 1000);
    }

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [room.sprintStartTs, room.sprintDuration, mode, t, room.id, sport, isMember]);

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
      className={`mb-8 rounded-3xl overflow-hidden glass-panel relative ${theme.bg}`}
    >
      <div
        className={`absolute top-0 left-0 w-full h-1.5 opacity-80 ${theme.bg.includes('amber') ? 'bg-gradient-to-r from-amber-400 to-amber-600' : theme.bg.includes('purple') ? 'bg-gradient-to-r from-purple-400 to-purple-600' : theme.bg.includes('red') ? 'bg-gradient-to-r from-red-400 to-red-600' : 'bg-gradient-to-r from-slate-400 to-slate-600'}`}
      />

      <div className='relative p-6 sm:p-8'>
        <div className='flex flex-col md:flex-row gap-6 items-start md:items-center'>
          <Avatar className='h-20 w-20 ring-2 ring-white/40 dark:ring-black/20 shadow-lg shrink-0'>
            <AvatarImage
              src={room.avatarURL || undefined}
              className='object-cover'
            />
            <AvatarFallback className='text-2xl font-bold bg-background/50'>
              {room.name[0]?.toUpperCase()}
            </AvatarFallback>
          </Avatar>

          <div className='flex-grow min-w-0 w-full'>
            <div className='flex flex-col md:flex-row md:items-start justify-between gap-4'>
              <div>
                <h1 className='text-3xl font-extrabold tracking-tight truncate mb-2'>
                  {room.name}
                </h1>
                <div className='flex flex-wrap items-center gap-3 text-xs text-muted-foreground font-medium'>
                  {mode === 'derby' ? (
                    <Dialog>
                      <DialogTrigger asChild>
                        <button
                          className={`flex items-center gap-1 cursor-pointer hover:bg-background/80 transition-colors ${theme.iconColor} bg-background/50 px-2 py-1 rounded-md ring-1 ring-black/5 dark:ring-white/10`}
                        >
                          {theme.icon}
                          <span className='font-bold uppercase tracking-widest text-[9px]'>
                            {theme.label}
                          </span>
                          <HelpCircle className='w-3 h-3 opacity-60 ml-0.5' />
                        </button>
                      </DialogTrigger>
                      <DialogContent className='glass-panel border-0 sm:max-w-xl rounded-2xl'>
                        <DialogHeader>
                          <DialogTitle className='text-xl font-black uppercase tracking-tight text-red-600 dark:text-red-400 flex items-center gap-2'>
                            <Swords className='w-5 h-5' /> {t('Derby Mode FAQ')}
                          </DialogTitle>
                        </DialogHeader>
                        <div className='space-y-4 text-xs text-muted-foreground mt-2'>
                          <div>
                            <h4 className='font-bold text-foreground'>
                              {t(
                                'What is a Sprint and what does the timer mean?',
                              )}
                            </h4>
                            <p>
                              {t(
                                'Derby mode runs in continuous cycles called Sprints. The timer shows how much time is left until the current Sprint ends. When the timer hits zero, the player with the highest ELO is crowned Champion, achievements are awarded, and all Room ELOs undergo a 25% Soft Reset towards 1000 to keep the next Sprint competitive.',
                              )}
                            </p>
                          </div>
                          <div>
                            <h4 className='font-bold text-foreground'>
                              {t(
                                'Why does Room ELO start lower than Global ELO?',
                              )}
                            </h4>
                            <p>
                              {t(
                                'To keep the micro-league highly competitive, Derby mode compresses starting ELOs towards 1000. This ensures a tight leaderboard while giving a slight advantage to experienced players.',
                              )}
                            </p>
                            <div className='bg-muted/30 p-3 rounded-lg mt-1.5'>
                              <span className='font-mono text-[10px] block mb-1 text-foreground'>
                                {t('Formula: 500 + (Global ELO * 0.5)')}
                              </span>
                              <span className='text-[10px] text-muted-foreground/80'>
                                {t(
                                  'Example: If Global ELO is 1120, Room ELO becomes 1060.',
                                )}
                              </span>
                            </div>
                          </div>
                          <div>
                            <h4 className='font-bold text-foreground'>
                              {t(
                                'Why do Room ELO and Global ELO change differently?',
                              )}
                            </h4>
                            <p>
                              {t(
                                'Points gained or lost depend on the rating difference between players. Because Room ELOs are compressed, the gap between players is smaller, resulting in slightly more volatile rating changes inside the room.',
                              )}
                            </p>
                            <div className='bg-muted/30 p-3 rounded-lg mt-1.5'>
                              <span className='text-[10px] text-muted-foreground/80'>
                                {t(
                                  'Example: A 40-point gap globally might only be a 20-point gap in the room. This makes upsets more rewarding and losses slightly more punishing locally.',
                                )}
                              </span>
                            </div>
                          </div>
                          <div>
                            <h4 className='font-bold text-foreground'>
                              {t('What are Bounties and Nemesis?')}
                            </h4>
                            <p className='mb-1.5'>
                              {t(
                                'These are unique multipliers applied ONLY to Room ELO:',
                              )}
                            </p>
                            <ul className='list-disc pl-4 space-y-2 mt-1'>
                              <li>
                                <b className='text-foreground'>
                                  {t('Bounty:')}
                                </b>{' '}
                                {t(
                                  'A player with 3+ consecutive wins gets a bounty. Defeating them grants a bonus of (Streak - 2) * 5 ELO.',
                                )}
                                <div className='block text-[10px] mt-1.5 bg-muted/30 p-2 rounded-md'>
                                  {t(
                                    'Example: Stopping a 5-win streak gives +15 bonus ELO and the Giant Slayer badge.',
                                  )}
                                </div>
                              </li>
                              <li>
                                <b className='text-foreground'>
                                  {t('Nemesis:')}
                                </b>{' '}
                                {t(
                                  'An opponent you have a <40% win rate against. Beating your Nemesis multiplies your gained ELO by 1.5x.',
                                )}
                              </li>
                            </ul>
                          </div>
                        </div>
                      </DialogContent>
                    </Dialog>
                  ) : (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div
                            className={`flex items-center gap-1 cursor-help ${theme.iconColor} bg-background/50 px-2 py-1 rounded-md ring-1 ring-black/5 dark:ring-white/10`}
                          >
                            {theme.icon}
                            <span className='font-bold uppercase tracking-widest text-[9px]'>
                              {theme.label}
                            </span>
                          </div>
                        </TooltipTrigger>
                        <TooltipContent className='glass-panel border-0 text-xs'>
                          <p>{theme.description}</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )}

                  <div className='flex items-center gap-1.5'>
                    {room.isPublic ? (
                      <Globe className='w-3 h-3 opacity-70' />
                    ) : (
                      <Lock className='w-3 h-3 opacity-70' />
                    )}
                    <span className='uppercase tracking-widest text-[9px] font-bold'>
                      {room.isPublic ? t('Public') : t('Private')}
                    </span>
                  </div>
                  <div className='w-1 h-1 rounded-full bg-muted-foreground/30' />
                  <div className='flex items-center gap-1.5'>
                    <Users className='w-3 h-3 opacity-70' />
                    <span className='font-mono text-xs'>{memberCount}</span>
                  </div>
                </div>
              </div>

              <div className='flex items-center gap-2 shrink-0'>
                {!isMember &&
                  !room.isArchived &&
                  (hasPendingRequest ? (
                    <Button
                      onClick={onCancelJoin}
                      variant='secondary'
                      size='sm'
                      className='rounded-lg text-xs'
                    >
                      <X className='mr-1.5 h-3 w-3' />
                      {t('Cancel Request')}
                    </Button>
                  ) : (
                    room.isPublic && (
                      <Button
                        onClick={onJoin}
                        size='sm'
                        className='rounded-lg text-xs font-bold shadow-sm'
                      >
                        <LogIn className='mr-1.5 h-3 w-3' />
                        {t('Join Room')}
                      </Button>
                    )
                  ))}

                {isMember &&
                  !isCreator &&
                  !room.isArchived &&
                  !isManagedUser && (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant='outline'
                          size='icon'
                          className='h-8 w-8 rounded-lg hover:bg-destructive/10 hover:text-destructive border-border/50 text-muted-foreground'
                        >
                          <LogOut className='h-3.5 w-3.5' />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent className='glass-panel border-0 sm:rounded-2xl'>
                        <AlertDialogHeader>
                          <AlertDialogTitle className='text-xl'>
                            {t('Leave this room?')}
                          </AlertDialogTitle>
                          <AlertDialogDescription className='text-sm'>
                            {t(
                              "You won't be able to record matches here anymore.",
                            )}
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter className='mt-4 gap-2'>
                          <AlertDialogCancel className='h-9 text-xs rounded-lg'>
                            {t('Stay')}
                          </AlertDialogCancel>
                          <AlertDialogAction
                            onClick={onLeave}
                            className='bg-destructive hover:bg-destructive/90 h-9 text-xs rounded-lg'
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
                        className='h-8 w-8 rounded-lg hover:bg-muted border-border/50 text-muted-foreground'
                      >
                        <Settings className='h-3.5 w-3.5' />
                      </Button>
                    </DialogTrigger>
                    <RoomSettingsDialog room={room} members={members} />
                  </Dialog>
                )}
              </div>
            </div>

            {room.description && (
              <p className='text-muted-foreground text-sm font-light mt-3 max-w-2xl leading-relaxed'>
                {room.description}
              </p>
            )}

            {mode === 'derby' && (
              <div className='mt-5 flex flex-wrap gap-3'>
                <div className='flex items-center gap-3 bg-background/40 backdrop-blur-md ring-1 ring-black/5 dark:ring-white/10 rounded-xl p-2.5 shadow-sm pr-4'>
                  <div className='h-8 w-8 rounded-md bg-primary/10 flex items-center justify-center text-primary relative'>
                    <Zap className='w-4 h-4 fill-current' />
                    <span className='absolute -top-1 -right-1 flex h-2 w-2'>
                      <span className='animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75'></span>
                      <span className='relative inline-flex rounded-full h-2 w-2 bg-primary'></span>
                    </span>
                  </div>
                  <div>
                    <div className='text-[8px] uppercase font-bold text-muted-foreground tracking-widest mb-0.5 flex items-center gap-1'>
                      Sprint #{((room as any).sprintCount || 0) + 1}
                      <span className='text-primary opacity-100'>• LIVE</span>
                    </div>
                    <div className='text-sm font-black tracking-tight flex items-center gap-1.5 leading-none'>
                      <Clock className='w-3 h-3 text-muted-foreground' />
                      {timeLeft || t('Loading...')}
                    </div>
                  </div>
                </div>

                {showBounty && topBountyMember && (
                  <div className='flex items-center gap-3 bg-red-500/5 backdrop-blur-md ring-1 ring-red-500/20 rounded-xl p-2.5 shadow-sm pr-4'>
                    <Avatar className='h-8 w-8 ring-1 ring-red-500'>
                      <AvatarImage
                        src={topBountyMember.photoURL || undefined}
                      />
                      <AvatarFallback className='bg-red-500/10 text-red-600 text-[10px] font-bold'>
                        {(topBountyMember.name || '?')
                          .substring(0, 2)
                          .toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <div className='text-[8px] uppercase font-bold text-red-600 dark:text-red-400 tracking-widest mb-0.5 flex items-center gap-1'>
                        <Flame className='w-2.5 h-2.5 fill-current' />{' '}
                        {t('Most Wanted')}
                      </div>
                      <div className='text-xs font-bold leading-none'>
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