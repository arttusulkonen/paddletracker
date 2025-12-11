// src/components/rooms/RoomSettings.tsx
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
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	Input,
	Label,
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger,
	Textarea,
} from '@/components/ui';
import { useAuth } from '@/contexts/AuthContext';
import { useSport } from '@/contexts/SportContext';
import { useToast } from '@/hooks/use-toast';
import { db, storage } from '@/lib/firebase';
import type { Room } from '@/lib/types';
import {
	arrayUnion,
	collection,
	deleteDoc,
	doc,
	getDocs,
	query,
	updateDoc,
	where,
} from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytesResumable } from 'firebase/storage';
import { Archive, Image as ImageIcon, Trash2, Undo2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

interface RoomSettingsDialogProps {
  room: Room;
}

export function RoomSettingsDialog({ room }: RoomSettingsDialogProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const { toast } = useToast();
  const { config, sport } = useSport();
  const { user } = useAuth();

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

  const [selectedCommunityId, setSelectedCommunityId] = useState<string>(
    room.communityId || 'none'
  );
  const [myCommunities, setMyCommunities] = useState<any[]>([]);

  useEffect(() => {
    if (!user || !db) return;
    const fetchComms = async () => {
      const q = query(
        collection(db!, 'communities'),
        where('admins', 'array-contains', user.uid)
      );
      const snap = await getDocs(q);
      setMyCommunities(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    };
    fetchComms();
  }, [user]);

  const pick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null;
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (!f) return;

    const allowedMimeTypes = ['image/png', 'image/jpeg', 'image/webp'];
    const allowedExtensions = ['.jpg', '.jpeg', '.png', '.webp'];
    const fileExtension = f.name
      .substring(f.name.lastIndexOf('.'))
      .toLowerCase();

    if (
      !allowedMimeTypes.includes(f.type) &&
      !allowedExtensions.includes(fileExtension)
    ) {
      toast({
        title: t('Invalid image'),
        description: t('Use PNG/JPEG/WEBP up to 2MB.'),
        variant: 'destructive',
      });
      return;
    }
    if (f.size > 2 * 1024 * 1024) {
      toast({
        title: t('File too large'),
        description: t('Max size is 2MB.'),
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
    const storageRef = ref(storage!, path);
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
      const data: Partial<Room> & { communityId?: string | null } = {
        name,
        description,
        isPublic,
        communityId:
          selectedCommunityId === 'none' ? null : selectedCommunityId,
      };
      if (avatarBlob) data.avatarURL = await uploadAvatar();

      await updateDoc(doc(db!, config.collections.rooms, room.id), data);

      if (
        selectedCommunityId !== 'none' &&
        selectedCommunityId !== room.communityId
      ) {
        await updateDoc(doc(db!, 'communities', selectedCommunityId), {
          roomIds: arrayUnion(room.id),
        });
      }

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
      await updateDoc(doc(db!, config.collections.rooms, room.id), {
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
      await updateDoc(doc(db!, config.collections.rooms, room.id), {
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

  const handleDelete = async () => {
    setIsActing(true);
    try {
      await deleteDoc(doc(db!, config.collections.rooms, room.id));
      toast({
        title: t('Room deleted'),
        description: t('The room has been permanently removed.'),
      });
      router.push('/rooms');
    } catch (error) {
      console.error('Error deleting room:', error);
      toast({ title: t('Error deleting room'), variant: 'destructive' });
    } finally {
      setIsActing(false);
    }
  };

  return (
    <>
      <DialogContent className='sm:max-w-xl max-h-[85vh] overflow-hidden flex flex-col p-0 gap-0'>
        <DialogHeader className='p-6 pb-4'>
          <DialogTitle>{t('Room Settings')}</DialogTitle>
          <DialogDescription>
            {t("Manage your room's details and visibility.")}
          </DialogDescription>
        </DialogHeader>

        <Tabs
          defaultValue='general'
          className='flex-1 overflow-hidden flex flex-col'
        >
          <div className='px-6'>
            <TabsList className='grid w-full grid-cols-2'>
              <TabsTrigger value='general'>{t('General')}</TabsTrigger>
              <TabsTrigger value='danger'>{t('Danger')}</TabsTrigger>
            </TabsList>
          </div>

          <div className='flex-1 overflow-y-auto p-6'>
            <TabsContent value='general' className='space-y-6 mt-0'>
              <div className='flex items-start gap-6'>
                <div className='flex flex-col items-center gap-3'>
                  <Avatar className='h-24 w-24 border-2 border-border shadow-sm'>
                    <AvatarImage
                      src={avatarPreview ?? undefined}
                      className='object-cover'
                    />
                    <AvatarFallback>
                      <ImageIcon className='h-8 w-8 text-muted-foreground' />
                    </AvatarFallback>
                  </Avatar>
                  <Button
                    size='sm'
                    variant='outline'
                    onClick={() => fileInputRef.current?.click()}
                  >
                    {t('Change')}
                  </Button>
                  {uploadPct > 0 && (
                    <span className='text-[10px] text-muted-foreground'>
                      {uploadPct}%
                    </span>
                  )}
                  <Input
                    type='file'
                    ref={fileInputRef}
                    className='hidden'
                    accept='image/png,image/jpeg,image/webp'
                    onChange={pick}
                  />
                </div>
                <div className='flex-1 space-y-4'>
                  <div className='space-y-2'>
                    <Label htmlFor='room-name'>{t('Room Name')}</Label>
                    <Input
                      id='room-name'
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder={t('My Awesome Room')}
                    />
                  </div>
                  <div className='space-y-2'>
                    <Label htmlFor='room-description'>{t('Description')}</Label>
                    <Textarea
                      id='room-description'
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder={t('What is this room about?')}
                      rows={3}
                      className='resize-none'
                    />
                  </div>

                  <div className='space-y-2'>
                    <Label>{t('Community')}</Label>
                    <Select
                      value={selectedCommunityId}
                      onValueChange={setSelectedCommunityId}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={t('Select Community')} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value='none'>
                          {t('No Community')}
                        </SelectItem>
                        {myCommunities.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className='text-xs text-muted-foreground'>
                      {t(
                        'Link this room to a community to display it on the community page.'
                      )}
                    </p>
                  </div>
                </div>
              </div>
            </TabsContent>

            <TabsContent value='danger' className='space-y-4 mt-0'>
              <div className='border border-destructive/20 rounded-lg p-4 bg-destructive/5 space-y-4'>
                <div className='flex items-center justify-between'>
                  <div className='space-y-1'>
                    <h4 className='font-medium text-destructive'>
                      {room.isArchived
                        ? t('Unarchive Room')
                        : t('Archive Room')}
                    </h4>
                    <p className='text-sm text-muted-foreground'>
                      {room.isArchived
                        ? t('Restore this room to make it active again.')
                        : t('Hide this room and disable new matches.')}
                    </p>
                  </div>
                  {room.isArchived ? (
                    <Button
                      variant='outline'
                      size='sm'
                      onClick={handleUnarchive}
                      disabled={isActing}
                    >
                      <Undo2 className='w-4 h-4 mr-2' />
                      {t('Unarchive')}
                    </Button>
                  ) : (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant='outline'
                          size='sm'
                          className='text-destructive hover:bg-destructive/10 border-destructive/30'
                          disabled={isActing}
                        >
                          <Archive className='w-4 h-4 mr-2' />
                          {t('Archive')}
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>
                            {t('Archive this room?')}
                          </AlertDialogTitle>
                          <AlertDialogDescription>
                            {t(
                              'The room will be hidden and locked. History is preserved.'
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

                <div className='h-px bg-destructive/10' />

                <div className='flex items-center justify-between'>
                  <div className='space-y-1'>
                    <h4 className='font-medium text-destructive'>
                      {t('Delete Room')}
                    </h4>
                    <p className='text-sm text-muted-foreground'>
                      {t('Permanently remove this room and all its data.')}
                    </p>
                  </div>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant='destructive'
                        size='sm'
                        disabled={isActing}
                      >
                        <Trash2 className='w-4 h-4 mr-2' />
                        {t('Delete')}
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>
                          {t('Delete permanently?')}
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                          {t(
                            'This action cannot be undone. All match history and standings will be lost.'
                          )}
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>{t('Cancel')}</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={handleDelete}
                          className='bg-destructive hover:bg-destructive/90'
                        >
                          {t('Delete')}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
            </TabsContent>
          </div>
        </Tabs>

        <DialogFooter className='p-6 pt-0'>
          <Button
            onClick={handleSave}
            disabled={isSaving}
            className='w-full sm:w-auto'
          >
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
