// src/components/ProtectedRoutes.tsx
"use client";

import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { useEffect } from 'react';

interface ProtectedRouteProps {
  children: ReactNode;
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { user, loading } = useAuth();
  const router = useRouter();
console.log('ProtectedRoute rendered', { user, loading });
  useEffect(() => {
    if (!loading && !user) {
      router.push('/login?redirect=' + window.location.pathname);
    }
  }, [user, loading, router]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-primary"></div>
      </div>
    );
  }

  if (!user) {
    // This return is mostly for the brief moment before redirect or if redirect fails.
    // The useEffect should handle the redirect.
    return null; 
  }

  return <>{children}</>;
}

// Example usage for a page:
// export default function ProtectedPage() {
//   return (
//     <ProtectedRoute>
//       <div>This is a protected page.</div>
//     </ProtectedRoute>
//   );
// }

// For layout-based protection, wrap the layout's children or apply in specific layout files.
