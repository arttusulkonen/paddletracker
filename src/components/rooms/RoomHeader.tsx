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
      <CardHeader className='bg-muted/50 p-6 flex flex-col md:flex-row items-center gap-6'>
        <div className='flex-1 flex items-center gap-6'>
          <Avatar className='h-24 w-24 border-4 border-background shadow-md'>
            <AvatarImage src={room.avatarURL || undefined} />
            <AvatarFallback>{room.name[0]}</AvatarFallback>
          </Avatar>
          <div className='text-center md:text-left'>
            <CardTitle className='text-3xl font-bold'>{room.name}</CardTitle>
          </div>
        </div>
        <div>
          {!isMember &&
            room.isPublic &&
            !room.isArchived &&
            (hasPendingRequest ? (
              <Button onClick={onCancelJoin} variant='outline'>
                <X className='mr-2 h-4 w-4' />
                {t('Cancel Request')}
              </Button>
            ) : (
              <Button onClick={onJoin}>
                <LogIn className='mr-2 h-4 w-4' />
                {t('Request to Join')}
              </Button>
            ))}
          {isMember && !isCreator && !room.isArchived && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant='destructive'>
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
            <Dialog>
              <DialogTrigger asChild>
                <Button variant='outline' size='icon'>
                  <Settings className='h-4 w-4' />
                </Button>
              </DialogTrigger>
              <RoomSettingsDialog room={room} />
            </Dialog>
          )}
        </div>
      </CardHeader>
    </Card>
  );
}
