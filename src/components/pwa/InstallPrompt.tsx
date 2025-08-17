// src/components/pwa/InstallPrompt.tsx
'use client';

import { Button } from '@/components/ui';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};

export default function InstallPrompt() {
  const { t } = useTranslation();
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(
    null
  );
  const [open, setOpen] = useState(false);
  const [iosTip, setIosTip] = useState(false);

  const isStandalone = useMemo(() => {
    if (typeof window === 'undefined') return false;
    if ((window.navigator as any).standalone) return true;
    return window.matchMedia?.('(display-mode: standalone)').matches ?? false;
  }, []);

  const isIOS = useMemo(() => {
    if (typeof navigator === 'undefined') return false;
    return /iPad|iPhone|iPod/.test(navigator.userAgent);
  }, []);

  useEffect(() => {
    if (isStandalone) return;

    const dismissed = localStorage.getItem('pwa-install-dismissed') === '1';
    const iosDismissed = localStorage.getItem('pwa-ios-tip-dismissed') === '1';

    const onBIP = (e: Event) => {
      e.preventDefault();
      if (dismissed || isIOS) return;
      setDeferred(e as BeforeInstallPromptEvent);
      setOpen(true);
    };

    window.addEventListener('beforeinstallprompt', onBIP as any);

    if (!dismissed && isIOS && !iosDismissed) {
      setIosTip(true);
    }

    const onInstalled = () => {
      setOpen(false);
      setIosTip(false);
      localStorage.removeItem('pwa-install-dismissed');
      localStorage.removeItem('pwa-ios-tip-dismissed');
    };
    window.addEventListener('appinstalled', onInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', onBIP as any);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, [isStandalone, isIOS]);

  if (isStandalone) return null;

  return (
    <>
      {open && (
        <div className='fixed inset-x-0 bottom-0 z-50 md:hidden'>
          <div className='mx-3 mb-3 rounded-xl border bg-card p-3 shadow-lg'>
            <div className='mb-2 text-sm font-medium'>
              {t('pwa.install.title', { app: 'Smashlog' })}
            </div>
            <div className='mb-3 text-xs text-muted-foreground'>
              {t('pwa.install.body')}
            </div>
            <div className='flex items-center gap-2'>
              <Button
                onClick={async () => {
                  if (!deferred) return;
                  await deferred.prompt();
                  const choice = await deferred.userChoice;
                  if (choice.outcome === 'accepted') {
                    setOpen(false);
                    setDeferred(null);
                  } else {
                    localStorage.setItem('pwa-install-dismissed', '1');
                    setOpen(false);
                    setDeferred(null);
                  }
                }}
              >
                {t('pwa.install.cta')}
              </Button>
              <Button
                variant='outline'
                onClick={() => {
                  localStorage.setItem('pwa-install-dismissed', '1');
                  setOpen(false);
                  setDeferred(null);
                }}
              >
                {t('pwa.install.later')}
              </Button>
            </div>
          </div>
        </div>
      )}

      {iosTip && (
        <div className='fixed inset-x-0 bottom-0 z-50 md:hidden'>
          <div className='mx-3 mb-3 rounded-xl border bg-card p-3 shadow-lg'>
            <div className='mb-2 text-sm font-medium'>{t('pwa.ios.title')}</div>
            <div className='mb-3 text-xs text-muted-foreground'>
              {t('pwa.ios.body')}
            </div>
            <div className='flex items-center gap-2'>
              <Button
                variant='outline'
                onClick={() => {
                  localStorage.setItem('pwa-ios-tip-dismissed', '1');
                  setIosTip(false);
                }}
              >
                {t('pwa.ok')}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
