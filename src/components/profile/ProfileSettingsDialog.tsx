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
  Textarea,
} from '@/components/ui';
import { useAuth } from '@/contexts/AuthContext';
import { Sport, sportConfig, useSport } from '@/contexts/SportContext';
import { useToast } from '@/hooks/use-toast';
import { auth, db, storage } from '@/lib/firebase';
import * as Friends from '@/lib/friends';
import { UserProfile } from '@/lib/types';
import { updateProfile } from 'firebase/auth';
import { doc, updateDoc } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import {
  deleteObject,
  getDownloadURL,
  ref,
  uploadBytesResumable,
} from 'firebase/storage';
import { Image as ImageIcon, Trash2, UserX } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

interface ProfileSettingsDialogProps {
  profile: UserProfile;
  onUpdate: () => void;
}

export function ProfileSettingsDialog({
  profile,
  onUpdate,
}: ProfileSettingsDialogProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const router = useRouter();
  const { logout, userProfile } = useAuth();
  const { updateActiveSport } = useSport();

  const [name, setName] = useState(profile.displayName ?? profile.name ?? '');
  const [bio, setBio] = useState(profile.bio ?? '');
  const [isPublic, setIsPublic] = useState(profile.isPublic ?? true);
  const [activeSport, setActiveSport] = useState<Sport>(
    profile.activeSport ?? 'pingpong'
  );
  const [friends, setFriends] = useState<any[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  const [avatarPreview, setAvatarPreview] = useState<string | null>(
    profile.photoURL ?? null
  );
  const [avatarSrc, setAvatarSrc] = useState<string | null>(null);
  const [avatarBlob, setAvatarBlob] = useState<Blob | null>(null);
  const [cropOpen, setCropOpen] = useState(false);
  const [uploadPct, setUploadPct] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [markRemove, setMarkRemove] = useState(false);

  useEffect(() => {
    const load = async () => {
      if (!db || !userProfile?.friends) return;
      const list = await Promise.all(
        userProfile.friends.map((id) => Friends.getUserLite(id))
      );
      setFriends(list.filter(Boolean));
    };
    load();
  }, [userProfile?.friends]);

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
    setUploadPct(0);
    setMarkRemove(false);
  };

  const uploadAvatar = async (): Promise<string> => {
    if (!avatarBlob) return profile.photoURL ?? '';
    const path = `avatars/${profile.uid}/${Date.now()}.jpg`;
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

  const tryDeleteFromStorageByUrl = async (url: string | null | undefined) => {
    if (!url) return;
    try {
      const r = ref(storage, url);
      await deleteObject(r);
    } catch {}
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      let nextPhoto: string | null | undefined = profile.photoURL ?? null;
      if (markRemove) {
        await tryDeleteFromStorageByUrl(profile.photoURL);
        nextPhoto = null;
      } else if (avatarBlob) {
        nextPhoto = await uploadAvatar();
      }

      const payload: Partial<UserProfile> = {
        name: name.trim(),
        displayName: name.trim(),
        bio: bio.trim(),
        isPublic,
        photoURL: nextPhoto ?? null,
        activeSport,
      };

      await updateDoc(doc(db, 'users', profile.uid), payload);
      if (auth.currentUser) {
        await updateProfile(auth.currentUser, {
          displayName: name.trim(),
          photoURL: nextPhoto ?? null,
        });
      }
      if (profile.activeSport !== activeSport) {
        await updateActiveSport(activeSport);
      }
      toast({ title: t('Profile updated successfully!') });
      setUploadPct(0);
      setAvatarBlob(null);
      setMarkRemove(false);
      onUpdate();
      router.refresh();
    } catch {
      toast({ title: t('Failed to update profile'), variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleAccountDelete = async () => {
    try {
      const functions = getFunctions();
      const deleteUserCallable = httpsCallable(
        functions,
        'permanentlyDeleteUser'
      );

      await deleteUserCallable({ userId: profile.uid });

      toast({
        title: t('Account deleted'),
        description: t('You will be logged out.'),
      });

      if (logout) await logout();
      router.push('/');
    } catch (error: any) {
      console.error('Failed to delete account:', error);
      toast({
        title: t('Failed to delete account'),
        description: error.message || 'Please try again later.',
        variant: 'destructive',
      });
    }
  };

  return (
    <>
      <DialogContent className='max-w-3xl'>
        <DialogHeader>
          <DialogTitle>{t('Profile Settings')}</DialogTitle>
        </DialogHeader>
        <div className='py-4 grid grid-cols-1 md:grid-cols-2 gap-8'>
          <div className='space-y-4'>
            <div className='space-y-2'>
              <Label>{t('Profile Picture')}</Label>
              <div className='flex items-center gap-4'>
                <Avatar className='h-20 w-20'>
                  <AvatarImage src={avatarPreview ?? undefined} />
                  <AvatarFallback>{(name || 'U').charAt(0)}</AvatarFallback>
                </Avatar>
                <div className='flex items-center gap-2'>
                  <Button
                    variant='outline'
                    onClick={() => fileInputRef.current?.click()}
                  >
                    {t('Change Image')}
                  </Button>
                  {!!(avatarPreview || profile.photoURL) && (
                    <Button
                      variant='destructive'
                      onClick={() => {
                        setAvatarBlob(null);
                        setAvatarSrc(null);
                        setAvatarPreview(null);
                        setMarkRemove(true);
                        setUploadPct(0);
                      }}
                    >
                      <Trash2 className='h-4 w-4 mr-2' />
                      {t('Remove')}
                    </Button>
                  )}
                </div>
              </div>
              <Input
                type='file'
                ref={fileInputRef}
                className='hidden'
                accept='image/png,image/jpeg,image/webp'
                onChange={pick}
              />
              {uploadPct > 0 && (
                <div className='text-xs text-muted-foreground'>
                  {uploadPct}%
                </div>
              )}
            </div>
            <div className='space-y-2'>
              <Label htmlFor='name'>{t('Display Name')}</Label>
              <Input
                id='name'
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className='space-y-2'>
              <Label htmlFor='bio'>{t('About Me')}</Label>
              <Textarea
                id='bio'
                value={bio}
                onChange={(e) => setBio(e.target.value)}
              />
            </div>
            <div className='space-y-2'>
              <Label htmlFor='default-sport'>{t('Default Sport')}</Label>
              <Select
                value={activeSport}
                onValueChange={(v) => setActiveSport(v as Sport)}
              >
                <SelectTrigger id='default-sport'>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(sportConfig) as Sport[]).map((k) => (
                    <SelectItem key={k} value={k}>
                      {sportConfig[k].name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className='flex items-center space-x-2 pt-2'>
              <Checkbox
                id='isPublic'
                checked={isPublic}
                onCheckedChange={(v) => setIsPublic(!!v)}
              />
              <Label htmlFor='isPublic'>{t('Public Profile')}</Label>
            </div>
          </div>
          <div className='space-y-6'>
            <div>
              <h3 className='font-semibold mb-2'>{t('Friends')}</h3>
              <ScrollArea className='h-48 border rounded-md p-2'>
                {friends.length > 0 ? (
                  friends.map((f) => (
                    <div
                      key={f.uid}
                      className='flex items-center justify-between p-1 hover:bg-muted rounded'
                    >
                      <span>{f.name}</span>
                      <Button
                        variant='ghost'
                        size='icon'
                        className='h-7 w-7'
                        onClick={async () => {
                          await Friends.unfriend(profile.uid, f.uid);
                          setFriends((current) =>
                            current.filter((fr) => fr.uid !== f.uid)
                          );
                          toast({ title: t('Friend removed') });
                        }}
                      >
                        <UserX className='h-4 w-4 text-destructive' />
                      </Button>
                    </div>
                  ))
                ) : (
                  <p className='text-sm text-muted-foreground p-2'>
                    {t('No friends yet.')}
                  </p>
                )}
              </ScrollArea>
            </div>
            <div className='space-y-2 p-4 border border-destructive/50 rounded-md'>
              <h4 className='font-medium text-destructive'>
                {t('Danger Zone')}
              </h4>
              <p className='text-sm text-muted-foreground'>
                {t(
                  'This action cannot be undone. All your personal data will be removed.'
                )}
              </p>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant='destructive' className='w-full'>
                    {t('Delete Account')}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>
                      {t('Are you absolutely sure?')}
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                      {t(
                        'This will permanently delete your account and remove all personal information. Your match history will be anonymized.'
                      )}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>{t('Cancel')}</AlertDialogCancel>
                    <AlertDialogAction onClick={handleAccountDelete}>
                      {t('Yes, Delete My Account')}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
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
