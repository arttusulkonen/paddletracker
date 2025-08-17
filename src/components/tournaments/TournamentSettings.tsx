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
import type { TournamentRoom } from '@/lib/types';
import { deleteDoc, doc, updateDoc } from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { Image as ImageIcon, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

interface Props {
  tournament: TournamentRoom;
}

export function TournamentSettingsDialog({ tournament }: Props) {
  const { t } = useTranslation();
  const router = useRouter();
  const { toast } = useToast();
  const { sport } = useSport();

  const [name, setName] = useState(tournament.name);
  const [description, setDescription] = useState<string>(
    ((tournament as any).description as string) ?? ''
  );
  const [isSaving, setIsSaving] = useState(false);
  const [isActing, setIsActing] = useState(false);

  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(
    ((tournament as any).avatarURL as string) ?? null
  );
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setAvatarFile(file);
      setAvatarPreview(URL.createObjectURL(file));
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const updateData: Partial<
        TournamentRoom & { avatarURL?: string; description?: string }
      > = {
        name,
        description,
      };
      if (avatarFile) {
        const filePath = `tournament-avatars/${sport}/${Date.now()}_${
          avatarFile.name
        }`;
        const storageRef = ref(storage, filePath);
        const uploadResult = await uploadBytes(storageRef, avatarFile);
        updateData.avatarURL = await getDownloadURL(uploadResult.ref);
      }
      await updateDoc(
        doc(db, 'tournament-rooms', tournament.id),
        updateData as any
      );
      toast({ title: t('Settings saved successfully') });
      router.refresh();
    } catch {
      toast({ title: t('Error saving settings'), variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    setIsActing(true);
    try {
      await deleteDoc(doc(db, 'tournament-rooms', tournament.id));
      toast({ title: t('Success') });
      router.push('/tournaments');
    } catch {
      toast({ title: t('Something went wrong'), variant: 'destructive' });
    } finally {
      setIsActing(false);
    }
  };

  return (
    <DialogContent className='sm:max-w-lg'>
      <DialogHeader>
        <DialogTitle>{t('Settings')}</DialogTitle>
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
          <div className='flex gap-2'>
            <Button
              variant='outline'
              onClick={() => fileInputRef.current?.click()}
            >
              {t('Change Image')}
            </Button>
            {avatarPreview && (tournament as any).avatarURL && (
              <Button
                variant='ghost'
                size='icon'
                onClick={() => {
                  setAvatarFile(null);
                  setAvatarPreview((tournament as any).avatarURL);
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

        <div className='space-y-2'>
          <Label htmlFor='tournament-name'>{t('Name')}</Label>
          <Input
            id='tournament-name'
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        <div className='space-y-2'>
          <Label htmlFor='tournament-description'>{t('Description')}</Label>
          <Textarea
            id='tournament-description'
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        <Separator />

        <div className='space-y-2'>
          <h4 className='font-medium text-destructive'>{t('Danger Zone')}</h4>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant='destructive'
                className='w-full'
                disabled={isActing}
              >
                {t('Delete')}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{t('Are you sure?')}</AlertDialogTitle>
                <AlertDialogDescription>
                  {t('This action cannot be undone.')}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{t('Cancel')}</AlertDialogCancel>
                <AlertDialogAction onClick={handleDelete}>
                  {t('Yes, Delete this Tournament')}
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
  );
}
