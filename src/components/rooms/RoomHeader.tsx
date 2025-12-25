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
} from '@/components/ui';
import type { Room, Member as RoomMember } from '@/lib/types';
import {
	Briefcase,
	Gamepad2,
	Globe,
	Lock,
	LogIn,
	LogOut,
	Medal,
	Settings,
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

  const mode = room.mode || 'office';
  const memberCount = room.memberIds?.length || 0;

  // Настройка темы
  const getTheme = () => {
    switch (mode) {
      case 'professional':
        return {
          bg: 'bg-amber-50/50 dark:bg-amber-950/10',
          border: 'border-amber-200 dark:border-amber-900',
          iconColor: 'text-amber-600 dark:text-amber-500',
          icon: <Medal className='w-4 h-4' />,
          label: t('Professional'),
        };
      case 'arcade':
        return {
          bg: 'bg-purple-50/50 dark:bg-purple-950/10',
          border: 'border-purple-200 dark:border-purple-900',
          iconColor: 'text-purple-600 dark:text-purple-500',
          icon: <Gamepad2 className='w-4 h-4' />,
          label: t('Arcade'),
        };
      default:
        return {
          bg: 'bg-slate-50/50 dark:bg-slate-950/10',
          border: 'border-slate-200 dark:border-slate-800',
          iconColor: 'text-slate-600 dark:text-slate-500',
          icon: <Briefcase className='w-4 h-4' />,
          label: t('Office'),
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
                  <div
                    className={`flex items-center gap-1.5 ${theme.iconColor}`}
                  >
                    {theme.icon}
                    <span>{theme.label}</span>
                  </div>
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

                {isMember && !isCreator && !room.isArchived && (
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
                            "You won't be able to record matches here anymore."
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

                {/* ИСПРАВЛЕНИЕ: Кнопка настроек показывается, если isCreator (без isMember) */}
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

            {room.description && (
              <p className='text-muted-foreground text-sm leading-relaxed max-w-2xl'>
                {room.description}
              </p>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}
