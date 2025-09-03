// src/components/ProtectedRoutes.tsx
'use client';

import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { useEffect, useRef } from 'react';

interface ProtectedRouteProps {
  children: ReactNode;
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const redirectedRef = useRef(false);

  useEffect(() => {
    if (loading) return;
    if (user) {
      redirectedRef.current = false;
      return;
    }
    if (redirectedRef.current) return;

    redirectedRef.current = true;

    const { pathname, search, hash } = window.location;
    const full = `${pathname}${search}${hash}`;
    const redirectParam = encodeURIComponent(full || '/');
    router.replace(`/login?redirect=${redirectParam}`);
  }, [user, loading, router]);

  if (loading) {
    return (
      <div className='flex items-center justify-center min-h-screen'>
        <div className='animate-spin rounded-full h-16 w-16 border-b-4 border-primary' />
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return <>{children}</>;
}
