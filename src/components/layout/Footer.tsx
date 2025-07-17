// src/components/layout/Footer.tsx

'use client';

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
export function Footer() {
  const { t } = useTranslation();

    // 2. Добавляем "защиту от гидратации"
    const [hasMounted, setHasMounted] = useState(false);
    useEffect(() => {
      setHasMounted(true);
    }, []);
  
    // 3. Если компонент еще не смонтирован, ничего не рендерим (или рендерим заглушку/скелет)
    if (!hasMounted) {
      return null;
    }

  return (
    <footer className='bg-card border-t py-6 text-center text-sm text-muted-foreground'>
      <div className='container mx-auto px-4'>
        <p>
          &copy; {new Date().getFullYear()} PingPongTracker.{' '}
          {t('All rights reserved.')}
        </p>
        <p className='mt-1'>{t('Elevate Your Game.')}</p>
      </div>
    </footer>
  );
}
