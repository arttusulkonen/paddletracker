// src/app/providers.tsx
'use client';

import { Footer } from '@/components/layout/Footer';
import { Navbar } from '@/components/layout/Navbar';
import { Toaster } from '@/components/ui/toaster';
import { AuthProvider } from '@/contexts/AuthContext';
import i18n, { fetchAndMergeTranslations } from '@/lib/i18n';
import { useEffect, useState } from 'react';
import { I18nextProvider } from 'react-i18next';

export default function Providers({ children }: { children: React.ReactNode }) {
  const [isI18nInitialized, setIsI18nInitialized] = useState(false);

  useEffect(() => {
    const init = async () => {
      // Определяем текущий язык
      const currentLang = i18n.language;
      // Подгружаем для него переводы из Firestore
      await fetchAndMergeTranslations(currentLang);
      // Устанавливаем флаг, что все готово
      setIsI18nInitialized(true);
    };
    init();
  }, []);

  // Показываем заглушку, пока подгружаются переводы
  if (!isI18nInitialized) {
    return (
      <div className='flex items-center justify-center min-h-screen'>
        Loading translations...
      </div>
    );
  }

  return (
    <I18nextProvider i18n={i18n}>
      <AuthProvider>
        <Navbar />
        <main className='flex-grow'>{children}</main>
        <Footer />
        <Toaster />
      </AuthProvider>
    </I18nextProvider>
  );
}
