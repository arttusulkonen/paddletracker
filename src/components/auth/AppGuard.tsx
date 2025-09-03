// src/components/auth/AppGuard.tsx
'use client';

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
    if (!user) {
      const qs = searchParams?.toString();
      const next = qs ? `${pathname}?${qs}` : pathname;
      router.replace(`/login?next=${encodeURIComponent(next || '/')}`);
      return;
    }
    if (user && userProfile && userProfile.approved === false) {
      router.replace('/login?pending=1');
      return;
    }
  }, [loading, user, userProfile, isPublic, pathname, searchParams, router]);

  if (isPublic) return <>{children}</>;
  if (loading) {
    return (
      <div className='flex items-center justify-center min-h-[50vh]'>
        <div className='animate-spin h-10 w-10 rounded-full border-b-2 border-primary' />
      </div>
    );
  }
  if (!user) return null;
  if (userProfile && userProfile.approved === false) return null;
  return <>{children}</>;
}
