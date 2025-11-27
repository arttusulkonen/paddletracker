// src/app/providers.tsx
'use client';

import { Footer } from '@/components/layout/Footer';
import { Navbar } from '@/components/layout/Navbar';
import ScrollToTopButton from '@/components/layout/ScrollToTopButton';
import { Toaster } from '@/components/ui/toaster';
import { AuthProvider } from '@/contexts/AuthContext';
import { SportProvider } from '@/contexts/SportContext';
import i18n, { fetchAndMergeTranslations } from '@/lib/i18n';
import { useEffect, useState } from 'react';
import { I18nextProvider } from 'react-i18next';

export default function Providers({ children }: { children: React.ReactNode }) {
  const [isI18nInitialized, setIsI18nInitialized] = useState(false);

  useEffect(() => {
    // ─────────────────────────────────────────────────────────────
    // 1. CLIENT-SIDE DOMAIN REDIRECT (Самый надежный способ для Firebase)
    // Если Middleware не сработал из-за кеша, этот код перекинет пользователя.
    // ─────────────────────────────────────────────────────────────
    if (typeof window !== 'undefined') {
      const hostname = window.location.hostname;
      const oldDomains = [
        'tabletennis-f4c23.web.app',
        'tabletennis-f4c23.firebaseapp.com',
      ];

      if (oldDomains.includes(hostname)) {
        // Используем replace, чтобы пользователь не мог нажать "Назад" и вернуться на старый домен
        window.location.replace(
          'https://smashlog.fi' +
            window.location.pathname +
            window.location.search
        );
        return; // Прерываем дальнейшую загрузку на старом домене
      }
    }
    const init = async () => {
      const currentLang = i18n.language;
      await fetchAndMergeTranslations(currentLang);
      setIsI18nInitialized(true);
    };
    init();
  }, []);

  if (!isI18nInitialized) {
    return (
      <div className='flex items-center justify-center min-h-screen'>
        <div className='loader'></div>
        <p className='mt-4'></p>
        <style jsx>{`
          .loader {
            border: 4px solid rgba(0, 0, 0, 0.1);
            border-left-color: #000;
            width: 40px;
            height: 40px;
            border-radius: 50%;
            animation: spin 1s linear infinite;
          }
          @keyframes spin {
            to {
              transform: rotate(360deg);
            }
          }
        `}</style>
      </div>
    );
  }

  return (
    <I18nextProvider i18n={i18n}>
      <AuthProvider>
        <SportProvider>
          <Navbar />
          <main className='flex-grow'>{children}</main>
          <Toaster />
          <ScrollToTopButton />
        </SportProvider>
      </AuthProvider>
    </I18nextProvider>
  );
}
