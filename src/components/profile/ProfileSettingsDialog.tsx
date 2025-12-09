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
	Switch,
	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger,
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
import { Image as ImageIcon, Trash2, UserPlus, UserX } from 'lucide-react';
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
      <DialogContent className='sm:max-w-xl max-h-[85vh] overflow-hidden flex flex-col p-0 gap-0'>
        <DialogHeader className='p-6 pb-4'>
          <DialogTitle>{t('Profile Settings')}</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue='general' className='flex-1 overflow-hidden flex flex-col'>
          <div className='px-6'>
            <TabsList className='grid w-full grid-cols-3'>
              <TabsTrigger value='general'>{t('General')}</TabsTrigger>
              <TabsTrigger value='friends'>
                {t('Friends')}
                {friends.length > 0 && <span className="ml-2 text-xs opacity-70">({friends.length})</span>}
              </TabsTrigger>
              <TabsTrigger value='danger'>{t('Danger')}</TabsTrigger>
            </TabsList>
          </div>

          <div className='flex-1 overflow-y-auto p-6'>
            <TabsContent value='general' className='space-y-6 mt-0'>
              <div className='flex items-start gap-6'>
                <div className='flex flex-col items-center gap-3'>
                  <Avatar className='h-24 w-24 border-2 border-border shadow-sm'>
                    <AvatarImage src={avatarPreview ?? undefined} className='object-cover' />
                    <AvatarFallback className='text-2xl'>
                      {(name || 'U').charAt(0)}
                    </AvatarFallback>
                  </Avatar>
                  
                  <div className='flex flex-col gap-2 w-full'>
                    <Button
                      size='sm'
                      variant='outline'
                      onClick={() => fileInputRef.current?.click()}
                      className='w-full'
                    >
                      {t('Change')}
                    </Button>
                    {!!(avatarPreview || profile.photoURL) && (
                      <Button
                        size='sm'
                        variant='ghost'
                        className='text-destructive hover:text-destructive h-auto py-1 px-2'
                        onClick={() => {
                          setAvatarBlob(null);
                          setAvatarSrc(null);
                          setAvatarPreview(null);
                          setMarkRemove(true);
                          setUploadPct(0);
                        }}
                      >
                        {t('Remove')}
                      </Button>
                    )}
                  </div>
                  
                  <input
                    type='file'
                    ref={fileInputRef}
                    className='hidden'
                    accept='image/png,image/jpeg,image/webp'
                    onChange={pick}
                  />
                  {uploadPct > 0 && (
                    <span className='text-[10px] text-muted-foreground'>
                      {uploadPct}%
                    </span>
                  )}
                </div>

                <div className='flex-1 space-y-4'>
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
                      placeholder={t('Tell us about yourself...')}
                      rows={3}
                      className='resize-none'
                    />
                  </div>
                </div>
              </div>

              <div className='space-y-4 pt-2'>
                <div className='grid grid-cols-1 sm:grid-cols-2 gap-4'>
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
                </div>

                <div className='flex items-center justify-between space-x-2 border rounded-lg p-4 bg-muted/20'>
                  <div className='space-y-0.5'>
                    <Label htmlFor='isPublic' className='text-base'>
                      {t('Public Profile')}
                    </Label>
                    <p className='text-sm text-muted-foreground'>
                      {t('Allow others to find and view your profile.')}
                    </p>
                  </div>
                  <Switch
                    id='isPublic'
                    checked={isPublic}
                    onCheckedChange={setIsPublic}
                  />
                </div>
              </div>
            </TabsContent>

            <TabsContent value='friends' className='space-y-4 mt-0 h-full flex flex-col'>
               <div className='flex items-center justify-between mb-2'>
                  <h3 className='font-medium'>{t('Your Friends')}</h3>
                  <span className='text-sm text-muted-foreground'>{friends.length} {t('total')}</span>
               </div>
               
               <ScrollArea className='flex-1 -mx-2 px-2'>
                <div className='space-y-2'>
                  {friends.length > 0 ? (
                    friends.map((f) => (
                      <div
                        key={f.uid}
                        className='flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors'
                      >
                        <div className='flex items-center gap-3'>
                          <Avatar className='h-8 w-8'>
                            <AvatarImage src={f.photoURL} />
                            <AvatarFallback>{f.name?.[0]}</AvatarFallback>
                          </Avatar>
                          <span className='font-medium text-sm'>{f.name}</span>
                        </div>
                        <Button
                          variant='ghost'
                          size='sm'
                          className='text-muted-foreground hover:text-destructive'
                          onClick={async () => {
                            await Friends.unfriend(profile.uid, f.uid);
                            setFriends((current) =>
                              current.filter((fr) => fr.uid !== f.uid)
                            );
                            toast({ title: t('Friend removed') });
                          }}
                        >
                          <UserX className='h-4 w-4 mr-2' />
                          {t('Unfriend')}
                        </Button>
                      </div>
                    ))
                  ) : (
                    <div className='flex flex-col items-center justify-center py-12 text-center text-muted-foreground'>
                      <UserPlus className='h-12 w-12 opacity-20 mb-3' />
                      <p>{t('No friends yet.')}</p>
                      <p className='text-xs mt-1'>{t('Search for players to add them.')}</p>
                    </div>
                  )}
                </div>
              </ScrollArea>
            </TabsContent>

            <TabsContent value='danger' className='space-y-4 mt-0'>
              <div className='border border-destructive/20 rounded-lg p-4 bg-destructive/5 space-y-4'>
                <div className='flex items-start gap-4'>
                  <div className='p-2 bg-destructive/10 rounded-full text-destructive shrink-0'>
                    <Trash2 className='h-5 w-5' />
                  </div>
                  <div className='space-y-1'>
                    <h4 className='font-medium text-destructive'>{t('Delete Account')}</h4>
                    <p className='text-sm text-muted-foreground leading-relaxed'>
                      {t('This action is irreversible. It will permanently delete your account, remove your personal data, and anonymize your match history across all rooms.')}
                    </p>
                  </div>
                </div>
                
                <div className='pt-2 flex justify-end'>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant='destructive'>
                        {t('Delete My Account')}
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>
                          {t('Are you absolutely sure?')}
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                          {t(
                            'This will permanently delete your account. You will not be able to recover your data.'
                          )}
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>{t('Cancel')}</AlertDialogCancel>
                        <AlertDialogAction onClick={handleAccountDelete} className='bg-destructive text-destructive-foreground hover:bg-destructive/90'>
                          {t('Yes, Delete Everything')}
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
          <Button onClick={handleSave} disabled={isSaving} className='w-full sm:w-auto'>
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