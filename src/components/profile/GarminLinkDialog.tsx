'use client';

import { Button } from '@/components/ui/button';
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import type { UserProfile } from '@/lib/types';
import { Loader2, Trash2, Watch } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

export const GarminLinkDialog = ({
  profile,
  onUpdate,
}: {
  profile: UserProfile;
  onUpdate: () => void;
}) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { user } = useAuth(); // Подтягиваем активного юзера для токена
  const [isOpen, setIsOpen] = useState(false);
  const [code, setCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Безопасный каст с добавлением опционального флага
  const isLinked = !!(profile as UserProfile & { hasGarminDevice?: boolean })
    .hasGarminDevice;

  const handleLink = async () => {
    if (!code || code.length !== 6 || !user) return;
    setIsLoading(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/garmin/link', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ action: 'link', code }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        toast({
          title: t('Success!'),
          description: t('Garmin watch is now linked.'),
        });
        setIsOpen(false);
        setCode('');
        onUpdate();
      } else {
        toast({
          title: t('Error linking watch'),
          description: data.error || t('Unknown error'),
          variant: 'destructive',
        });
      }
    } catch (error: any) {
      toast({
        title: t('Error'),
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleUnlink = async () => {
    if (!user) return;
    setIsLoading(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/garmin/link', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ action: 'unlink' }),
      });

      if (res.ok) {
        toast({
          title: t('Unlinked'),
          description: t('Your watch has been disconnected.'),
        });
        onUpdate();
      } else {
        let errorMessage = t('Failed to disconnect your watch.');
        try {
          const data = await res.json();
          if (data?.error) {
            errorMessage = data.error;
          }
        } catch {
          // Игнорируем ошибки парсинга, оставляем стандартное сообщение
        }
        toast({
          title: t('Error unlinking watch'),
          description: errorMessage,
          variant: 'destructive',
        });
      }
    } catch (error: any) {
      toast({
        title: t('Error'),
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button
          variant='outline'
          className={`w-full gap-3 font-black uppercase tracking-widest h-14 rounded-2xl shadow-sm transition-all ${isLinked ? 'border-emerald-500/50 text-emerald-600 bg-emerald-500/5' : 'border-primary/20 hover:bg-primary/5 hover:text-primary'}`}
        >
          <Watch className='h-5 w-5' />
          {isLinked ? t('Manage Devices') : t('Link Garmin Watch')}
        </Button>
      </DialogTrigger>

      <DialogContent className='sm:max-w-md rounded-[2rem] p-8'>
        <DialogHeader className='mb-4'>
          <div
            className={`mx-auto p-4 rounded-full w-fit mb-4 ${isLinked ? 'bg-emerald-500/10' : 'bg-primary/10'}`}
          >
            <Watch
              className={`h-8 w-8 ${isLinked ? 'text-emerald-500' : 'text-primary'}`}
            />
          </div>
          <DialogTitle className='uppercase font-black tracking-tighter text-2xl text-center'>
            {isLinked ? t('Connected Devices') : t('Link Garmin')}
          </DialogTitle>
          {!isLinked && (
            <DialogDescription className='text-center text-sm mt-2'>
              {t(
                'Open the Smashlog app on your Garmin watch, select "Link Profile", and enter the 6-digit code shown on the screen.',
              )}
            </DialogDescription>
          )}
        </DialogHeader>

        {isLinked ? (
          <div className='flex flex-col gap-4 mt-2'>
            <div className='p-4 border border-border rounded-2xl flex items-center justify-between bg-muted/30'>
              <div className='flex flex-col'>
                <span className='font-black text-foreground'>
                  {t('Garmin Watch')}
                </span>
                <span className='text-xs font-bold text-emerald-500 uppercase tracking-widest'>
                  {t('Active')}
                </span>
              </div>
              <Button
                size='icon'
                variant='ghost'
                className='text-destructive hover:bg-destructive/10'
                onClick={handleUnlink}
                disabled={isLoading}
              >
                {isLoading ? (
                  <Loader2 className='h-5 w-5 animate-spin' />
                ) : (
                  <Trash2 className='h-5 w-5' />
                )}
              </Button>
            </div>
          </div>
        ) : (
          <div className='flex flex-col gap-6'>
            <Input
              placeholder='123456'
              value={code}
              onChange={(e) =>
                setCode(e.target.value.replace(/\D/g, '').slice(0, 6))
              }
              className='text-center text-4xl font-mono tracking-[0.5em] h-20 rounded-2xl bg-muted/50 border-border shadow-inner focus-visible:ring-primary'
              maxLength={6}
            />
            <Button
              onClick={handleLink}
              disabled={isLoading || code.length !== 6}
              className='h-16 text-lg font-black uppercase tracking-widest rounded-2xl w-full'
            >
              {isLoading ? (
                <Loader2 className='h-6 w-6 animate-spin mr-3' />
              ) : null}
              {t('Verify & Link')}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
