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
	Card,
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
} from 'lucide-react';
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
    <Card className={`mb-8 shadow-sm overflow-hidden border ${theme.border}`}>
      <div className={`relative px-6 py-8 md:px-8 ${theme.bg}`}>
        <div className='flex flex-col md:flex-row gap-6 items-center'>
          <div className='flex-shrink-0'>
            <Avatar className='h-24 w-24 border-4 border-background shadow-sm'>
              <AvatarImage
                src={room.avatarURL || undefined}
                className='object-cover'
              />
              <AvatarFallback className='text-3xl font-bold text-muted-foreground bg-white dark:bg-secondary'>
                {room.name[0]?.toUpperCase()}
              </AvatarFallback>
            </Avatar>
          </div>

          <div className='flex-grow space-y-3 min-w-0 w-full'>
            <div className='flex flex-col md:flex-row md:items-center justify-between gap-4'>
              <div>
                <h1 className='text-3xl font-bold tracking-tight text-foreground truncate'>
                  {room.name}
                </h1>

                <div className='flex flex-wrap items-center gap-x-4 gap-y-2 mt-2 text-sm text-muted-foreground font-medium'>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div
                          className={`flex items-center gap-1.5 cursor-help ${theme.iconColor}`}
                        >
                          {theme.icon}
                          <span>{theme.label}</span>
                          <HelpCircle className='w-3 h-3 opacity-50' />
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className='max-w-xs text-xs'>{theme.description}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>

                  <div className='w-1 h-1 rounded-full bg-muted-foreground/30' />

                  <div className='flex items-center gap-1.5'>
                    {room.isPublic ? (
                      <>
                        <Globe className='w-3.5 h-3.5' />
                        <span>{t('Public')}</span>
                      </>
                    ) : (
                      <>
                        <Lock className='w-3.5 h-3.5' />
                        <span>{t('Private')}</span>
                      </>
                    )}
                  </div>

                  <div className='w-1 h-1 rounded-full bg-muted-foreground/30' />

                  <div className='flex items-center gap-1.5'>
                    <Users className='w-3.5 h-3.5' />
                    <span>{memberCount}</span>
                  </div>
                </div>
              </div>

              <div className='flex items-center gap-2 mt-2 md:mt-0 flex-shrink-0'>
                {!isMember && !room.isArchived && (
                  <>
                    {hasPendingRequest ? (
                      <Button
                        onClick={onCancelJoin}
                        variant='secondary'
                        size='sm'
                      >
                        <X className='mr-2 h-4 w-4' />
                        {t('Cancel Request')}
                      </Button>
                    ) : (
                      room.isPublic && (
                        <Button onClick={onJoin} size='sm'>
                          <LogIn className='mr-2 h-4 w-4' />
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
                          size='sm'
                          className='text-destructive hover:text-destructive'
                        >
                          <LogOut className='mr-2 h-4 w-4' />
                          {t('Leave')}
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>
                            {t('Leave this room?')}
                          </AlertDialogTitle>
                          <AlertDialogDescription>
                            {t(
                              "You won't be able to record matches here anymore.",
                            )}
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>{t('Stay')}</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={onLeave}
                            className='bg-destructive text-destructive-foreground hover:bg-destructive/90'
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
                      <Button variant='outline' size='icon'>
                        <Settings className='h-4 w-4' />
                      </Button>
                    </DialogTrigger>
                    <RoomSettingsDialog room={room} members={members} />{' '}
                  </Dialog>
                )}
              </div>
            </div>

            {room.description ? (
              <p className='text-muted-foreground text-sm leading-relaxed max-w-2xl'>
                {room.description}
              </p>
            ) : (
              <p className='text-muted-foreground/70 text-sm leading-relaxed max-w-2xl italic'>
                {theme.description}
              </p>
            )}

            {showBounty && topBountyMember && (
              <div className='mt-4 flex items-center gap-3 bg-red-500/10 border border-red-500/20 rounded-lg p-3 max-w-2xl'>
                <Avatar className='h-10 w-10 border-2 border-red-500 shadow-[0_0_10px_rgba(239,68,68,0.3)]'>
                  <AvatarImage src={topBountyMember.photoURL || undefined} />
                  <AvatarFallback className='bg-red-100 text-red-700'>
                    {(topBountyMember.name || '?')
                      .substring(0, 2)
                      .toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <div className='text-sm font-bold text-red-600 dark:text-red-400 flex items-center gap-1.5'>
                    <Flame className='w-4 h-4 fill-current animate-pulse' />
                    {t('Most Wanted')}
                  </div>
                  <div className='text-xs text-muted-foreground'>
                    {t('Defeat')}{' '}
                    <span className='font-semibold text-foreground'>
                      {topBountyMember.name}
                    </span>{' '}
                    {t('to claim a')}{' '}
                    <span className='font-bold text-red-500'>
                      +{bountyPoints} ELO
                    </span>{' '}
                    {t('bounty!')}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}
