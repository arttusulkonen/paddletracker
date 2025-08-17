// src/components/seo/DynamicTitle.tsx
'use client';

import { useSport } from '@/contexts/SportContext';
import { usePathname } from 'next/navigation';
import { useEffect } from 'react';

const APP_NAME = 'Smashlog';

export default function DynamicTitle() {
  const { config } = useSport();
  const pathname = usePathname();

  useEffect(() => {
    document.title = `${APP_NAME} — ${config.name}`;
  }, [config.name, pathname]);

  return null;
}
