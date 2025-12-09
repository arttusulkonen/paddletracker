// src/components/communities/CreateCommunityDialog.tsx
'use client';

import {
	Button,
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
	Input,
	Label,
	Textarea,
} from '@/components/ui';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { db } from '@/lib/firebase';
import { getFinnishFormattedDate } from '@/lib/utils';
import { addDoc, collection } from 'firebase/firestore';
import { Loader2, Plus, Users } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

interface CreateCommunityDialogProps {
  trigger?: React.ReactNode;
  onSuccess?: () => void;
}

export function CreateCommunityDialog({
  trigger,
  onSuccess,
}: CreateCommunityDialogProps) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { toast } = useToast();

  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  const handleCreate = async () => {
    if (!user) return;
    if (!name.trim()) {
      toast({
        title: t('Name required'),
        description: t('Please enter a name for your community.'),
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);
    try {
      await addDoc(collection(db, 'communities'), {
        name: name.trim(),
        description: description.trim(),
        ownerId: user.uid,
        admins: [user.uid], // Создатель сразу становится админом
        members: [],
        createdAt: getFinnishFormattedDate(),
        avatarURL: null,
      });

      toast({
        title: t('Success'),
        description: t('Community created successfully.'),
      });

      setOpen(false);
      setName('');
      setDescription('');
      onSuccess?.();
    } catch (error) {
      console.error(error);
      toast({
        title: t('Error'),
        description: t('Failed to create community.'),
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button>
            <Plus className='mr-2 h-4 w-4' />
            {t('Create Community')}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('Create New Community')}</DialogTitle>
          <DialogDescription>
            {t(
              'A community allows you to group players (e.g. "Junior Squad", "Company League") and manage them together.'
            )}
          </DialogDescription>
        </DialogHeader>

        <div className='space-y-4 py-4'>
          <div className='space-y-2'>
            <Label>{t('Community Name')}</Label>
            <Input
              placeholder={t('e.g. Helsinki Juniors 2008')}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className='space-y-2'>
            <Label>{t('Description (Optional)')}</Label>
            <Textarea
              placeholder={t('What is this group about?')}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant='ghost' onClick={() => setOpen(false)}>
            {t('Cancel')}
          </Button>
          <Button onClick={handleCreate} disabled={loading}>
            {loading && <Loader2 className='mr-2 h-4 w-4 animate-spin' />}
            {t('Create')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}