'use client';

import ImageCropDialog from '@/components/ImageCropDialog';
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
	Checkbox,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	Input,
	Label,
	Separator,
	Textarea,
} from '@/components/ui';
import { useSport } from '@/contexts/SportContext';
import { useToast } from '@/hooks/use-toast';
import { db, storage } from '@/lib/firebase';
import type { Room } from '@/lib/types';
import { deleteDoc, doc, updateDoc } from 'firebase/firestore'; // <-- Добавлен deleteDoc
import { getDownloadURL, ref, uploadBytesResumable } from 'firebase/storage';
import { Image as ImageIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

interface RoomSettingsDialogProps {
  room: Room;
}

export function RoomSettingsDialog({ room }: RoomSettingsDialogProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const { toast } = useToast();
  const { config, sport } = useSport();

  const [name, setName] = useState(room.name);
  const [description, setDescription] = useState(room.description ?? '');
  const [isPublic, setIsPublic] = useState(room.isPublic);
  const [isSaving, setIsSaving] = useState(false);
  const [isActing, setIsActing] = useState(false);

  const [avatarPreview, setAvatarPreview] = useState<string | null>(
    room.avatarURL ?? null
  );
  const [avatarSrc, setAvatarSrc] = useState<string | null>(null);
  const [avatarBlob, setAvatarBlob] = useState<Blob | null>(null);
  const [cropOpen, setCropOpen] = useState(false);
  const [uploadPct, setUploadPct] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const pick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null;
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (!f) return;

    const allowedMimeTypes = ['image/png', 'image/jpeg', 'image/webp'];
    const allowedExtensions = ['.jpg', '.jpeg', '.png', '.webp'];
    const fileExtension = f.name
      .substring(f.name.lastIndexOf('.'))
      .toLowerCase();

    const isValidType =
      allowedMimeTypes.includes(f.type) ||
      allowedExtensions.includes(fileExtension);
    const isValidSize = f.size <= 2 * 1024 * 1024;

    if (!isValidType || !isValidSize) {
      toast({
        title: t('Invalid image'),
        description: t('Use PNG/JPEG/WEBP up to 2MB.'),
        variant: 'destructive',
      });
      return;
    }

    const src = URL.createObjectURL(f);
    setAvatarSrc(src);
    setCropOpen(true);
  };

  const onCropped = (blob: Blob) => {
    setAvatarBlob(blob);
    const url = URL.createObjectURL(blob);
    setAvatarPreview(url);
  };

  const uploadAvatar = async (): Promise<string> => {
    if (!avatarBlob) return room.avatarURL ?? '';
    const path = `room-avatars/${sport}/${room.id}-${Date.now()}.jpg`;
    const storageRef = ref(storage, path);
    const task = uploadBytesResumable(storageRef, avatarBlob);
    return await new Promise<string>((resolve, reject) => {
      task.on(
        'state_changed',
        (snap) =>
          setUploadPct(
            Math.round((snap.bytesTransferred / snap.totalBytes) * 100)
          ),
        (err) => reject(err),
        async () => resolve(await getDownloadURL(task.snapshot.ref))
      );
    });
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const data: Partial<Room> = { name, description, isPublic };
      if (avatarBlob) data.avatarURL = await uploadAvatar();
      await updateDoc(doc(db, config.collections.rooms, room.id), data);
      toast({ title: t('Settings saved successfully') });
      router.refresh();
    } catch {
      toast({ title: t('Error saving settings'), variant: 'destructive' });
    } finally {
      setIsSaving(false);
      setUploadPct(0);
    }
  };

  const handleArchive = async () => {
    setIsActing(true);
    try {
      await updateDoc(doc(db, config.collections.rooms, room.id), {
        isArchived: true,
        archivedAt: new Date().toISOString(),
      });
      toast({ title: t('Room archived') });
      router.push('/rooms');
    } catch {
      toast({ title: t('Error archiving room'), variant: 'destructive' });
    } finally {
      setIsActing(false);
    }
  };

  const handleUnarchive = async () => {
    setIsActing(true);
    try {
      await updateDoc(doc(db, config.collections.rooms, room.id), {
        isArchived: false,
      });
      toast({ title: t('Room unarchived') });
      router.refresh();
    } catch {
      toast({ title: t('Error unarchiving room'), variant: 'destructive' });
    } finally {
      setIsActing(false);
    }
  };
  
  // New function for deleting the room
  const handleDelete = async () => {
    setIsActing(true);
    try {
      await deleteDoc(doc(db, config.collections.rooms, room.id));
      toast({ title: t('Room deleted'), description: t('The room has been permanently removed.') });
      // Redirect to the room list page after successful deletion
      router.push('/rooms');
    } catch (error) {
      console.error("Error deleting room:", error);
      toast({ title: t('Error deleting room'), variant: 'destructive' });
    } finally {
      setIsActing(false);
    }
  };

  return (
    <>
      <DialogContent className='sm:max-w-lg'>
        <DialogHeader>
          <DialogTitle>{t('Room Settings')}</DialogTitle>
          <DialogDescription>
            {t("Manage your room's details and settings.")}
          </DialogDescription>
        </DialogHeader>
        <div className='space-y-6 py-4 max-h-[70vh] overflow-y-auto pr-4'>
          <div className='flex flex-col items-center gap-4'>
            <Avatar className='h-24 w-24'>
              <AvatarImage src={avatarPreview ?? undefined} />
              <AvatarFallback>
                <ImageIcon className='h-10 w-10 text-muted-foreground' />
              </AvatarFallback>
            </Avatar>
            <div className='flex gap-2 items-center'>
              <Button
                variant='outline'
                onClick={() => fileInputRef.current?.click()}
              >
                {t('Change Image')}
              </Button>
              {uploadPct > 0 && (
                <span className='text-xs text-muted-foreground'>
                  {uploadPct}%
                </span>
              )}
            </div>
            <Input
              type='file'
              ref={fileInputRef}
              className='hidden'
              accept='image/png,image/jpeg,image/webp'
              onChange={pick}
            />
          </div>
          <div className='space-y-2'>
            <Label htmlFor='room-name'>{t('Room Name')}</Label>
            <Input
              id='room-name'
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className='space-y-2'>
            <Label htmlFor='room-description'>{t('Description')}</Label>
            <Textarea
              id='room-description'
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('A brief description about this room')}
            />
          </div>
          <div className='flex items-center space-x-2 pt-2'>
            <Checkbox
              id='is-public'
              checked={isPublic}
              onCheckedChange={(v) => setIsPublic(!!v)}
            />
            <Label htmlFor='is-public'>{t('Public Room')}</Label>
          </div>
          <Separator />
          <p className='text-xs text-muted-foreground'>
            {t(
              'Public rooms are visible to everyone and can be joined by request.'
            )}
          </p>
          <Separator />
          <div className='space-y-2'>
            <h4 className='font-medium text-destructive'>{t('Danger Zone')}</h4>
            
            {/* Archive / Unarchive Block */}
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
                    <AlertDialogTitle>
                      {t('Archive this room?')}
                    </AlertDialogTitle>
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

            {/* Delete Room Block */}
            <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant='destructive'
                    className='w-full mt-2' // Added margin top for separation
                    disabled={isActing}
                  >
                    {t('Delete Room')}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>
                      {t('Permanently delete this room?')}
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                      {t(
                        "This action cannot be undone. All room data, including its match history and member standings, will be permanently removed. Players' Global ELO will remain unaffected, but their Room ELO history will be lost."
                      )}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>{t('Cancel')}</AlertDialogCancel>
                    <AlertDialogAction onClick={handleDelete} className='bg-red-600 hover:bg-red-700'>
                      {t('Yes, Delete Permanently')}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? t('Saving...') : t('Save Changes')}
          </Button>
        </DialogFooter>
      </DialogContent>
      <ImageCropDialog
        open={cropOpen}
        onOpenChange={setCropOpen}
        image={avatarSrc}
        aspect={1}
        onCropped={onCropped}
        title={t('Adjust image')}
      />
    </>
  );
}