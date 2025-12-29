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
import { containsProfanity } from '@/lib/moderation';
import { getFinnishFormattedDate } from '@/lib/utils';
import { addDoc, collection } from 'firebase/firestore';
import { Loader2, Plus, Warehouse } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

interface CreateCommunityDialogProps {
  trigger?: React.ReactNode;
}

export function CreateCommunityDialog({ trigger }: CreateCommunityDialogProps) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { toast } = useToast();
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [loading, setLoading] = useState(false);

  const handleCreate = async () => {
    if (!name.trim() || !user || !db) return;

    if (containsProfanity(name) || containsProfanity(desc)) {
      toast({
        title: t('Content Warning'),
        description: t('Name or description contains inappropriate words.'),
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);
    try {
      const now = getFinnishFormattedDate();

      const docRef = await addDoc(collection(db!, 'communities'), {
        name: name.trim(),
        description: desc.trim(),
        ownerId: user.uid,
        admins: [user.uid],
        members: [user.uid], 
        roomIds: [],
        createdAt: now,
        avatarURL: null,
      });

      toast({
        title: t('Community Created'),
        description: t('You can now add players and rooms.'),
      });

      setOpen(false);
      setName('');
      setDesc('');
      router.push(`/manage/communities/${docRef.id}`);
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

  if (!user) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button>
            <Plus className='mr-2 h-4 w-4' />
            {t('New Community')}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className='flex items-center gap-2'>
            <Warehouse className='h-5 w-5 text-primary' />
            {t('Create Community')}
          </DialogTitle>
          <DialogDescription>
            {t('Create a group for your office, club, or friends.')}
          </DialogDescription>
        </DialogHeader>

        <div className='space-y-4 py-4'>
          <div className='space-y-2'>
            <Label>{t('Name')} *</Label>
            <Input
              placeholder={t('e.g. Office Ping Pong')}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className='space-y-2'>
            <Label>{t('Description')}</Label>
            <Textarea
              placeholder={t('Optional description...')}
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant='ghost' onClick={() => setOpen(false)}>
            {t('Cancel')}
          </Button>
          <Button onClick={handleCreate} disabled={loading || !name.trim()}>
            {loading && <Loader2 className='mr-2 h-4 w-4 animate-spin' />}
            {t('Create')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}