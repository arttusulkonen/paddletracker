// src/components/auth/AppGuard.tsx
'use client';

import { AiAssistant } from '@/components/AiAssistant';
import { useAuth } from '@/contexts/AuthContext';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import React, { useEffect, useMemo } from 'react';

const PUBLIC_PATHS = new Set<string>([
  '/',
  '/login',
  '/register',
  '/privacy',
  '/terms',
  '/forgot-password',
]);

// Дата отключения AI: 1 декабря 2025
const AI_CUTOFF_DATE = new Date('2025-12-01').getTime();

const parseCreatedAt = (dateStr?: string) => {
  if (!dateStr) return 0;
  // Ожидаемый формат: "DD.MM.YYYY HH.mm.ss" (финский)
  const parts = dateStr.split(' ');
  const dateParts = parts[0].split('.');
  if (dateParts.length === 3) {
    // new Date(year, monthIndex, day)
    const d = new Date(+dateParts[2], +dateParts[1] - 1, +dateParts[0]);
    return d.getTime();
  }
  return 0;
};

export default function AppGuard({ children }: { children: React.ReactNode }) {
  const { user, userProfile, loading } = useAuth();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();

  const isPublic = useMemo(() => {
    return PUBLIC_PATHS.has(pathname || '/');
  }, [pathname]);

  useEffect(() => {
    if (loading) return;
    if (isPublic) return;

    // Если пользователь не залогинен - редирект на вход
    if (!user) {
      const qs = searchParams?.toString();
      const next = qs ? `${pathname}?${qs}` : pathname;
      router.replace(`/login?next=${encodeURIComponent(next || '/')}`);
      return;
    }

    // УДАЛЕНО: Проверка userProfile.approved === false больше не блокирует вход
  }, [loading, user, userProfile, isPublic, pathname, searchParams, router]);

  // Логика отображения AI
  const showAiAssistant = useMemo(() => {
    if (!user || !userProfile) return false;
    // Если дата создания аккаунта парсится и она БОЛЬШЕ или РАВНА дате отсечения,
    // то считаем пользователя "новым" и скрываем AI.
    // Если даты нет или она старая - показываем.
    const createdTs = parseCreatedAt(userProfile.createdAt);
    const isNewUser = createdTs >= AI_CUTOFF_DATE;

    return !isNewUser;
  }, [user, userProfile]);

  if (isPublic) {
    return (
      <>
        {children}
        {showAiAssistant && <AiAssistant />}
      </>
    );
  }

  if (loading) {
    return (
      <div className='flex items-center justify-center min-h-[50vh]'>
        <div className='animate-spin h-10 w-10 rounded-full border-b-2 border-primary' />
      </div>
    );
  }

  if (!user) return null;

  return (
    <>
      {children}
      {showAiAssistant && <AiAssistant />}
    </>
  );
}
