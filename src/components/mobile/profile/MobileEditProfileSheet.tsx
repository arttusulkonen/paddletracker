// src/components/mobile/profile/MobileEditProfileSheet.tsx
'use client';

import {
	Avatar,
	AvatarFallback,
	AvatarImage,
	Button,
	Input,
	Label,
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
	Sheet,
	SheetContent,
	SheetFooter,
	SheetHeader,
	SheetTitle,
	Textarea,
} from '@/components/ui';
import { Sport, sportConfig, useSport } from '@/contexts/SportContext';
import { useToast } from '@/hooks/use-toast';
import { auth, db, storage } from '@/lib/firebase';
import type { UserProfile } from '@/lib/types';
import { updateProfile } from 'firebase/auth';
import { doc, updateDoc } from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

export default function MobileEditProfileSheet({
  open,
  onOpenChange,
  profile,
  onUpdated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  profile: UserProfile;
  onUpdated: () => void;
}) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { updateActiveSport } = useSport();

  const [name, setName] = useState(profile.displayName ?? profile.name ?? '');
  const [bio, setBio] = useState(profile.bio ?? '');
  const [activeSport, setActiveSport] = useState<Sport>(
    profile.activeSport ?? 'pingpong'
  );
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(
    profile.photoURL ?? null
  );
  const [saving, setSaving] = useState(false);

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast({
        title: t('File is too large'),
        description: t('Please select an image smaller than 2MB.'),
        variant: 'destructive',
      });
      return;
    }
    setImageFile(file);
    const r = new FileReader();
    r.onloadend = () => setPreview(r.result as string);
    r.readAsDataURL(file);
  };

  const onSave = async () => {
    if (!profile || !db || !storage) {
      toast({
        title: t('Error'),
        description: t('Service unavailable'),
        variant: 'destructive',
      });
      return;
    }

    setSaving(true);
    try {
      let photoURL = profile.photoURL ?? null;
      if (imageFile) {
        const key = `avatars/${profile.uid}/${Date.now()}_${imageFile.name}`;
        const sref = ref(storage, key);
        await uploadBytes(sref, imageFile);
        photoURL = await getDownloadURL(sref);
      }

      await updateDoc(doc(db, 'users', profile.uid), {
        displayName: name.trim(),
        name: name.trim(),
        bio: bio.trim(),
        photoURL,
        activeSport,
      } satisfies Partial<UserProfile>);

      if (auth && auth.currentUser) {
        await updateProfile(auth.currentUser, {
          displayName: name.trim(),
          photoURL: photoURL ?? undefined,
        });
      }

      await updateActiveSport(activeSport);
      toast({ title: t('Profile updated successfully!') });
      onUpdated();
      onOpenChange(false);
    } catch {
      toast({ title: t('Failed to update profile'), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side='bottom' className='max-h-[92vh] overflow-y-auto'>
        <SheetHeader>
          <SheetTitle>{t('Edit Profile')}</SheetTitle>
        </SheetHeader>

        <div className='mt-4 space-y-4'>
          <div className='flex items-center gap-4'>
            <Avatar className='h-16 w-16'>
              <AvatarImage src={preview ?? undefined} />
              <AvatarFallback>
                {(name || profile.name || '?').charAt(0)}
              </AvatarFallback>
            </Avatar>
            <div className='flex-1'>
              <Label htmlFor='avatar'>{t('Profile Picture')}</Label>
              <Input
                id='avatar'
                type='file'
                accept='image/png,image/jpeg'
                onChange={onPick}
              />
            </div>
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
              rows={3}
            />
          </div>

          <div className='space-y-2'>
            <Label>{t('Default Sport')}</Label>
            <Select
              value={activeSport}
              onValueChange={(v) => setActiveSport(v as Sport)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(sportConfig) as Sport[]).map((s) => (
                  <SelectItem key={s} value={s}>
                    {sportConfig[s].name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <SheetFooter className='mt-6'>
          <Button variant='outline' onClick={() => onOpenChange(false)}>
            {t('Cancel')}
          </Button>
          <Button onClick={onSave} disabled={saving}>
            {saving ? t('Saving...') : t('Save')}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
