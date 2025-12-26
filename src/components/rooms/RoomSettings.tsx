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
	Badge,
	Button,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	Input,
	Label,
	ScrollArea,
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
import type { Room, Member as RoomMember } from '@/lib/types';
import {
	arrayRemove,
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
import {
	Archive,
	Crown,
	Image as ImageIcon,
	Trash2,
	Undo2,
	UserPlus,
	X,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

interface RoomSettingsDialogProps {
  room: Room;
  members?: RoomMember[];
}

export function RoomSettingsDialog({
  room,
  members = [],
}: RoomSettingsDialogProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const { toast } = useToast();
  const { config, sport } = useSport();
  const { user } = useAuth();

  const [name, setName] = useState(room.name);
  const [description, setDescription] = useState(room.description ?? '');

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

  // Community logic
  const [selectedCommunityId, setSelectedCommunityId] = useState<string>(
    room.communityId || 'none'
  );
  const [myCommunities, setMyCommunities] = useState<any[]>([]);

  // Admin logic
  const [admins, setAdmins] = useState<string[]>(room.adminIds || []);
  const [newAdminId, setNewAdminId] = useState<string>('');

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

  // Image handlers
  const pick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null;
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (!f) return;
    const allowed = ['image/png', 'image/jpeg', 'image/webp'];
    if (!allowed.includes(f.type)) {
      toast({ title: t('Invalid image'), variant: 'destructive' });
      return;
    }
    const src = URL.createObjectURL(f);
    setAvatarSrc(src);
    setCropOpen(true);
  };

  const onCropped = (blob: Blob) => {
    setAvatarBlob(blob);
    setAvatarPreview(URL.createObjectURL(blob));
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

  // --- ACTIONS ---

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const data: Partial<Room> & { communityId?: string | null } = {
        name,
        description,
        communityId:
          selectedCommunityId === 'none' ? null : selectedCommunityId,
      };
      if (avatarBlob) data.avatarURL = await uploadAvatar();

      await updateDoc(doc(db!, config.collections.rooms, room.id), data);

      // Link room to community if changed
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

  const handleAddAdmin = async () => {
    if (!newAdminId) return;
    setIsActing(true);
    try {
      await updateDoc(doc(db!, config.collections.rooms, room.id), {
        adminIds: arrayUnion(newAdminId),
      });
      setAdmins((prev) => [...prev, newAdminId]);
      setNewAdminId('');
      toast({ title: t('Admin added') });
    } catch {
      toast({ title: t('Failed to add admin'), variant: 'destructive' });
    } finally {
      setIsActing(false);
    }
  };

  const handleRemoveAdmin = async (uid: string) => {
    setIsActing(true);
    try {
      await updateDoc(doc(db!, config.collections.rooms, room.id), {
        adminIds: arrayRemove(uid),
      });
      setAdmins((prev) => prev.filter((id) => id !== uid));
      toast({ title: t('Admin removed') });
    } catch {
      toast({ title: t('Failed to remove admin'), variant: 'destructive' });
    } finally {
      setIsActing(false);
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
      toast({ title: t('Room deleted') });
      router.push('/rooms');
    } catch {
      toast({ title: t('Error deleting room'), variant: 'destructive' });
    } finally {
      setIsActing(false);
    }
  };

  // ИСПОЛЬЗУЕМ ПРОП members ВМЕСТО room.members
  // Prepare lists for Admin UI
  // Fallback to room.members if prop is empty (though it shouldn't be if page is working)
  const actualMembers = members.length > 0 ? members : room.members || [];

  const availableMembers =
    actualMembers.filter(
      (m) =>
        !admins.includes(m.userId) &&
        m.userId !== room.creator &&
        m.userId !== room.createdBy
    ) || [];

  const adminProfiles =
    actualMembers.filter((m) => admins.includes(m.userId)) || [];

  return (
    <>
      <DialogContent className='sm:max-w-xl max-h-[85vh] overflow-hidden flex flex-col p-0 gap-0'>
        <DialogHeader className='p-6 pb-4'>
          <DialogTitle>{t('Room Settings')}</DialogTitle>
          <DialogDescription>
            {t("Manage your room's details and permissions.")}
          </DialogDescription>
        </DialogHeader>

        <Tabs
          defaultValue='general'
          className='flex-1 overflow-hidden flex flex-col'
        >
          <div className='px-6'>
            <TabsList className='grid w-full grid-cols-3'>
              <TabsTrigger value='general'>{t('General')}</TabsTrigger>
              <TabsTrigger value='roles'>{t('Roles')}</TabsTrigger>
              <TabsTrigger value='danger'>{t('Danger')}</TabsTrigger>
            </TabsList>
          </div>

          <div className='flex-1 overflow-y-auto p-6'>
            {/* GENERAL TAB */}
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
                    accept='image/*'
                    onChange={pick}
                  />
                </div>
                <div className='flex-1 space-y-4'>
                  <div className='space-y-2'>
                    <Label>{t('Room Name')}</Label>
                    <Input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                    />
                  </div>
                  <div className='space-y-2'>
                    <Label>{t('Description')}</Label>
                    <Textarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
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
                  </div>
                </div>
              </div>
            </TabsContent>

            {/* ROLES TAB */}
            <TabsContent value='roles' className='space-y-6 mt-0'>
              <div className='space-y-4'>
                <div className='flex flex-col gap-2'>
                  <Label>{t('Add Administrator')}</Label>
                  <div className='flex gap-2'>
                    <Select value={newAdminId} onValueChange={setNewAdminId}>
                      <SelectTrigger className='flex-1'>
                        <SelectValue
                          placeholder={t('Select member to promote')}
                        />
                      </SelectTrigger>
                      <SelectContent>
                        {availableMembers.length === 0 && (
                          <SelectItem value='none' disabled>
                            {t('No eligible members')}
                          </SelectItem>
                        )}
                        {availableMembers.map((m) => (
                          <SelectItem key={m.userId} value={m.userId}>
                            <div className='flex items-center gap-2'>
                              <Avatar className='h-5 w-5'>
                                <AvatarImage src={m.photoURL || undefined} />
                                <AvatarFallback>{m.name[0]}</AvatarFallback>
                              </Avatar>
                              <span>{m.name}</span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      onClick={handleAddAdmin}
                      disabled={!newAdminId || isActing}
                      size='icon'
                    >
                      <UserPlus className='h-4 w-4' />
                    </Button>
                  </div>
                  <p className='text-xs text-muted-foreground'>
                    {t('Admins can manage players and edit room settings.')}
                  </p>
                </div>

                <div className='border rounded-md'>
                  <div className='bg-muted/30 px-3 py-2 text-xs font-semibold text-muted-foreground border-b'>
                    {t('Current Administrators')}
                  </div>
                  <ScrollArea className='h-[200px]'>
                    <div className='p-2 space-y-1'>
                      {/* Creator */}
                      <div className='flex items-center justify-between p-2 rounded-md hover:bg-muted/50'>
                        <div className='flex items-center gap-3'>
                          <Avatar className='h-8 w-8'>
                            <AvatarFallback>
                              <Crown className='h-4 w-4 text-amber-500' />
                            </AvatarFallback>
                          </Avatar>
                          <div className='flex flex-col'>
                            <span className='text-sm font-medium'>
                              {t('Room Creator')}
                            </span>
                            <span className='text-[10px] text-muted-foreground uppercase'>
                              {t('Owner')}
                            </span>
                          </div>
                        </div>
                        <Badge
                          variant='outline'
                          className='border-amber-500/50 text-amber-600 bg-amber-50'
                        >
                          {t('Creator')}
                        </Badge>
                      </div>

                      {/* Admins List */}
                      {adminProfiles.map((m) => (
                        <div
                          key={m.userId}
                          className='flex items-center justify-between p-2 rounded-md hover:bg-muted/50 group'
                        >
                          <div className='flex items-center gap-3'>
                            <Avatar className='h-8 w-8 border'>
                              <AvatarImage src={m.photoURL || undefined} />
                              <AvatarFallback>{m.name[0]}</AvatarFallback>
                            </Avatar>
                            <div className='flex flex-col'>
                              <span className='text-sm font-medium'>
                                {m.name}
                              </span>
                              <span className='text-[10px] text-muted-foreground'>
                                {m.email}
                              </span>
                            </div>
                          </div>
                          <Button
                            size='icon'
                            variant='ghost'
                            className='h-8 w-8 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity'
                            onClick={() => handleRemoveAdmin(m.userId)}
                            disabled={isActing}
                          >
                            <X className='h-4 w-4' />
                          </Button>
                        </div>
                      ))}
                      {adminProfiles.length === 0 && (
                        <div className='p-4 text-center text-sm text-muted-foreground'>
                          {t('No additional administrators assigned.')}
                        </div>
                      )}
                    </div>
                  </ScrollArea>
                </div>
              </div>
            </TabsContent>

            {/* DANGER TAB */}
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
