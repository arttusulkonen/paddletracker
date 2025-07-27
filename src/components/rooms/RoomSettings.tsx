// src/components/rooms/RoomSettings.tsx
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
  Button,
  Checkbox,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Separator,
} from '@/components/ui';
import { useToast } from '@/hooks/use-toast';
import { db } from '@/lib/firebase';
import type { Room } from '@/lib/types';
import { doc, updateDoc } from 'firebase/firestore';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

interface RoomSettingsDialogProps {
  room: Room;
}

export function RoomSettingsDialog({ room }: RoomSettingsDialogProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const { toast } = useToast();
  const [name, setName] = useState(room.name);
  const [isPublic, setIsPublic] = useState(room.isPublic);
  const [isSaving, setIsSaving] = useState(false);
  const [isActing, setIsActing] = useState(false);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await updateDoc(doc(db, 'rooms', room.id), { name, isPublic });
      toast({ title: t('Settings saved') });
    } catch (error) {
      toast({ title: t('Error saving settings'), variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleArchive = async () => {
    setIsActing(true);
    try {
      await updateDoc(doc(db, 'rooms', room.id), {
        isArchived: true,
        archivedAt: new Date().toISOString(),
      });
      toast({ title: t('Room archived') });
      router.push('/rooms');
    } catch (error) {
      toast({ title: t('Error archiving room'), variant: 'destructive' });
    } finally {
      setIsActing(false);
    }
  };

  const handleUnarchive = async () => {
    setIsActing(true);
    try {
      await updateDoc(doc(db, 'rooms', room.id), { isArchived: false });
      toast({ title: t('Room unarchived') });
    } catch (error) {
      toast({ title: t('Error unarchiving room'), variant: 'destructive' });
    } finally {
      setIsActing(false);
    }
  };

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{t('Room Settings')}</DialogTitle>
        <DialogDescription>
          {t("Manage your room's details and settings.")}
        </DialogDescription>
      </DialogHeader>
      <div className='space-y-4 py-4'>
        <div className='space-y-2'>
          <Label htmlFor='room-name'>{t('Room Name')}</Label>
          <Input
            id='room-name'
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className='flex items-center space-x-2'>
          <Checkbox
            id='is-public'
            checked={isPublic}
            onCheckedChange={(v) => setIsPublic(!!v)}
          />
          <Label htmlFor='is-public'>{t('Public Room')}</Label>
        </div>
        <p className='text-xs text-muted-foreground'>
          {t(
            'Public rooms are visible to everyone and can be joined by request.'
          )}
        </p>
        <Separator />
        <div className='space-y-2'>
          <h4 className='font-medium text-destructive'>{t('Danger Zone')}</h4>
          {room.isArchived ? (
            <Button
              variant='outline'
              className='w-full'
              onClick={handleUnarchive}
              disabled={isActing}
            >
              {t('Unarchive Room')}
            </Button>
          ) : (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant='destructive'
                  className='w-full'
                  disabled={isActing}
                >
                  {t('Archive Room')}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{t('Archive this room?')}</AlertDialogTitle>
                  <AlertDialogDescription>
                    {t(
                      "The room will be hidden from lists and no new matches can be added. The match history will be preserved for ELO accuracy. This action can't be undone through the UI yet."
                    )}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{t('Cancel')}</AlertDialogCancel>
                  <AlertDialogAction onClick={handleArchive}>
                    {t('Yes, Archive')}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </div>
      <DialogFooter>
        <Button onClick={handleSave} disabled={isSaving}>
          {isSaving ? t('Saving...') : t('Save Changes')}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
