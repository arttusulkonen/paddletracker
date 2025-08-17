// src/components/pwa/PWAInit.tsx
'use client';

import { useEffect } from 'react';

export default function PWAInit() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
  }, []);
  return null;
}
