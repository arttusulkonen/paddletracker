// src/components/rooms/CreateRoomDialog.tsx
'use client';

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
  writeBatch,
} from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { Image as ImageIcon, PlusCircle, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

interface CreateRoomDialogProps {
  onSuccess?: () => void;
}

export function CreateRoomDialog({ onSuccess }: CreateRoomDialogProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const { user, userProfile } = useAuth();
  const { config } = useSport();
  const { toast } = useToast();

  const [isOpen, setIsOpen] = useState(false);
  const [roomName, setRoomName] = useState('');
  const [roomDescription, setRoomDescription] = useState('');
  const [isPublic, setIsPublic] = useState(false);
  const [isRanked, setIsRanked] = useState(true);
  const [selectedFriends, setSelectedFriends] = useState<string[]>([]);
  const [friends, setFriends] = useState<UserProfile[]>([]);
  const [isCreatingRoom, setIsCreatingRoom] = useState(false);

  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!user || !isOpen) return;
    const unsubFriends = onSnapshot(
      doc(db, 'users', user.uid),
      async (snap) => {
        if (!snap.exists()) return setFriends([]);
        const ids: string[] = snap.data().friends ?? [];
        const loaded = await Promise.all(
          ids.map(async (uid) => ({ uid, ...(await getUserLite(uid)) }))
        );
        setFriends(loaded.filter(Boolean) as UserProfile[]);
      }
    );
    return () => unsubFriends();
  }, [user, isOpen]);

  const inviteCandidates = useMemo(() => {
    return friends.sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''));
  }, [friends]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setAvatarFile(file);
      setAvatarPreview(URL.createObjectURL(file));
    }
  };

  const resetForm = () => {
    setRoomName('');
    setRoomDescription('');
    setIsPublic(false);
    setIsRanked(true);
    setSelectedFriends([]);
    setAvatarFile(null);
    setAvatarPreview(null);
  };

  const handleCreateRoom = async () => {
    if (!user || !userProfile || !roomName.trim()) {
      toast({
        title: t('Error'),
        description: t('Room name cannot be empty'),
        variant: 'destructive',
      });
      return;
    }
    setIsCreatingRoom(true);
    try {
      let avatarURL = '';
      if (avatarFile) {
        const filePath = `room-avatars/${config.id}/${Date.now()}_${
          avatarFile.name
        }`;
        const storageRef = ref(storage, filePath);
        const uploadResult = await uploadBytes(storageRef, avatarFile);
        avatarURL = await getDownloadURL(uploadResult.ref);
      }

      const now = getFinnishFormattedDate();
      const initialMembers = [
        {
          userId: user.uid,
          name: userProfile.name ?? userProfile.displayName ?? '',
          email: userProfile.email ?? '',
          rating: 1000,
          wins: 0,
          losses: 0,
          date: now,
          role: 'admin' as const,
        },
        ...selectedFriends.map((uid) => {
          const f = inviteCandidates.find((x) => x.uid === uid)!;
          return {
            userId: uid,
            name: f.name ?? f.displayName ?? '',
            email: f.email ?? '',
            rating: 1000,
            wins: 0,
            losses: 0,
            date: now,
            role: 'editor' as const,
          };
        }),
      ];

      const superAdmins = await getSuperAdminIds(true);
      const adminIds = withSuperAdmins(user.uid, superAdmins);

      const docRef = await addDoc(collection(db, config.collections.rooms), {
        name: roomName.trim(),
        description: roomDescription.trim(),
        avatarURL,
        creator: user.uid,
        creatorName: userProfile.name ?? userProfile.displayName ?? '',
        createdAt: now,
        members: initialMembers,
        isPublic,
        isRanked,
        memberIds: [user.uid, ...selectedFriends],
        adminIds,
        isArchived: false,
        seasonHistory: [],
      });

      const batch = writeBatch(db);
      batch.update(doc(db, 'users', user.uid), {
        rooms: arrayUnion(docRef.id),
      });
      selectedFriends.forEach((uid) => {
        batch.update(doc(db, 'users', uid), { rooms: arrayUnion(docRef.id) });
      });
      await batch.commit();

      toast({
        title: t('Success'),
        description: `${t('Room')} "${roomName.trim()}" ${t('created')}`,
      });

      resetForm();
      setIsOpen(false);
      onSuccess?.();
      router.push(`/rooms/${docRef.id}`);
    } catch (e) {
      console.error(e);
      toast({
        title: t('Error'),
        description: t('Failed to create room'),
        variant: 'destructive',
      });
    } finally {
      setIsCreatingRoom(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button size='lg'>
          <PlusCircle className='mr-2 h-5 w-5' />
          {t('Create New Room')}
        </Button>
      </DialogTrigger>
      <DialogContent className='sm:max-w-lg'>
        <DialogHeader>
          <DialogTitle>{t('Create a Match Room')}</DialogTitle>
          <DialogDescription>
            {t(
              'Set up a new space to track matches and stats with your friends.'
            )}
          </DialogDescription>
        </DialogHeader>

        <div className='grid gap-6 py-4'>
          <div className='flex flex-col items-center gap-4'>
            <Avatar className='h-24 w-24'>
              <AvatarImage src={avatarPreview ?? undefined} />
              <AvatarFallback>
                <ImageIcon className='h-10 w-10 text-muted-foreground' />
              </AvatarFallback>
            </Avatar>
            <div className='flex gap-2'>
              <Button
                variant='outline'
                onClick={() => fileInputRef.current?.click()}
              >
                {t('Upload Image')}
              </Button>
              {avatarPreview && (
                <Button
                  variant='ghost'
                  size='icon'
                  onClick={() => {
                    setAvatarFile(null);
                    setAvatarPreview(null);
                  }}
                >
                  <X className='h-4 w-4' />
                </Button>
              )}
            </div>
            <Input
              type='file'
              ref={fileInputRef}
              className='hidden'
              accept='image/png, image/jpeg, image/webp'
              onChange={handleFileChange}
            />
          </div>

          <div className='grid gap-2'>
            <Label htmlFor='roomName'>{t('Room Name')}</Label>
            <Input
              id='roomName'
              value={roomName}
              onChange={(e) => setRoomName(e.target.value)}
              placeholder={t('Office Champs')}
            />
          </div>

          <div className='grid gap-2'>
            <Label htmlFor='roomDescription'>
              {t('Description')} (optional)
            </Label>
            <Textarea
              id='roomDescription'
              value={roomDescription}
              onChange={(e) => setRoomDescription(e.target.value)}
              placeholder={t('A brief description of your room')}
            />
          </div>

          <div className='space-y-4'>
            <div className='flex items-center space-x-2'>
              <Checkbox
                id='isPublic'
                checked={isPublic}
                onCheckedChange={(c) => setIsPublic(Boolean(c))}
              />
              <Label htmlFor='isPublic'>{t('Make room public?')}</Label>
            </div>
            <div className='flex items-start space-x-2'>
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

          <div>
            <Label className='text-sm font-medium'>
              {t('Invite players:')}
            </Label>
            <ScrollArea className='h-32 mt-2 border rounded-md p-2'>
              {inviteCandidates.length > 0 ? (
                inviteCandidates.map((p) => {
                  const displayName = p.name ?? p.displayName ?? '?';
                  return (
                    <label
                      key={p.uid}
                      className='flex items-center gap-2 py-1.5 px-2 rounded hover:bg-muted'
                    >
                      <Checkbox
                        checked={selectedFriends.includes(p.uid)}
                        onCheckedChange={(v) =>
                          v
                            ? setSelectedFriends([...selectedFriends, p.uid])
                            : setSelectedFriends(
                                selectedFriends.filter((id) => id !== p.uid)
                              )
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
                })
              ) : (
                <p className='text-muted-foreground text-sm text-center py-4'>
                  {t('No friends available to invite.')}
                </p>
              )}
            </ScrollArea>
          </div>
        </div>

        <DialogFooter>
          <Button onClick={handleCreateRoom} disabled={isCreatingRoom}>
            {isCreatingRoom ? t('Creating…') : t('Create Room')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
