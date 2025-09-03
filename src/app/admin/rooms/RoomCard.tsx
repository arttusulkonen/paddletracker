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
} from '@/components/ui/alert-dialog';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { sportConfig } from '@/contexts/SportContext';
import { ImageIcon, Loader2, Trash2, Users } from 'lucide-react';

export interface RoomData {
  id: string;
  sport: string;
  name: string;
  creatorName: string;
  createdAt: string;
  avatarURL?: string;
  memberIds: string[];
}

interface RoomCardProps {
  room: RoomData;
  isDeleting: boolean;
  onDelete: (room: RoomData) => void;
}

export function RoomCard({ room, isDeleting, onDelete }: RoomCardProps) {
  const sportDetails = sportConfig[room.sport as keyof typeof sportConfig] || { name: 'Unknown', icon: null };

  return (
    <div className='border rounded-lg p-3 flex flex-col gap-3 transition-all hover:shadow-md relative'>
      {isDeleting && (
        <div className='absolute inset-0 bg-white/50 dark:bg-black/50 flex items-center justify-center rounded-lg z-10'>
          <Loader2 className='h-6 w-6 animate-spin' />
        </div>
      )}
      <div className='flex items-start gap-3'>
        <Avatar className='h-10 w-10'>
          <AvatarImage src={room.avatarURL} />
          <AvatarFallback>
            <ImageIcon className='h-5 w-5 text-muted-foreground' />
          </AvatarFallback>
        </Avatar>
        <div className='flex-1 min-w-0'>
          <div className='font-semibold truncate'>{room.name}</div>
          <div className='text-xs text-muted-foreground'>
            Created by {room.creatorName}
          </div>
          <div className='flex items-center gap-2 mt-1.5'>
            <Badge variant='outline' className='flex items-center gap-1 text-xs'>
              {sportDetails.icon} {sportDetails.name}
            </Badge>
            <Badge variant='secondary' className='flex items-center gap-1 text-xs'>
              <Users className='h-3 w-3' /> {room.memberIds.length}
            </Badge>
          </div>
        </div>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              size='icon'
              variant='ghost'
              className='h-7 w-7 text-destructive hover:bg-destructive/10 hover:text-destructive'
              disabled={isDeleting}
            >
              <Trash2 className='h-4 w-4' />
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Are you sure?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently delete the room "{room.name}", all its matches, and remove it from all users' profiles. This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={() => onDelete(room)}>
                Yes, delete room
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}

