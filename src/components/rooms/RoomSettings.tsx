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
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Separator,
  // ✅ Импортируем нужные компоненты
  Textarea,
} from '@/components/ui';
import { useToast } from '@/hooks/use-toast';
// ✅ Импортируем storage для загрузки файлов
import { useSport } from '@/contexts/SportContext';
import { db, storage } from '@/lib/firebase';
import type { Room } from '@/lib/types';
import { doc, updateDoc } from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { useRouter } from 'next/navigation';
// ✅ Добавляем useRef для файлового инпута
import { Image as ImageIcon, X } from 'lucide-react';
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

  // Состояния формы
  const [name, setName] = useState(room.name);
  const [description, setDescription] = useState(room.description ?? ''); // ✅ Состояние для описания
  const [isPublic, setIsPublic] = useState(room.isPublic);
  const [isSaving, setIsSaving] = useState(false);
  const [isActing, setIsActing] = useState(false);

  // ✅ Состояния для аватара
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(
    room.avatarURL ?? null
  );
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ✅ Обработчик выбора файла
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setAvatarFile(file);
      setAvatarPreview(URL.createObjectURL(file));
    }
  };

  // ✅ Функция сохранения теперь умеет загружать аватар
  const handleSave = async () => {
    setIsSaving(true);
    try {
      const updateData: Partial<Room> = {
        name,
        description,
        isPublic,
      };

      if (avatarFile) {
        const filePath = `room-avatars/${sport}/${Date.now()}_${
          avatarFile.name
        }`;
        const storageRef = ref(storage, filePath);
        const uploadResult = await uploadBytes(storageRef, avatarFile);
        updateData.avatarURL = await getDownloadURL(uploadResult.ref);
      }

      await updateDoc(doc(db, config.collections.rooms, room.id), updateData);
      toast({ title: t('Settings saved successfully') });
      // Можно добавить перезагрузку страницы или обновление состояния, чтобы изменения были видны сразу
      router.refresh();
    } catch (error) {
      console.error(error);
      toast({ title: t('Error saving settings'), variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleArchive = async () => {
    setIsActing(true);
    try {
      await updateDoc(doc(db, 'rooms', room.id), {
        isArchived: true,
        archivedAt: new Date().toISOString(),
      });
      toast({ title: t('Room archived') });
      router.push('/rooms');
    } catch (error) {
      toast({ title: t('Error archiving room'), variant: 'destructive' });
    } finally {
      setIsActing(false);
    }
  };

  const handleUnarchive = async () => {
    setIsActing(true);
    try {
      await updateDoc(doc(db, 'rooms', room.id), { isArchived: false });
      toast({ title: t('Room unarchived') });
    } catch (error) {
      toast({ title: t('Error unarchiving room'), variant: 'destructive' });
    } finally {
      setIsActing(false);
    }
  };

  return (
    <DialogContent className='sm:max-w-lg'>
      <DialogHeader>
        <DialogTitle>{t('Room Settings')}</DialogTitle>
        <DialogDescription>
          {t("Manage your room's details and settings.")}
        </DialogDescription>
      </DialogHeader>
      <div className='space-y-6 py-4 max-h-[70vh] overflow-y-auto pr-4'>
        {/* ✅ Блок загрузки аватара */}
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
            {avatarPreview && room.avatarURL && (
              <Button
                variant='ghost'
                size='icon'
                onClick={() => {
                  setAvatarFile(null);
                  setAvatarPreview(room.avatarURL);
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
          <Label htmlFor='room-name'>{t('Room Name')}</Label>
          <Input
            id='room-name'
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        {/* ✅ Поле для описания */}
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
                  <AlertDialogTitle>{t('Archive this room?')}</AlertDialogTitle>
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
