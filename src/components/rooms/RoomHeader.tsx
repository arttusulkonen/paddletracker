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
  CardDescription,
  CardHeader,
  CardTitle,
  Dialog,
  DialogTrigger,
} from '@/components/ui';
import type { Room } from '@/lib/types';
import { LogIn, LogOut, Settings, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { RoomSettingsDialog } from './RoomSettings';

interface RoomHeaderProps {
  room: Room;
  isMember: boolean;
  hasPendingRequest: boolean;
  isCreator: boolean;
  onJoin: () => void;
  onCancelJoin: () => void;
  onLeave: () => void;
}

export function RoomHeader({
  room,
  isMember,
  hasPendingRequest,
  isCreator,
  onJoin,
  onCancelJoin,
  onLeave,
}: RoomHeaderProps) {
  const { t } = useTranslation();

  return (
    <Card className='mb-8 shadow-xl'>
      <CardHeader className='bg-muted/50 p-6 flex flex-col md:flex-row items-center gap-6 md:justify-between'>
        <div className='flex flex-col sm:flex-row items-center gap-4 text-center sm:text-left'>
          <Avatar className='h-20 w-20 md:h-24 md:w-24 border-4 border-background shadow-md'>
            <AvatarImage src={room.avatarURL || undefined} />
            <AvatarFallback>{room.name[0]}</AvatarFallback>
          </Avatar>
          <div className='flex-grow'>
            <CardTitle className='text-2xl md:text-3xl font-bold'>
              {room.name}
            </CardTitle>
            {room.description && (
              <CardDescription className='mt-1 max-w-xl'>
                {room.description}
              </CardDescription>
            )}
          </div>
        </div>

        <div className='w-full md:w-auto'>
          {!isMember &&
            room.isPublic &&
            !room.isArchived &&
            (hasPendingRequest ? (
              <Button
                onClick={onCancelJoin}
                variant='outline'
                className='w-full md:w-auto'
              >
                <X className='mr-2 h-4 w-4' />
                {t('Cancel Request')}
              </Button>
            ) : (
              <Button onClick={onJoin} className='w-full md:w-auto'>
                <LogIn className='mr-2 h-4 w-4' />
                {t('Request to Join')}
              </Button>
            ))}
          {isMember && !isCreator && !room.isArchived && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant='destructive' className='w-full md:w-auto'>
                  <LogOut className='mr-2 h-4 w-4' />
                  {t('Leave Room')}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{t('Are you sure?')}</AlertDialogTitle>
                  <AlertDialogDescription>
                    {t(
                      "You will lose access to this room's stats and matches. You can rejoin later if it's a public room."
                    )}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{t('Cancel')}</AlertDialogCancel>
                  <AlertDialogAction onClick={onLeave}>
                    {t('Yes, Leave')}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
          {isMember && isCreator && (
            <div className='flex justify-end'>
              <Dialog>
                <DialogTrigger asChild>
                  <Button variant='outline' size='icon'>
                    <Settings className='h-4 w-4' />
                  </Button>
                </DialogTrigger>
                <RoomSettingsDialog room={room} />
              </Dialog>
            </div>
          )}
        </div>
      </CardHeader>
    </Card>
  );
}
