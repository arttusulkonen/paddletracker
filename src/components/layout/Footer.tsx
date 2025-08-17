// src/components/layout/Footer.tsx

'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

export function Footer() {
  const { t } = useTranslation();

  const [hasMounted, setHasMounted] = useState(false);
  useEffect(() => {
    setHasMounted(true);
  }, []);

  if (!hasMounted) {
    return null;
  }

  return (
    <footer className='bg-card border-t py-6 text-center text-sm text-muted-foreground'>
      <div className='container mx-auto px-4'>
        <div className="flex justify-center gap-4 mb-2">
          <Link href="/privacy" className="hover:text-primary hover:underline">
            {t('Privacy Policy')}
          </Link>
          <Link href="/terms" className="hover:text-primary hover:underline">
            {t('Terms of Service')}
          </Link>
        </div>
        <p>
          &copy; {new Date().getFullYear()} Smashlog.{' '}
          {t('All rights reserved.')}
        </p>
        <p className='mt-1'>{t('Elevate Your Game.')}</p>
      </div>
    </footer>
  );
}