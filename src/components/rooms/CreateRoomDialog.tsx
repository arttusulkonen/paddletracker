// src/components/rooms/CreateRoomDialog.tsx
'use client';

import ImageCropDialog from '@/components/ImageCropDialog';
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Input,
  Label,
  ScrollArea,
  Textarea,
} from '@/components/ui';
import { useAuth } from '@/contexts/AuthContext';
import { useSport } from '@/contexts/SportContext';
import { useToast } from '@/hooks/use-toast';
import { db, storage } from '@/lib/firebase';
import { getUserLite } from '@/lib/friends';
import { getSuperAdminIds, withSuperAdmins } from '@/lib/superAdmins';
import type { UserProfile } from '@/lib/types';
import { getFinnishFormattedDate } from '@/lib/utils';
import {
  addDoc,
  arrayUnion,
  collection,
  doc,
  onSnapshot,
  query,
  where,
  writeBatch,
} from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytesResumable } from 'firebase/storage';
import { Image as ImageIcon, PlusCircle, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

interface CreateRoomDialogProps {
  onSuccess?: () => void;
}

const NAME_MAX = 60;
const DESC_MAX = 500;
const AVATAR_MAX_BYTES = 2 * 1024 * 1024;
const ACCEPT_MIME = 'image/png,image/jpeg,image/webp';

export function CreateRoomDialog({ onSuccess }: CreateRoomDialogProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const { user, userProfile } = useAuth();
  const { sport, config } = useSport();
  const { toast } = useToast();

  const [isOpen, setIsOpen] = useState(false);
  const [roomName, setRoomName] = useState('');
  const [roomDescription, setRoomDescription] = useState('');
  const [isPublic, setIsPublic] = useState(false);
  const [isRanked, setIsRanked] = useState(true);
  const [selectedFriends, setSelectedFriends] = useState<string[]>([]);
  const [friends, setFriends] = useState<UserProfile[]>([]);
  const [coPlayers, setCoPlayers] = useState<UserProfile[]>([]);
  const [search, setSearch] = useState('');
  const [isCreatingRoom, setIsCreatingRoom] = useState(false);

  const [avatarSrc, setAvatarSrc] = useState<string | null>(null);
  const [avatarBlob, setAvatarBlob] = useState<Blob | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [cropOpen, setCropOpen] = useState(false);
  const [uploadPct, setUploadPct] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!user || !isOpen) return;
    const unsub = onSnapshot(doc(db, 'users', user.uid), async (snap) => {
      if (!snap.exists()) return setFriends([]);
      const ids: string[] = snap.data().friends ?? [];
      const loaded = await Promise.all(
        ids.map(async (uid) => ({ uid, ...(await getUserLite(uid)) }))
      );
      setFriends(
        (loaded.filter(Boolean) as UserProfile[]).sort((a, b) =>
          (a.name ?? a.displayName ?? '').localeCompare(
            b.name ?? b.displayName ?? ''
          )
        )
      );
    });
    return () => unsub();
  }, [user, isOpen]);

  useEffect(() => {
    if (!user || !isOpen) return;
    const qRooms = query(
      collection(db, config.collections.rooms),
      where('memberIds', 'array-contains', user.uid)
    );
    const unsub = onSnapshot(qRooms, async (snap) => {
      const idsSet = new Set<string>();
      snap.forEach((d) => {
        const memberIds: string[] = d.data()?.memberIds ?? [];
        for (const id of memberIds) if (id && id !== user.uid) idsSet.add(id);
      });
      if (idsSet.size === 0) return setCoPlayers([]);
      const loaded = await Promise.all(
        Array.from(idsSet).map(async (uid) => ({
          uid,
          ...(await getUserLite(uid)),
        }))
      );
      setCoPlayers(
        (loaded.filter(Boolean) as UserProfile[]).sort((a, b) =>
          (a.name ?? a.displayName ?? '').localeCompare(
            b.name ?? b.displayName ?? ''
          )
        )
      );
    });
    return () => unsub();
  }, [user, isOpen, config.collections.rooms]);

  const { friendsAll, othersInSport, allCandidates } = useMemo(() => {
    const friendSet = new Set(friends.map((f) => f.uid));
    const others = coPlayers.filter((p) => !friendSet.has(p.uid));
    const byName = (a: UserProfile, b: UserProfile) =>
      (a.name ?? a.displayName ?? '').localeCompare(
        b.name ?? b.displayName ?? ''
      );
    const friendsSorted = [...friends].sort(byName);
    const othersSorted = [...others].sort(byName);
    const map = new Map<string, UserProfile>();
    for (const p of friendsSorted) map.set(p.uid, p);
    for (const p of othersSorted) if (!map.has(p.uid)) map.set(p.uid, p);
    return {
      friendsAll: friendsSorted,
      othersInSport: othersSorted,
      allCandidates: Array.from(map.values()),
    };
  }, [coPlayers, friends]);

  const filterFn = (p: UserProfile) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      (p.name ?? '').toLowerCase().includes(q) ||
      (p.displayName ?? '').toLowerCase().includes(q) ||
      (p.email ?? '').toLowerCase().includes(q)
    );
  };

  const filteredFriends = useMemo(
    () => friendsAll.filter(filterFn),
    [friendsAll, search]
  );
  const filteredOthers = useMemo(
    () => othersInSport.filter(filterFn),
    [othersInSport, search]
  );

  const toggleSelected = (uid: string, checked: boolean | string) => {
    const on = Boolean(checked);
    setSelectedFriends((prev) => {
      const set = new Set(prev);
      if (on) set.add(uid);
      else set.delete(uid);
      return Array.from(set);
    });
  };

  const onPickFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    console.log('--- onPickFile triggered ---');
    const f = e.target.files?.[0] ?? null;
    if (fileInputRef.current) fileInputRef.current.value = '';

    if (!f) {
      console.log('No file selected.');
      return;
    }

    const allowedMimeTypes = ACCEPT_MIME.split(',');
    const allowedExtensions = ['.jpg', '.jpeg', '.png', '.webp'];
    const fileExtension = f.name
      .substring(f.name.lastIndexOf('.'))
      .toLowerCase();

    const isValidType =
      allowedMimeTypes.includes(f.type) ||
      allowedExtensions.includes(fileExtension);

    if (!isValidType) {
      toast({
        title: t('Invalid image'),
        description: t('Use PNG/JPEG/WEBP format.'),
        variant: 'destructive',
      });
      return;
    }

    if (f.size > AVATAR_MAX_BYTES) {
      toast({
        title: t('Invalid image'),
        description: t('Max size is 2MB.'),
        variant: 'destructive',
      });
      return;
    }

    console.log('Validation passed. Opening crop dialog...');
    const src = URL.createObjectURL(f);
    setAvatarSrc(src);
    setCropOpen(true);
  };

  const onCropped = (blob: Blob) => {
    setAvatarBlob(blob);
    const url = URL.createObjectURL(blob);
    setAvatarPreview(url);
    setUploadPct(0);
  };

  const resetForm = () => {
    setRoomName('');
    setRoomDescription('');
    setIsPublic(false);
    setIsRanked(true);
    setSelectedFriends([]);
    setSearch('');
    setUploadPct(0);
    setAvatarSrc(null);
    setAvatarBlob(null);
    setAvatarPreview(null);
  };

  const validate = () => {
    const name = roomName.trim();
    const desc = roomDescription.trim();
    if (!user || !userProfile) {
      toast({
        title: t('Error'),
        description: t('Log in'),
        variant: 'destructive',
      });
      return false;
    }
    if (!name) {
      toast({
        title: t('Error'),
        description: t('Room name cannot be empty'),
        variant: 'destructive',
      });
      return false;
    }
    if (name.length > NAME_MAX) {
      toast({
        title: t('Error'),
        description: t('Name is too long'),
        variant: 'destructive',
      });
      return false;
    }
    if (desc.length > DESC_MAX) {
      toast({
        title: t('Error'),
        description: t('Description is too long'),
        variant: 'destructive',
      });
      return false;
    }
    return true;
  };

  const uploadAvatar = async (): Promise<string> => {
    if (!avatarBlob) return '';
    const path = `room-avatars/${sport}/${Date.now()}.jpg`;
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

  const handleCreateRoom = async () => {
    if (!validate()) return;
    setIsCreatingRoom(true);
    try {
      let avatarURL = '';
      if (avatarBlob) avatarURL = await uploadAvatar();
      const now = getFinnishFormattedDate();
      const meName = userProfile!.name ?? userProfile!.displayName ?? '';
      const meEmail = userProfile!.email ?? '';
      const invited = selectedFriends.map((uid) => {
        const f =
          allCandidates.find((x) => x.uid === uid) ??
          friends.find((x) => x.uid === uid);
        return {
          userId: uid,
          name: f?.name ?? f?.displayName ?? '',
          email: f?.email ?? '',
          rating: 1000,
          wins: 0,
          losses: 0,
          date: now,
          role: 'editor' as const,
        };
      });
      const initialMembers = [
        {
          userId: user!.uid,
          name: meName,
          email: meEmail,
          rating: 1000,
          wins: 0,
          losses: 0,
          date: now,
          role: 'admin' as const,
        },
        ...invited,
      ];
      const superAdmins = await getSuperAdminIds(true);
      const adminIds = withSuperAdmins(user!.uid, superAdmins);
      const memberIds = Array.from(new Set([user!.uid, ...selectedFriends]));
      const docRef = await addDoc(collection(db, config.collections.rooms), {
        name: roomName.trim(),
        description: roomDescription.trim(),
        avatarURL,
        creator: user!.uid,
        creatorName: meName,
        createdAt: now,
        members: initialMembers,
        isPublic,
        isRanked,
        memberIds,
        adminIds,
        isArchived: false,
        seasonHistory: [],
        joinRequests: [],
      });
      const batch = writeBatch(db);
      batch.update(doc(db, 'users', user!.uid), {
        rooms: arrayUnion(docRef.id),
      });
      selectedFriends.forEach((uid) =>
        batch.update(doc(db, 'users', uid), { rooms: arrayUnion(docRef.id) })
      );
      await batch.commit();
      toast({
        title: t('Success'),
        description: `${t('Room')} "${roomName.trim()}" ${t('created')}`,
      });
      resetForm();
      setIsOpen(false);
      onSuccess?.();
      router.push(`/rooms/${docRef.id}`);
    } catch {
      toast({
        title: t('Error'),
        description: t('Failed to create room'),
        variant: 'destructive',
      });
    } finally {
      setIsCreatingRoom(false);
      setUploadPct(0);
    }
  };

  const createDisabled =
    isCreatingRoom ||
    !roomName.trim() ||
    roomName.trim().length > NAME_MAX ||
    roomDescription.trim().length > DESC_MAX;

  return (
    <>
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogTrigger asChild>
          <Button size='lg'>
            <PlusCircle className='mr-2 h-5 w-5' />
            {t('Create New Room')}
          </Button>
        </DialogTrigger>
        <DialogContent className='sm:max-w-lg'>
          <DialogHeader>
            <DialogTitle>
              {t('Create a Match Room')}{' '}
              <span className='text-muted-foreground'>({config.name})</span>
            </DialogTitle>
            <DialogDescription>
              {t(
                'Set up a new space to track matches and stats with your friends.'
              )}
            </DialogDescription>
          </DialogHeader>
          <div className='grid gap-6 py-4'>
            <div className='flex flex-col items-center gap-4'>
              <Avatar className='h-24 w-24'>
                <AvatarImage
                  key={avatarPreview ?? 'no-img'}
                  src={avatarPreview ?? undefined}
                />
                <AvatarFallback>
                  <ImageIcon className='h-10 w-10 text-muted-foreground' />
                </AvatarFallback>
              </Avatar>
              <div className='flex items-center gap-2'>
                {/* --- НАЧАЛО ИЗМЕНЕНИЙ --- */}
                <Button variant='outline' asChild>
                  <Label
                    htmlFor='room-avatar-upload'
                    className='cursor-pointer inline-flex items-center justify-center'
                  >
                    {t('Upload Image')}
                  </Label>
                </Button>
                {/* --- КОНЕЦ ИЗМЕНЕНИЙ --- */}
                {avatarPreview && (
                  <Button
                    variant='ghost'
                    size='icon'
                    onClick={() => {
                      setAvatarSrc(null);
                      setAvatarBlob(null);
                      setAvatarPreview(null);
                      setUploadPct(0);
                    }}
                    aria-label={t('Remove image')}
                  >
                    <X className='h-4 w-4' />
                  </Button>
                )}
              </div>
              {/* --- НАЧАЛО ИЗМЕНЕНИЙ --- */}
              <Input
                id='room-avatar-upload'
                ref={fileInputRef}
                type='file'
                className='hidden'
                accept={ACCEPT_MIME}
                onChange={onPickFile}
              />
              {/* --- КОНЕЦ ИЗМЕНЕНИЙ --- */}
              <div className='text-xs text-muted-foreground'>
                {t('PNG/JPEG/WEBP up to 2MB')}
                {uploadPct > 0 && (
                  <span className='ml-2'>
                    {t('Upload')}: {uploadPct}%
                  </span>
                )}
              </div>
            </div>
            <div className='grid gap-2'>
              <Label htmlFor='roomName'>{t('Room Name')}</Label>
              <Input
                id='roomName'
                value={roomName}
                maxLength={NAME_MAX}
                onChange={(e) => setRoomName(e.target.value)}
                placeholder={t('Office Champs')}
              />
              <p className='text-xs text-muted-foreground'>
                {roomName.length}/{NAME_MAX}
              </p>
            </div>
            <div className='grid gap-2'>
              <Label htmlFor='roomDescription'>
                {t('Description')} ({t('optional')})
              </Label>
              <Textarea
                id='roomDescription'
                value={roomDescription}
                maxLength={DESC_MAX}
                onChange={(e) => setRoomDescription(e.target.value)}
                placeholder={t('A brief description of your room')}
              />
              <p className='text-xs text-muted-foreground'>
                {roomDescription.length}/{DESC_MAX}
              </p>
            </div>
            <div className='space-y-4'>
              <div className='flex items-start gap-2'>
                <Checkbox
                  id='isPublic'
                  checked={isPublic}
                  onCheckedChange={(c) => setIsPublic(Boolean(c))}
                />
                <div className='grid gap-1.5 leading-none'>
                  <Label htmlFor='isPublic'>{t('Make room public?')}</Label>
                  <p className='text-xs text-muted-foreground'>
                    {t(
                      'Public rooms are visible to all players. Private rooms are visible only to members.'
                    )}
                  </p>
                </div>
              </div>
              <div className='flex items-start gap-2'>
                <Checkbox
                  id='isRanked'
                  checked={isRanked}
                  onCheckedChange={(c) => setIsRanked(Boolean(c))}
                />
                <div className='grid gap-1.5 leading-none'>
                  <Label htmlFor='isRanked'>{t('Ranked Room')}</Label>
                  <p className='text-xs text-muted-foreground'>
                    {t("Matches will affect players' global ELO.")}
                  </p>
                </div>
              </div>
            </div>
            <div className='grid gap-2'>
              <Label className='text-sm font-medium'>
                {t('Invite players:')}
              </Label>
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('Search by name…')}
              />
              <ScrollArea className='h-40 mt-2 border rounded-md p-2'>
                {filteredFriends.length + filteredOthers.length > 0 ? (
                  <>
                    {filteredFriends.length > 0 && (
                      <>
                        <div className='px-2 pt-1 pb-2 text-xs uppercase tracking-wide text-muted-foreground'>
                          {t('Friends')}
                        </div>
                        {filteredFriends.map((p) => {
                          const displayName = p.name ?? p.displayName ?? '?';
                          return (
                            <label
                              key={p.uid}
                              className='flex items-center gap-2 py-1.5 px-2 rounded hover:bg-muted'
                            >
                              <Checkbox
                                checked={selectedFriends.includes(p.uid)}
                                onCheckedChange={(v) =>
                                  toggleSelected(p.uid, v)
                                }
                              />
                              <div className='flex items-center gap-2'>
                                <Avatar className='h-6 w-6'>
                                  <AvatarImage src={p.photoURL ?? undefined} />
                                  <AvatarFallback>
                                    {displayName.charAt(0)}
                                  </AvatarFallback>
                                </Avatar>
                                <span>{displayName}</span>
                              </div>
                            </label>
                          );
                        })}
                      </>
                    )}
                    {filteredOthers.length > 0 && (
                      <>
                        <div className='px-2 pt-3 pb-2 text-xs uppercase tracking-wide text-muted-foreground'>
                          {t('From your sport rooms')}
                        </div>
                        {filteredOthers.map((p) => {
                          const displayName = p.name ?? p.displayName ?? '?';
                          return (
                            <label
                              key={p.uid}
                              className='flex items-center gap-2 py-1.5 px-2 rounded hover:bg-muted'
                            >
                              <Checkbox
                                checked={selectedFriends.includes(p.uid)}
                                onCheckedChange={(v) =>
                                  toggleSelected(p.uid, v)
                                }
                              />
                              <div className='flex items-center gap-2'>
                                <Avatar className='h-6 w-6'>
                                  <AvatarImage src={p.photoURL ?? undefined} />
                                  <AvatarFallback>
                                    {displayName.charAt(0)}
                                  </AvatarFallback>
                                </Avatar>
                                <span>{displayName}</span>
                              </div>
                            </label>
                          );
                        })}
                      </>
                    )}
                  </>
                ) : (
                  <p className='text-muted-foreground text-sm text-center py-4'>
                    {t('No players to show here yet.')}
                  </p>
                )}
              </ScrollArea>
              <p className='text-xs text-muted-foreground'>
                {t(
                  'You can also invite more players later from the room page.'
                )}
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={handleCreateRoom} disabled={createDisabled}>
              {isCreatingRoom ? t('Creating…') : t('Create Room')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
