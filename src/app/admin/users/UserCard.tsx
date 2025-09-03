// src/app/admin/users/UserCard.tsx
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
import { Input } from '@/components/ui/input';
import {
  Check,
  Edit,
  Eye,
  Loader2,
  MessageSquareQuote,
  Trash2,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

type SportKey = 'pingpong' | 'tennis' | 'badminton';
type U = {
  uid: string;
  email: string;
  name?: string;
  displayName?: string;
  photoURL?: string | null;
  isPublic?: boolean;
  approved?: boolean;
  approvalReason?: string;
  sports?: {
    [K in SportKey]?: {
      globalElo?: number;
    };
  };
};

function sportStat(u: U, k: SportKey) {
  const s = u.sports?.[k];
  const elo = s?.globalElo ?? 1000;
  return { elo };
}

interface UserCardProps {
  user: U;
  isDeleting: boolean;
  onApprove: (user: U) => void;
  onTogglePublic: (user: U) => void;
  onDelete: (user: U) => void;
  onSaveName: (user: U, newName: string) => void;
}

export function UserCard({
  user,
  isDeleting,
  onApprove,
  onTogglePublic,
  onDelete,
  onSaveName,
}: UserCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState(user.name || user.displayName || '');

  const nameShown = user.name || user.displayName || '—';
  const pp = sportStat(user, 'pingpong');
  const tn = sportStat(user, 'tennis');
  const bd = sportStat(user, 'badminton');

  const handleSave = () => {
    onSaveName(user, name);
    setIsEditing(false);
  };

  return (
    <div className='border rounded-lg p-3 flex flex-col gap-3 transition-all hover:shadow-md relative'>
      {isDeleting && (
        <div className='absolute inset-0 bg-white/50 dark:bg-black/50 flex items-center justify-center rounded-lg z-10'>
          <Loader2 className='h-6 w-6 animate-spin' />
        </div>
      )}
      <div className='flex items-start gap-3'>
        <Avatar className='h-10 w-10'>
          <AvatarImage src={user.photoURL ?? undefined} />
          <AvatarFallback>{nameShown.slice(0, 1).toUpperCase()}</AvatarFallback>
        </Avatar>
        <div className='flex-1 min-w-0'>
          {isEditing ? (
            <div className='flex items-center gap-1'>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className='h-8'
                onKeyDown={(e) => e.key === 'Enter' && handleSave()}
                disabled={isDeleting}
              />
              <Button
                size='icon'
                className='h-8 w-8'
                onClick={handleSave}
                disabled={isDeleting}
              >
                <Check className='h-4 w-4' />
              </Button>
              <Button
                size='icon'
                variant='ghost'
                className='h-8 w-8'
                onClick={() => setIsEditing(false)}
                disabled={isDeleting}
              >
                <X className='h-4 w-4' />
              </Button>
            </div>
          ) : (
            <div className='flex items-center gap-1'>
              <Link
                href={`/profile/${user.uid}`}
                className='font-semibold truncate hover:underline'
              >
                {nameShown}
              </Link>
              <Button
                size='icon'
                variant='ghost'
                className='h-6 w-6'
                onClick={() => setIsEditing(true)}
                disabled={isDeleting}
              >
                <Edit className='h-3 w-3' />
              </Button>
            </div>
          )}
          <div className='text-xs text-muted-foreground truncate'>
            {user.email}
          </div>
          <div className='flex items-center gap-2 mt-1.5'>
            {user.approved ? (
              <Badge variant='default' className='text-xs'>
                Approved
              </Badge>
            ) : (
              <Badge variant='secondary' className='text-xs'>
                Pending
              </Badge>
            )}
            {user.isPublic ?? true ? (
              <Badge variant='outline' className='text-xs'>
                Public
              </Badge>
            ) : (
              <Badge variant='outline' className='text-xs bg-gray-100'>
                Private
              </Badge>
            )}
          </div>
        </div>
        <div className='flex flex-col items-end gap-1'>
          <Link href={`/profile/${user.uid}`} passHref>
            <Button
              size='icon'
              variant='ghost'
              className='h-7 w-7'
              disabled={isDeleting}
            >
              <Eye className='h-4 w-4' />
            </Button>
          </Link>
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
                  This action will permanently delete the user document for{' '}
                  {nameShown}. This cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={() => onDelete(user)}>
                  Yes, delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      {!user.approved && user.approvalReason && (
        <div className='text-xs text-muted-foreground border-l-2 border-primary/50 pl-2 italic flex gap-2'>
          <MessageSquareQuote className='h-4 w-4 flex-shrink-0 mt-0.5' />
          <span>{user.approvalReason}</span>
        </div>
      )}

      <div className='grid grid-cols-3 gap-2 text-xs'>
        <div className='border rounded p-1.5 text-center'>
          <div className='font-medium'>Pingpong</div>
          <div>{pp.elo} ELO</div>
        </div>
        <div className='border rounded p-1.5 text-center'>
          <div className='font-medium'>Tennis</div>
          <div>{tn.elo} ELO</div>
        </div>
        <div className='border rounded p-1.5 text-center'>
          <div className='font-medium'>Badminton</div>
          <div>{bd.elo} ELO</div>
        </div>
      </div>

      <div className='flex gap-2'>
        {!user.approved && (
          <Button
            size='sm'
            className='flex-1'
            onClick={() => onApprove(user)}
            disabled={isDeleting}
          >
            Approve
          </Button>
        )}
        <Button
          size='sm'
          variant='outline'
          className='flex-1'
          onClick={() => onTogglePublic(user)}
          disabled={isDeleting}
        >
          {user.isPublic ?? true ? 'Make Private' : 'Make Public'}
        </Button>
      </div>
    </div>
  );
}
