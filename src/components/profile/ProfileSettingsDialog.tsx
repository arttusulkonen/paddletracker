// src/components/profile/ProfileSettingsDialog.tsx
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Slider,
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
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { UserX } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import ReactCrop, { centerCrop, Crop, makeAspectCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';

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

  // Состояния для полей формы
  const [name, setName] = useState(profile.displayName ?? profile.name ?? '');
  const [bio, setBio] = useState(profile.bio ?? '');
  const [isPublic, setIsPublic] = useState(profile.isPublic ?? true);
  const [activeSport, setActiveSport] = useState<Sport>(
    profile.activeSport ?? 'pingpong'
  );

  // Состояния для друзей и UI
  const [friends, setFriends] = useState<any[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  // Состояния для аватара
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(
    profile.photoURL ?? null
  );
  const [crop, setCrop] = useState<Crop>();
  const [isEditingImage, setIsEditingImage] = useState(false);
  const [scale, setScale] = useState(1);
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    const fetchFriends = async () => {
      if (!db || !userProfile?.friends) return;
      const friendProfiles = await Promise.all(
        userProfile.friends.map((id) => Friends.getUserLite(id))
      );
      setFriends(friendProfiles.filter(Boolean));
    };
    fetchFriends();
  }, [userProfile?.friends]);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) {
        // Лимит 2MB
        toast({
          title: t('File is too large'),
          description: t('Please select an image smaller than 2MB.'),
          variant: 'destructive',
        });
        return;
      }
      setImageFile(file);
      const reader = new FileReader();
      reader.onloadend = () => setImagePreview(reader.result as string);
      reader.readAsDataURL(file);
      setIsEditingImage(true);
    }
  };

  const onImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const { width, height } = e.currentTarget;
    const initialCrop = centerCrop(
      makeAspectCrop({ unit: '%', width: 90 }, 1, width, height),
      width,
      height
    );
    setCrop(initialCrop);
  };

  const handleSave = async () => {
    if (!profile || !db) return;
    setIsSaving(true);
    try {
      let photoURL = profile.photoURL;
      if (imageFile) {
        const storageRef = ref(
          storage,
          `avatars/${profile.uid}/${Date.now()}_${imageFile.name}`
        );
        await uploadBytes(storageRef, imageFile);
        photoURL = await getDownloadURL(storageRef);
      }
      const updatedData: Partial<UserProfile> = {
        name: name.trim(),
        displayName: name.trim(),
        bio: bio.trim(),
        isPublic,
        photoURL: photoURL ?? null,
        activeSport: activeSport,
      };
      await updateDoc(doc(db, 'users', profile.uid), updatedData);
      if (profile.activeSport !== activeSport) {
        await updateActiveSport(activeSport);
      }
      if (auth.currentUser) {
        await updateProfile(auth.currentUser, {
          displayName: name.trim(),
          photoURL: photoURL ?? null,
        });
      }
      toast({ title: t('Profile updated successfully!') });
      onUpdate();
    } catch (error) {
      console.error('Profile update error:', error);
      toast({ title: t('Failed to update profile'), variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleAccountDelete = async () => {
    if (!profile || !db) return;
    try {
      await updateDoc(doc(db, 'users', profile.uid), {
        isDeleted: true,
        deletedAt: new Date().toISOString(),
        name: t('Deleted Player'),
        displayName: t('Deleted Player'),
        email: `deleted-${profile.uid}@deleted.com`,
        photoURL: null,
        bio: '',
        friends: [],
        incomingRequests: [],
        outgoingRequests: [],
      });
      toast({
        title: t('Account deleted'),
        description: t('You will be logged out.'),
      });
      if (logout) {
        await logout();
      }
      router.push('/');
    } catch (error) {
      toast({ title: t('Failed to delete account'), variant: 'destructive' });
    }
  };

  return (
    <DialogContent className='max-w-3xl'>
      <DialogHeader>
        <DialogTitle>{t('Profile Settings')}</DialogTitle>
      </DialogHeader>
      <div className='py-4 grid grid-cols-1 md:grid-cols-2 gap-8'>
        <div className='space-y-4'>
          <h3 className='font-semibold'>{t('General')}</h3>
          <div className='space-y-2'>
            <Label>{t('Profile Picture')}</Label>
            <div className='flex items-center gap-4'>
              <Avatar className='h-20 w-20'>
                <AvatarImage
                  src={imagePreview ?? profile.photoURL ?? undefined}
                />
                <AvatarFallback>{name.charAt(0)}</AvatarFallback>
              </Avatar>
              <Input
                id='picture'
                type='file'
                accept='image/png, image/jpeg'
                onChange={handleImageChange}
                className='max-w-xs'
              />
            </div>
            {isEditingImage && imagePreview && (
              <Dialog open={isEditingImage} onOpenChange={setIsEditingImage}>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>{t('Edit your new picture')}</DialogTitle>
                    <DialogDescription>
                      {t('Adjust the zoom and position of your avatar.')}
                    </DialogDescription>
                  </DialogHeader>
                  <div className='p-2 border rounded-md'>
                    <ReactCrop
                      crop={crop}
                      onChange={(c) => setCrop(c)}
                      aspect={1}
                      circularCrop
                    >
                      <img
                        ref={imgRef}
                        src={imagePreview}
                        alt='Crop preview'
                        style={{ transform: `scale(${scale})` }}
                        onLoad={onImageLoad}
                      />
                    </ReactCrop>
                  </div>
                  <div className='space-y-2'>
                    <Label>{t('Zoom')}</Label>
                    <Slider
                      defaultValue={[1]}
                      min={1}
                      max={3}
                      step={0.1}
                      onValueChange={(value) => setScale(value[0])}
                    />
                  </div>
                  <DialogFooter>
                    <Button
                      variant='outline'
                      onClick={() => setIsEditingImage(false)}
                    >
                      {t('Cancel')}
                    </Button>
                    <Button onClick={() => setIsEditingImage(false)}>
                      {t('Apply')}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
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
                {(Object.keys(sportConfig) as Sport[]).map((sportKey) => (
                  <SelectItem key={sportKey} value={sportKey}>
                    {sportConfig[sportKey].name}
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
            <h4 className='font-medium text-destructive'>{t('Danger Zone')}</h4>
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
  );
}
